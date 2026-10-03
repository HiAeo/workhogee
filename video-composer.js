// video-composer.js
// -----------------------------------------------------------------------------
// WorkHogee — pure browser-side MP4 segment concatenator.
//
// Constraints it is built for:
//   * Hosted on GitHub Pages (static, no COOP/COEP) → no SharedArrayBuffer,
//     no multi-threaded ffmpeg.wasm.
//   * Cloudflare Worker cannot run ffmpeg → all muxing happens client-side.
//   * Inputs: 4–10 s 720×1280 (9:16) H.264/AAC mp4 clips produced by Seedance.
//
// Strategy:
//   1. Demux every clip with MP4Box (pure JS, single-threaded). We read the raw
//      avc1 video samples + mp4a/aac audio samples, plus the track descriptors
//      (avcC body, AudioSpecificConfig) from the stsd.
//   2. If all clips share the same codec / resolution / SPS-PPS / audio config,
//      stream-copy: wrap the samples in WebCodecs EncodedVideoChunk /
//      EncodedAudioChunk objects (no decode) and remux with mp4-muxer. Each
//      later clip's timestamps are offset by the accumulated duration.
//   3. If parameters mismatch, fall back to single-threaded WebCodecs
//      VideoDecoder/VideoEncoder + AudioDecoder/AudioEncoder re-encode.
//
// No SharedArrayBuffer is used anywhere. Third-party libs are loaded on demand
// from a CDN (jsdelivr): MP4Box as a UMD script, mp4-muxer as native ESM.
// -----------------------------------------------------------------------------

// ----- CDN loading -----------------------------------------------------------

const MP4BOX_URL = 'https://cdn.jsdelivr.net/npm/mp4box@2.1.1/dist/mp4box.all.min.js';
const MP4_MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.0/build/mp4-muxer.mjs';

let _mp4boxPromise = null;
function loadMP4Box() {
  if (_mp4boxPromise) return _mp4boxPromise;
  // mp4box@2.1.1 dist build is an ES module with named exports (createFile, …).
  _mp4boxPromise = import(/* @vite-ignore */ MP4BOX_URL)
    .then((mod) => {
      if (typeof mod.createFile !== 'function') {
        throw new Error('MP4Box module has no createFile export');
      }
      // Present a tiny shim that matches the historic MP4Box.createFile API.
      return { createFile: mod.createFile, _mod: mod };
    })
    .catch((e) => {
      _mp4boxPromise = null;
      throw new Error('Failed to load MP4Box from CDN: ' + e.message);
    });
  return _mp4boxPromise;
}

let _muxerPromise = null;
function loadMuxer() {
  if (_muxerPromise) return _muxerPromise;
  _muxerPromise = import(/* @vite-ignore */ MP4_MUXER_URL).catch((e) => {
    _muxerPromise = null;
    throw new Error('Failed to load mp4-muxer from CDN: ' + e.message);
  });
  return _muxerPromise;
}

// ----- Minimal MP4 box walker (for stsd descriptors) --------------------------
// MP4Box gives us samples but not always a convenient raw avcC / ASC. We parse
// the stsd ourselves from the source ArrayBuffer.

function readU38(view, off) {
  // returns [size, type, headerLen]
  const size = view.getUint32(off);
  const type = String.fromCharCode(
    view.getUint8(off + 4), view.getUint8(off + 5),
    view.getUint8(off + 6), view.getUint8(off + 7),
  );
  let headerLen = 8;
  let realSize = size;
  if (size === 1) {
    // 64-bit size
    const hi = view.getUint32(off + 8);
    const lo = view.getUint32(off + 12);
    realSize = hi * 0x100000000 + lo;
    headerLen = 16;
  } else if (size === 0) {
    realSize = view.buffer.byteLength - off;
  }
  return [realSize, type, headerLen];
}

// Find a nested box by path (e.g. ['moov','trak']) inside a byte range.
// Returns [offset, size] of the matched box, or null.
function findBoxPath(view, start, end, path, index = 0) {
  let p = start;
  while (p + 8 <= end) {
    const [size, type, hdr] = readU38(view, p);
    if (size < hdr || p + size > end + 1) break;
    if (type === path[index]) {
      if (index === path.length - 1) return [p, size];
      const inner = findBoxPath(view, p + hdr, p + size, path, index + 1);
      if (inner) return inner;
    }
    p += size;
  }
  return null;
}

// Walk direct children of a box and yield [offset, type, size] for each.
function* children(view, boxStart, boxSize) {
  const hdr = 8;
  let p = boxStart + hdr;
  const end = boxStart + boxSize;
  while (p + 8 <= end) {
    const [size, type, h] = readU38(view, p);
    if (size < h || p + size > end + 1) break;
    yield [p, type, size];
    p += size;
  }
}

// Scan a byte range for a box whose type === fourCC. Returns [boxOffset, boxSize]
// or null. Robust against unknown fixed-sample-entry prefix sizes.
function findNestedBox(view, start, end, fourCC) {
  const c0 = fourCC.charCodeAt(0), c1 = fourCC.charCodeAt(1),
        c2 = fourCC.charCodeAt(2), c3 = fourCC.charCodeAt(3);
  for (let p = start; p + 8 <= end; p++) {
    if (view.getUint8(p) === c0 && view.getUint8(p+1) === c1 &&
        view.getUint8(p+2) === c2 && view.getUint8(p+3) === c3) {
      const size = view.getUint32(p - 4);
      if (size >= 8 && p - 4 + size <= end) {
        return [p - 4, size];
      }
    }
  }
  return null;
}

// Parse one stsd entry and pull out the descriptor we need.
// Returns { kind:'video', width, height, avcCBody:Uint8Array, codecStr } |
//         { kind:'audio', channels, sampleRate, asc:Uint8Array, codecStr } | null
function parseStsdEntry(view, entryStart, entrySize) {
  const entryEnd = entryStart + entrySize;
  const fmt = String.fromCharCode(
    view.getUint8(entryStart + 4), view.getUint8(entryStart + 5),
    view.getUint8(entryStart + 6), view.getUint8(entryStart + 7),
  );

  if (fmt === 'avc1') {
    // VisualSampleEntry: width/height at offset 24 after box header.
    const width = view.getUint16(entryStart + 8 + 24);
    const height = view.getUint16(entryStart + 8 + 26);
    const avcC = findNestedBox(view, entryStart + 8, entryEnd, 'avcC');
    if (avcC) {
      const [off, size] = avcC;
      const body = new Uint8Array(view.buffer, off + 8, size - 8).slice();
      const profile = view.getUint8(off + 8 + 1);
      const compat = view.getUint8(off + 8 + 2);
      const level = view.getUint8(off + 8 + 3);
      const codecStr = 'avc1.' +
        profile.toString(16).padStart(2, '0') +
        compat.toString(16).padStart(2, '0') +
        level.toString(16).padStart(2, '0');
      return { kind: 'video', width, height, avcCBody: body, codecStr };
    }
    return null;
  }

  if (fmt === 'mp4a') {
    // AudioSampleEntry: channels at +24, samplerate (16.16) upper 16 bits at +32.
    const channels = view.getUint16(entryStart + 24);
    const sampleRate = view.getUint16(entryStart + 32);
    const esds = findNestedBox(view, entryStart + 8, entryEnd, 'esds');
    if (esds) {
      const asc = parseEsdsForAsc(view, esds[0], esds[1]);
      if (asc) return { kind: 'audio', channels, sampleRate, asc, codecStr: 'mp4a.40.2' };
    }
    return null;
  }

  return null;
}

// Parse esds box → walk descriptor tree → return DecoderSpecificInfo (ASC) bytes.
function parseEsdsForAsc(view, esdsStart, esdsSize) {
  // esds: 8 box hdr + 4 version/flags, then ES_Descriptor
  let p = esdsStart + 8 + 4;
  const end = esdsStart + esdsSize;

  function readDesc(p) {
    const tag = view.getUint8(p); p += 1;
    let length = 0;
    for (let i = 0; i < 4; i++) {
      const b = view.getUint8(p); p += 1;
      length = (length << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return { tag, length, payloadStart: p, end: p + length };
  }

  // ES_Descriptor tag 0x03
  const es = readDesc(p); p = es.end;
  if (es.tag !== 0x04 && es.tag !== 0x03) return null;
  if (es.tag === 0x03) {
    // ES_Descriptor payload: ES_ID(2) + flags(1), then optional fields
    let q = es.payloadStart + 3;
    const flags = view.getUint8(es.payloadStart + 2);
    if (flags & 0x80) q += 2;
    if (flags & 0x40) q += 1 + view.getUint8(q);
    if (flags & 0x20) q += 2;
    // next descriptor = DecoderConfigDescriptor (0x04)
    const dcd = readDesc(q);
    if (dcd.tag !== 0x04) return null;
    // DCD payload: oti(1) + streamType(1) + bufferDB(3) + maxBR(4) + avgBR(4) = 13
    let r = dcd.payloadStart + 13;
    const sd = readDesc(r);
    if (sd.tag !== 0x05) return null;
    return new Uint8Array(view.buffer, sd.payloadStart, sd.end - sd.payloadStart).slice();
  }
  return null;
}

// Pull stsd descriptors for every track in a clip buffer.
// Returns [{ trackIndex, handler, info }]
function parseClipDescriptors(buf) {
  const view = new DataView(buf);
  const out = [];
  const moov = findBoxPath(view, 0, buf.byteLength, ['moov']);
  if (!moov) throw new Error('No moov box found');
  const [moovStart, moovSize] = moov;

  for (const [trakStart, trakType, trakSize] of children(view, moovStart, moovSize)) {
    if (trakType !== 'trak') continue;
    // hdlr
    const hdlr = findBoxPath(view, trakStart + 8, trakStart + trakSize, ['mdia', 'hdlr']);
    let handler = '';
    if (hdlr) {
      handler = String.fromCharCode(
        view.getUint8(hdlr[0] + 8 + 4 + 4),
        view.getUint8(hdlr[0] + 8 + 4 + 4 + 1),
        view.getUint8(hdlr[0] + 8 + 4 + 4 + 2),
        view.getUint8(hdlr[0] + 8 + 4 + 4 + 3),
      );
    }
    // mdhd timescale/duration
    let timescale = 0, duration = 0;
    const mdhd = findBoxPath(view, trakStart + 8, trakStart + trakSize, ['mdia', 'mdhd']);
    if (mdhd) {
      const ver = view.getUint8(mdhd[0] + 8);
      if (ver === 1) {
        timescale = view.getUint32(mdhd[0] + 8 + 4 + 8 + 4);
        duration = Number(view.getUint32(mdhd[0] + 8 + 4 + 8 + 4 + 4) * 0x100000000 +
          view.getUint32(mdhd[0] + 8 + 4 + 8 + 4 + 4 + 4));
      } else {
        timescale = view.getUint32(mdhd[0] + 8 + 4 + 4 + 4);
        duration = view.getUint32(mdhd[0] + 8 + 4 + 4 + 4 + 4);
      }
    }
    // stsd
    const stsd = findBoxPath(view, trakStart + 8, trakStart + trakSize,
      ['mdia', 'minf', 'stbl', 'stsd']);
    let info = null;
    if (stsd) {
      let p = stsd[0] + 8 + 4 + 4;
      const end = stsd[0] + stsd[1];
      if (p + 8 <= end) {
        const eSize = view.getUint32(p);
        info = parseStsdEntry(view, p, eSize);
      }
    }
    out.push({ handler, timescale, duration, info });
  }
  return out;
}

// ----- Demux one clip with MP4Box --------------------------------------------

async function demuxClip(url, signal) {
  const MP4Box = await loadMP4Box();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed for ${url}: HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();

  // Parse descriptors BEFORE MP4Box consumes (detaches) the buffer.
  const descriptors = parseClipDescriptors(buf);

  return new Promise((resolve, reject) => {
    const file = MP4Box.createFile();
    const video = [];
    const audio = [];
    let readyInfo = null;

    file.onError = (e) => reject(e instanceof Error ? e : new Error('MP4Box error: ' + e));
    file.onWarning = (e) => console.warn('[composer] MP4Box warning:', e);
    file.onReady = (info) => {
      readyInfo = info;
      const vTrack = info.tracks.find((t) => t.type === 'video');
      const aTrack = info.tracks.find((t) => t.type === 'audio');
      if (vTrack) file.setExtractionOptions(vTrack.id, { kind: 'v' }, { nbSamples: 1e7 });
      if (aTrack) file.setExtractionOptions(aTrack.id, { kind: 'a' }, { nbSamples: 1e7 });
      file.start();
    };
    // MP4Box delivers samples via onSamples(id, user, samples[]) — plural.
    file.onSamples = (id, user, samples) => {
      for (const s of samples) {
        if (user?.kind === 'v') video.push(s);
        else if (user?.kind === 'a') audio.push(s);
      }
    };

    // MP4Box requires the buffer to carry a fileStart property (0 = beginning of file).
    buf.fileStart = 0;
    try {
      file.appendBuffer(buf);
      file.flush();
    } catch (e) {
      return reject(e);
    }
    // Poll briefly: onReady is usually sync for a fully-buffered file, but be safe.
    let ticks = 0;
    const iv = setInterval(() => {
      ticks++;
      if (readyInfo) {
        clearInterval(iv);
        resolve({ info: readyInfo, video, audio, descriptors });
      } else if (ticks > 50) {
        clearInterval(iv);
        reject(new Error('MP4Box onReady never fired (consumed=' + consumed + ')'));
      }
    }, 20);
  });
}

// ----- Helpers ----------------------------------------------------------------

function samplesDurationUs(samples, timescale) {
  if (!samples.length) return 0;
  const first = samples[0].dts;
  const last = samples[samples.length - 1];
  return ((last.dts + last.duration - first) / timescale) * 1e6;
}

function sameBytes(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Determine whether all clips can be stream-copied.
function checkStreamCopyCompatible(clips) {
  let ref = null;
  for (const c of clips) {
    const v = c.descriptors.find((d) => d.info?.kind === 'video');
    const a = c.descriptors.find((d) => d.info?.kind === 'audio');
    if (!v) return { ok: false, reason: 'missing video track' };
    const cur = {
      width: v.info.width,
      height: v.info.height,
      avcC: v.info.avcCBody,
      hasAudio: !!a,
      channels: a?.info?.channels ?? 0,
      sampleRate: a?.info?.sampleRate ?? 0,
      asc: a?.info?.asc ?? null,
    };
    if (!ref) { ref = cur; continue; }
    if (ref.width !== cur.width || ref.height !== cur.height)
      return { ok: false, reason: `resolution mismatch ${ref.width}x${ref.height} vs ${cur.width}x${cur.height}` };
    if (!sameBytes(ref.avcC, cur.avcC))
      return { ok: false, reason: 'SPS/PPS (avcC) differs between clips' };
    if (ref.hasAudio !== cur.hasAudio)
      return { ok: false, reason: 'audio presence mismatch' };
    if (ref.channels !== cur.channels || ref.sampleRate !== cur.sampleRate)
      return { ok: false, reason: `audio config mismatch ${ref.channels}ch/${ref.sampleRate}Hz vs ${cur.channels}ch/${cur.sampleRate}Hz` };
    if (!sameBytes(ref.asc, cur.asc))
      return { ok: false, reason: 'AudioSpecificConfig differs' };
  }
  return { ok: true, ref };
}

// ----- Main entry -------------------------------------------------------------

/**
 * Concatenate clips into a single mp4, fully in the browser.
 *
 * @param {{clips: Array<{url:string, label?:string}>,
 *          onProgress?: (frac:number, msg:string)=>void}} opts
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ok:boolean, blob:Blob, bytes:number, durationSec:number,
 *                    mode:'stream-copy'|'reencode'|'empty'}>}
 */
export async function composeVideo({ clips, onProgress }, signal) {
  const report = (f, m) => { try { onProgress?.(f, m); } catch {} };

  if (!clips || clips.length === 0) throw new Error('composeVideo: no clips provided');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  report(0.02, `Loading MP4Box / mp4-muxer…`);
  const { Muxer, ArrayBufferTarget } = await loadMuxer();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // 1. Demux every clip.
  const demuxed = [];
  for (let i = 0; i < clips.length; i++) {
    report(0.05 + (i / clips.length) * 0.4, `Demuxing clip ${i + 1}/${clips.length}: ${clips[i].label || clips[i].url}`);
    const d = await demuxClip(clips[i].url, signal);
    demuxed.push(d);
  }

  // 2. Compatibility check.
  report(0.48, 'Checking track compatibility…');
  const compat = checkStreamCopyCompatible(demuxed);
  if (!compat.ok) {
    // Fallback: WebCodecs re-encode. For the current Seedance homogeneous inputs
    // this path should not be needed; if it is, we implement a best-effort
    // single-threaded transcode below.
    return await reencodeCompose({ demuxed, clips, report, signal, Muxer, ArrayBufferTarget });
  }

  const ref = compat.ref;
  const vDesc = demuxed[0].descriptors.find((d) => d.info?.kind === 'video').info;
  const aDesc = demuxed[0].descriptors.find((d) => d.info?.kind === 'audio')?.info || null;

  // 3. Build muxer.
  const muxerOpts = {
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: ref.width, height: ref.height },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'strict',
  };
  if (aDesc) {
    muxerOpts.audio = {
      codec: 'aac',
      numberOfChannels: ref.channels,
      sampleRate: ref.sampleRate,
    };
  }
  const muxer = new Muxer(muxerOpts);

  // 4. Stream-copy samples, offsetting timestamps per clip.
  let videoOffsetUs = 0;
  let audioOffsetUs = 0;
  let totalDurationUs = 0;

  for (let i = 0; i < demuxed.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const d = demuxed[i];
    report(0.5 + (i / demuxed.length) * 0.45, `Muxing clip ${i + 1}/${demuxed.length}…`);

    const vTrack = d.info.tracks.find((t) => t.type === 'video');
    const aTrack = d.info.tracks.find((t) => t.type === 'audio');
    const vTimescale = vTrack?.video?.timescale || vTrack?.timescale || 1;
    const aTimescale = aTrack?.audio?.timescale || aTrack?.timescale || 1;

    const vStartDts = d.video.length ? d.video[0].dts : 0;
    for (const s of d.video) {
      const tsUs = ((s.dts - vStartDts) / vTimescale) * 1e6 + videoOffsetUs;
      const durUs = (s.duration / vTimescale) * 1e6;
      const chunk = new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: Math.round(tsUs),
        duration: Math.round(durUs),
        data: s.data,
      });
      muxer.addVideoChunk(chunk, {
        decoderConfig: { codec: vDesc.codecStr, description: vDesc.avcCBody },
      });
    }
    const vDur = samplesDurationUs(d.video, vTimescale);
    videoOffsetUs += vDur;

    if (aDesc && d.audio.length) {
      const aStartDts = d.audio[0].dts;
      for (const s of d.audio) {
        const tsUs = ((s.dts - aStartDts) / aTimescale) * 1e6 + audioOffsetUs;
        const durUs = (s.duration / aTimescale) * 1e6;
        const chunk = new EncodedAudioChunk({
          type: 'key',
          timestamp: Math.round(tsUs),
          duration: Math.round(durUs),
          data: s.data,
        });
        muxer.addAudioChunk(chunk, {
          decoderConfig: { codec: 'mp4a.40.2', description: aDesc.asc },
        });
      }
      const aDur = samplesDurationUs(d.audio, aTimescale);
      audioOffsetUs += aDur;
    }

    totalDurationUs = Math.max(videoOffsetUs, audioOffsetUs);
  }

  report(0.96, 'Finalizing mp4…');
  muxer.finalize();
  const { buffer } = muxer.target;
  const blob = new Blob([buffer], { type: 'video/mp4' });

  return {
    ok: true,
    blob,
    bytes: blob.size,
    durationSec: totalDurationUs / 1e6,
    mode: 'stream-copy',
  };
}

// ----- WebCodecs re-encode fallback ------------------------------------------
// Single-threaded, no SharedArrayBuffer. Decodes each clip's AVC/AAC then
// re-encodes to a common H.264/AAC so that mismatched parameters still produce
// a valid output. Used only when stream-copy is not possible.

async function reencodeCompose({ demuxed, report, signal, Muxer, ArrayBufferTarget }) {
  report(0.5, 'Parameters differ — falling back to WebCodecs re-encode (single-thread)…');

  // Pick output params from first clip's descriptors.
  const vDesc = demuxed[0].descriptors.find((d) => d.info?.kind === 'video').info;
  const aDesc = demuxed[0].descriptors.find((d) => d.info?.kind === 'audio')?.info || null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: vDesc.width, height: vDesc.height },
    ...(aDesc ? { audio: { codec: 'aac', numberOfChannels: aDesc.channels, sampleRate: aDesc.sampleRate } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'strict',
  });

  let videoOffsetUs = 0;
  let audioOffsetUs = 0;

  // Reusable encoders.
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => { throw e; },
  });
  videoEncoder.configure({
    codec: vDesc.codecStr,
    width: vDesc.width,
    height: vDesc.height,
    bitrate: 5_000_000,
    framerate: 30,
    avc: { format: 'avc' },
  });

  let audioEncoder = null;
  if (aDesc) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { throw e; },
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2',
      sampleRate: aDesc.sampleRate,
      numberOfChannels: aDesc.channels,
      bitrate: 128_000,
    });
  }

  for (let i = 0; i < demuxed.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    report(0.5 + (i / demuxed.length) * 0.4, `Re-encoding clip ${i + 1}/${demuxed.length}…`);
    const d = demuxed[i];
    const vTimescale = d.info.tracks.find(t=>t.type==='video')?.video?.timescale || 1;
    const aTimescale = d.info.tracks.find(t=>t.type==='audio')?.audio?.timescale || 1;
    const vDescHere = d.descriptors.find((x) => x.info?.kind === 'video').info;
    const aDescHere = d.descriptors.find((x) => x.info?.kind === 'audio')?.info || null;

    // --- Video: decode -> re-encode ---
    const videoDecoder = new VideoDecoder({
      output: (frame) => {
        // re-timestamp relative to output timeline
        frame.timestamp += videoOffsetUs;
        videoEncoder.encode(frame);
        frame.close();
      },
      error: (e) => { throw e; },
    });
    videoDecoder.configure({
      codec: vDescHere.codecStr,
      codedWidth: vDescHere.width,
      codedHeight: vDescHere.height,
      description: vDescHere.avcCBody,
    });
    const vStartDts = d.video.length ? d.video[0].dts : 0;
    for (const s of d.video) {
      const tsUs = ((s.dts - vStartDts) / vTimescale) * 1e6;
      const chunk = new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: Math.round(tsUs),
        duration: Math.round((s.duration / vTimescale) * 1e6),
        data: s.data,
      });
      videoDecoder.decode(chunk);
    }
    await videoDecoder.flush();
    videoDecoder.close();
    videoOffsetUs += samplesDurationUs(d.video, vTimescale);

    // --- Audio: decode -> re-encode ---
    if (audioEncoder && aDescHere && d.audio.length) {
      const audioDecoder = new AudioDecoder({
        output: (frame) => {
          frame.timestamp += audioOffsetUs;
          audioEncoder.encode(frame);
          frame.close();
        },
        error: (e) => { throw e; },
      });
      audioDecoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: aDescHere.sampleRate,
        numberOfChannels: aDescHere.channels,
        description: aDescHere.asc,
      });
      const aStartDts = d.audio[0].dts;
      for (const s of d.audio) {
        const tsUs = ((s.dts - aStartDts) / aTimescale) * 1e6;
        const chunk = new EncodedAudioChunk({
          type: 'key',
          timestamp: Math.round(tsUs),
          duration: Math.round((s.duration / aTimescale) * 1e6),
          data: s.data,
        });
        audioDecoder.decode(chunk);
      }
      await audioDecoder.flush();
      audioDecoder.close();
      audioOffsetUs += samplesDurationUs(d.audio, aTimescale);
    }
  }

  await videoEncoder.flush();
  videoEncoder.close();
  if (audioEncoder) { await audioEncoder.flush(); audioEncoder.close(); }

  report(0.96, 'Finalizing re-encoded mp4…');
  muxer.finalize();
  const { buffer } = muxer.target;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  return {
    ok: true,
    blob,
    bytes: blob.size,
    durationSec: Math.max(videoOffsetUs, audioOffsetUs) / 1e6,
    mode: 'reencode',
  };
}

// ----- composeNarrationVideo -------------------------------------------------
// Per-shot silent Seedance clip + per-shot TTS mp3 + per-word timing → a single
// 720×1280 mp4 with hard-burned, karaoke-style Chinese subtitles and AAC audio.
//
// Pure browser, single-threaded, no SharedArrayBuffer / COOP-COEP / ffmpeg.wasm.
// Pipeline per shot:
//   video: MP4Box demux AVC → WebCodecs VideoDecoder → draw frame + subtitle onto
//          a 720×1280 canvas → new VideoFrame → VideoEncoder (H.264 avc).
//   audio: mp3 bytes → WebCodecs AudioDecoder ('mp3') → AudioEncoder (AAC).
//   both → mp4-muxer.
// Per-shot timestamps are anchored to the global video timeline (shot start), so
// narration starts exactly when its shot begins regardless of mp3 length.

async function fetchBufHard(url, ms, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('fetch timeout: ' + url)), ms);
  const onAbort = () => ctrl.abort(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort);
  }
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.arrayBuffer();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// Strip an ID3v2 tag prefix if present (WebCodecs mp3 decoder chokes on it).
function stripId3(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) { // "ID3"
    const size = ((u8[6] & 0x7f) << 21) | ((u8[7] & 0x7f) << 14) |
                 ((u8[8] & 0x7f) << 7) | (u8[9] & 0x7f);
    return buf.slice(10 + size);
  }
  return buf;
}

// Read the first valid MP3 frame header to learn sampleRate / channels.
// Robust against an ID3v2 tag prefix (we scan for the 0xFFE? sync).
function probeMp3Info(buf) {
  const u8 = new Uint8Array(buf);
  for (let i = 0; i + 4 < u8.length; i++) {
    if (u8[i] === 0xff && (u8[i + 1] & 0xe0) === 0xe0) {
      const verBits = (u8[i + 1] >> 3) & 0x03;   // 0=MPEG2.5 2=MPEG2 3=MPEG1
      const srIdx = (u8[i + 2] >> 2) & 0x03;     // 3 = invalid
      const mode = (u8[i + 3] >> 6) & 0x03;      // 3 = mono
      const srTable = {
        3: [44100, 48000, 32000],
        2: [22050, 24000, 16000],
        0: [11025, 12000, 8000],
      };
      const tbl = srTable[verBits];
      if (!tbl || srIdx === 3) continue;
      return { sampleRate: tbl[srIdx], channels: mode === 3 ? 1 : 2 };
    }
  }
  throw new Error('probeMp3Info: no MPEG audio sync found');
}

// Draw one subtitle frame. words are shot-relative {word,startTime,endTime}(sec).
// shotStartSec = global start of this shot. globalSec = current video t (sec).
function drawSubtitleFrame(ctx, words, shotStartSec, globalSec, wordGap = 0) {
  if (!words || !words.length) return;
  // Active word: the one whose [start+shotStart, end+shotStart] covers globalSec.
  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    const s = words[i].startTime + shotStartSec;
    const e = words[i].endTime + shotStartSec;
    if (globalSec >= s && globalSec <= e) { activeIdx = i; break; }
  }
  if (activeIdx < 0) {
    // hold the last already-spoken word briefly after it ends
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i].endTime + shotStartSec <= globalSec) { activeIdx = i; break; }
    }
  }
  const maxWidth = 620;
  const fontSize = 38;
  const lineHeight = Math.round(fontSize * 1.32);
  ctx.font = `bold ${fontSize}px "PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif`;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  // Greedy word wrap into lines.
  const lines = [];
  let cur = [];
  let curW = 0;
  for (const w of words) {
    const ww = ctx.measureText(w.word).width + wordGap;
    if (cur.length && curW + ww > maxWidth) { lines.push(cur); cur = []; curW = 0; }
    cur.push(w);
    curW += ww;
  }
  if (cur.length) lines.push(cur);

  // Vertical: bottom safe band y≈1040..1140, center the block inside it.
  const blockH = lines.length * lineHeight;
  let y = 1040 + Math.max(0, (100 - blockH) / 2);

  for (const line of lines) {
    let lineW = 0;
    for (const w of line) lineW += ctx.measureText(w.word).width + wordGap;
    lineW -= wordGap;
    let x = (720 - lineW) / 2;
    for (const w of line) {
      const ww = ctx.measureText(w.word).width;
      const isActive = (words[activeIdx] === w);
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(w.word, x, y);
      ctx.fillStyle = isActive ? '#ffd400' : '#ffffff';
      ctx.fillText(w.word, x, y);
      x += ww + wordGap;
    }
    y += lineHeight;
  }
}

function waitEncoderDrain(enc, threshold = 8) {
  if (enc.encodeQueueSize <= threshold) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const check = () => {
      if (enc.encodeQueueSize <= threshold) return finish();
      enc.addEventListener('dequeue', check, { once: true });
      setTimeout(check, 3);
    };
    check();
  });
}

/**
 * Compose a narration video: silent clips + TTS mp3 + per-word subtitles.
 *
 * @param {{shots: Array<{videoUrl:string, mp3Url:string,
 *                        words: Array<{word:string,startTime:number,endTime:number}>}>,
 *          onProgress?: (frac:number, msg:string)=>void}} opts
 * @param {AbortSignal} [signal]
 * @returns {Promise<{blob:Blob, bytes:number, durationSec:number, mode:string}>}
 */
export async function composeNarrationVideo({ shots, onProgress, onCanvasFrame, signal }) {
  const report = (f, m) => { try { onProgress?.(f, m); } catch {} };
  if (!shots || shots.length === 0) throw new Error('composeNarrationVideo: no shots');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  report(0.02, '加载 MP4Box / mp4-muxer…');
  const { Muxer, ArrayBufferTarget } = await loadMuxer();
  await loadMP4Box();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // 1. Fetch + probe all mp3s (assume same codec params; verify first).
  report(0.06, '下载并探测 TTS mp3…');
  const mp3Bufs = [];
  for (let i = 0; i < shots.length; i++) {
    report(0.06 + (i / shots.length) * 0.1, `下载配音 ${i + 1}/${shots.length}…`);
    mp3Bufs.push(await fetchBufHard(shots[i].mp3Url, 20000, signal));
  }
  const mp3Info = probeMp3Info(mp3Bufs[0]);

  // 2. Demux every video clip (video track only).
  report(0.18, '解封装各镜头视频…');
  const demuxed = [];
  for (let i = 0; i < shots.length; i++) {
    report(0.18 + (i / shots.length) * 0.2, `解封装镜头 ${i + 1}/${shots.length}…`);
    demuxed.push(await demuxClip(shots[i].videoUrl, signal));
  }

  // 3. Build muxer + encoders. Audio is always resampled to 48k mono (AAC constraint).
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: 720, height: 1280 },
    audio: { codec: 'aac', numberOfChannels: 1, sampleRate: 48000 },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'strict',
  });

  const canvas = document.createElement('canvas');
  canvas.width = 720; canvas.height = 1280;
  const ctx = canvas.getContext('2d', { alpha: false });

  const vencoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  vencoder.configure({
    codec: 'avc1.64001f', width: 720, height: 1280,
    bitrate: 5_000_000, framerate: 30,
    latencyMode: 'realtime',   // no B-frame reorder → chunks emit in PTS order
    avc: { format: 'avc' },
  });

  const aencoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  aencoder.configure({
    codec: 'mp4a.40.2', sampleRate: 48000,
    numberOfChannels: 1, bitrate: 128_000,
  });

  let videoOffsetUs = 0;   // global start of the next shot (video timeline)
  let audioEndUs = 0;      // furthest audio timestamp written

  for (let si = 0; si < shots.length; si++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const shotStartUs = videoOffsetUs;
    const shotStartSec = shotStartUs / 1e6;
    const d = demuxed[si];
    const vTrack = d.info.tracks.find((t) => t.type === 'video');
    const vTimescale = vTrack?.video?.timescale || vTrack?.timescale || 1;
    const vDesc = d.descriptors.find((x) => x.info?.kind === 'video').info;
    const shotWords = shots[si].words || [];

    // ---- Video: decode → snapshot(ImageBitmap) → sort by PTS → burn subtitle → encode ----
    report(0.4 + (si / shots.length) * 0.45, `镜头 ${si + 1}/${shots.length}：字幕烧录…`);
    const pending = [];
    await new Promise((resolve, reject) => {
      const vdec = new VideoDecoder({
        output: (frame) => {
          const ts = frame.timestamp, dur = frame.duration || Math.round(1e6 / 30);
          // Snapshot pixels into an ImageBitmap so the source VideoFrame can be
          // closed immediately (buffering raw VideoFrames stalls the decoder).
          pending.push(
            createImageBitmap(frame)
              .then((bmp) => ({ ts, dur, bmp }))
              .catch(() => null)
              .finally(() => frame.close())
          );
        },
        error: (e) => reject(e),
      });
      vdec.configure({
        codec: vDesc.codecStr, codedWidth: vDesc.width, codedHeight: vDesc.height,
        description: vDesc.avcCBody,
      });
      const vStartDts = d.video.length ? d.video[0].dts : 0;
      (async () => {
        for (const s of d.video) {
          if (signal?.aborted) break;
          const tsUs = Math.round(((s.dts - vStartDts) / vTimescale) * 1e6);
          const durUs = Math.round((s.duration / vTimescale) * 1e6);
          vdec.decode(new EncodedVideoChunk({
            type: s.is_sync ? 'key' : 'delta', timestamp: tsUs, duration: durUs, data: s.data,
          }));
        }
        await vdec.flush();
        vdec.close();
        resolve();
      })().catch(reject);
    });

    const snaps = (await Promise.all(pending)).filter(Boolean);
    snaps.sort((a, b) => a.ts - b.ts);   // source has B-frames → emit in presentation order
    for (const f of snaps) {
      if (signal?.aborted) { f.bmp.close(); continue; }
      const globalUs = Math.round(f.ts + shotStartUs);
      ctx.drawImage(f.bmp, 0, 0, 720, 1280);
      drawSubtitleFrame(ctx, shotWords, shotStartSec, globalUs / 1e6);
      try { onCanvasFrame?.(canvas, globalUs); } catch {}
      const outFrame = new VideoFrame(canvas, { timestamp: globalUs, duration: f.dur });
      vencoder.encode(outFrame);
      outFrame.close();
      f.bmp.close();
    }
    await waitEncoderDrain(vencoder, 2);
    videoOffsetUs += samplesDurationUs(d.video, vTimescale);

    // ---- Audio: decode mp3 via OfflineAudioContext (resamples to 48k mono f32), anchor at shotStartUs ----
    report(0.4 + (si / shots.length) * 0.45 + 0.03, `镜头 ${si + 1}/${shots.length}：配音编码…`);
    const wordsDurSec = shotWords.length
      ? shotWords[shotWords.length - 1].endTime + 0.35 : 5;
    await new Promise((resolve, reject) => {
      try {
        const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const len = Math.max(1, Math.round(wordsDurSec * 48000));
        const oac = new AC(1, len, 48000);
        // decodeAudioData needs a fresh ArrayBuffer copy
        const src = mp3Bufs[si].slice(0);
        oac.decodeAudioData(src).then((abuf) => {
          const chan = abuf.getChannelData(0);
          const FRAME = 1024;
          let off = 0;
          for (let pos = 0; pos < chan.length; pos += FRAME) {
            const n = Math.min(FRAME, chan.length - pos);
            const slice = chan.subarray(pos, pos + n);
            const buf = new ArrayBuffer(n * 4);
            new Float32Array(buf).set(slice);
            const au = new AudioData({
              format: 'f32-planar', sampleRate: 48000, numberOfFrames: n,
              numberOfChannels: 1, timestamp: Math.round(shotStartUs + off), data: buf,
            });
            aencoder.encode(au);
            au.close();
            off += Math.round((n / 48000) * 1e6);
          }
          audioEndUs = Math.max(audioEndUs, shotStartUs + Math.round((chan.length / 48000) * 1e6));
          resolve();
        }).catch(reject);
      } catch (e) { reject(e); }
    });
  }

  // 4. Finalize.
  report(0.92, '冲刷编码器并封装 mp4…');
  await vencoder.flush(); vencoder.close();
  await aencoder.flush(); aencoder.close();
  muxer.finalize();

  const { buffer } = muxer.target;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  return {
    blob,
    bytes: blob.size,
    durationSec: Math.max(videoOffsetUs, audioEndUs) / 1e6,
    mode: 'narration-reencode',
  };
}

// ----- composeSlideshowVideo -------------------------------------------------
// 「图文成片」成本可控核心：商品静帧 + Ken Burns 运镜 + TTS 旁白 + 烧字幕。
// 不调 Seedance（不按秒计费），全部在浏览器内 Canvas 逐帧生成 720×1280 mp4。
//
// Pipeline per shot:
//   image: createImageBitmap(静帧) → 按 Ken Burns (zoomIn/zoomOut/pan…) 每帧变换
//          cover 铺满无黑边 → 烧底部逐词卡拉OK字幕 + hook 镜屏显大字 → VideoEncoder。
//   audio: mp3 → OfflineAudioContext 解码 → PCM 直接编码 AAC（音画同源，天然对齐）。
// 每镜视频时长 = 该镜 mp3 真实时长，确保旁白念完镜头才切，杜绝口播与画面错位。

const SLIDE_W = 720, SLIDE_H = 1280, SLIDE_FPS = 30;

// Ken Burns 变换：返回画布上的 drawImage 目标矩形。cover 铺满，无黑边。
function kenBurnsRect(kenBurns, t01, iw, ih) {
  const cover = Math.max(SLIDE_W / iw, SLIDE_H / ih);
  let zoom = 1.0, panX = 0.5, panY = 0.5;
  switch (kenBurns) {
    case 'zoomIn':      zoom = 1.0 + 0.12 * t01; break;
    case 'zoomOut':     zoom = 1.12 - 0.12 * t01; break;
    case 'zoomInSlow':  zoom = 1.0 + 0.06 * t01; break;
    case 'zoomOutSlow': zoom = 1.06 - 0.06 * t01; break;
    case 'panRight':    zoom = 1.12; panX = 0.15 + 0.7 * t01; break;
    case 'panLeft':     zoom = 1.12; panX = 0.85 - 0.7 * t01; break;
    default:            zoom = 1.0;
  }
  const s = cover * zoom;
  const dw = iw * s, dh = ih * s;
  const maxOffX = Math.max(0, (dw - SLIDE_W) / 2), maxOffY = Math.max(0, (dh - SLIDE_H) / 2);
  return {
    dx: (SLIDE_W - dw) / 2 + (panX - 0.5) * 2 * maxOffX,
    dy: (SLIDE_H - dh) / 2 + (panY - 0.5) * 2 * maxOffY,
    dw, dh,
  };
}

// hook 镜屏显大字（前3秒钩子强调，橙主色 #f97316）。淡入 + 轻微上移。
function drawHookTitle(ctx, text, t01) {
  if (!text) return;
  const alpha = Math.min(1, t01 * 4);            // 前 25% 淡入
  const rise = (1 - Math.min(1, t01 * 4)) * 14;   // 轻微上移
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold 52px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 自动缩字到两行以内
  const maxW = 640;
  let fontSize = 52;
  while (ctx.measureText(text).width > maxW && fontSize > 30) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
  }
  const cx = SLIDE_W / 2, cy = 360 + rise;
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, cx, cy, maxW);
  ctx.fillStyle = '#f97316';
  ctx.fillText(text, cx, cy, maxW);
  ctx.restore();
}

/**
 * 图文成片：静帧 + Ken Burns + TTS + 烧字幕。
 * @param {{shots: Array<{imageUrl:string, mp3Url:string,
 *                        words:Array<{word,startTime,endTime}>, kenBurns?:string,
 *                        onScreenText?:string}>,
 *          onProgress?:(f:number,m:string)=>void,
 *          onCanvasFrame?:(canvas:HTMLCanvasElement, globalUs:number)=>void,
 *          signal?:AbortSignal}} opts
 * @returns {Promise<{blob:Blob, bytes:number, durationSec:number, mode:string, perShot:Array}>}
 */
export async function composeSlideshowVideo({ shots, onProgress, onCanvasFrame, signal }) {
  const report = (f, m) => { try { onProgress?.(f, m); } catch {} };
  if (!shots || shots.length === 0) throw new Error('composeSlideshowVideo: no shots');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  report(0.02, '加载 mp4-muxer…');
  const { Muxer, ArrayBufferTarget } = await loadMuxer();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // 1. 拉取所有 mp3
  report(0.05, '下载 TTS 旁白…');
  const mp3Bufs = [];
  for (let i = 0; i < shots.length; i++) {
    report(0.05 + (i / shots.length) * 0.1, `下载配音 ${i + 1}/${shots.length}…`);
    mp3Bufs.push(await fetchBufHard(shots[i].mp3Url, 20000, signal));
  }

  // 2. 拉取并解码所有静帧
  report(0.18, '加载商品静帧…');
  const bitmaps = [];
  for (let i = 0; i < shots.length; i++) {
    report(0.18 + (i / shots.length) * 0.1, `加载静帧 ${i + 1}/${shots.length}…`);
    const r = await fetch(shots[i].imageUrl, { signal });
    if (!r.ok) throw new Error(`image fetch ${r.status}: ${shots[i].imageUrl}`);
    const bmp = await createImageBitmap(await r.blob());
    bitmaps.push(bmp);
  }

  // 3. muxer + 编码器
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: SLIDE_W, height: SLIDE_H },
    audio: { codec: 'aac', numberOfChannels: 1, sampleRate: 48000 },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'strict',
  });
  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_W; canvas.height = SLIDE_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  // 底色：深色主题，防止任何缝隙露黑
  ctx.fillStyle = '#0f1115'; ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

  const vencoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  vencoder.configure({
    codec: 'avc1.64001f', width: SLIDE_W, height: SLIDE_H,
    bitrate: 4_500_000, framerate: SLIDE_FPS,
    latencyMode: 'realtime', avc: { format: 'avc' },
  });
  const aencoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  aencoder.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 1, bitrate: 128_000 });

  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let videoOffsetUs = 0, audioEndUs = 0;
  const perShot = [];

  for (let si = 0; si < shots.length; si++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const shotStartUs = videoOffsetUs;
    const shotStartSec = shotStartUs / 1e6;
    const bmp = bitmaps[si];
    const shotWords = shots[si].words || [];
    // 判定本镜是否拉丁/英文（无中日韩字符且含拉丁字母）。英文词间用固定 gap 分隔；中文 gap=0。
    const joinedWords = shotWords.map(w => w.word).join('');
    const isEnWords = shotWords.length && /[A-Za-z]/.test(joinedWords) && !/[\u4e00-\u9fa5぀-ヿ一-鿿]/.test(joinedWords);

    // 3a. 解码 mp3 → 拿真实时长 + PCM
    report(0.3 + (si / shots.length) * 0.5, `镜头 ${si + 1}/${shots.length}：解码旁白…`);
    const durSec = await new Promise((resolve, reject) => {
      const oac = new AC(1, 4800, 48000);
      const src = mp3Bufs[si].slice(0);
      oac.decodeAudioData(src).then((abuf) => {
        // 用真实 PCM 编码音频，锚定 shotStartUs
        const chan = abuf.getChannelData(0);
        const FRAME = 1024;
        let off = 0;
        for (let pos = 0; pos < chan.length; pos += FRAME) {
          const n = Math.min(FRAME, chan.length - pos);
          const slice = chan.subarray(pos, pos + n);
          const buf = new ArrayBuffer(n * 4);
          new Float32Array(buf).set(slice);
          const au = new AudioData({
            format: 'f32-planar', sampleRate: 48000, numberOfFrames: n,
            numberOfChannels: 1, timestamp: Math.round(shotStartUs + off), data: buf,
          });
          aencoder.encode(au); au.close();
          off += Math.round((n / 48000) * 1e6);
        }
        audioEndUs = Math.max(audioEndUs, shotStartUs + Math.round((chan.length / 48000) * 1e6));
        resolve(abuf.duration);
      }).catch(reject);
    });

    // 3b. 逐帧 Ken Burns + 字幕
    report(0.3 + (si / shots.length) * 0.5 + 0.05, `镜头 ${si + 1}/${shots.length}：Ken Burns + 烧字幕…`);
    const nFrames = Math.max(1, Math.round(durSec * SLIDE_FPS));
    const frameDurUs = Math.round(1e6 / SLIDE_FPS);
    for (let f = 0; f < nFrames; f++) {
      const globalUs = shotStartUs + f * frameDurUs;
      const globalSec = globalUs / 1e6;
      const t01 = nFrames > 1 ? f / (nFrames - 1) : 0;

      // 静帧 cover + Ken Burns 变换
      const rect = kenBurnsRect(shots[si].kenBurns, t01, bmp.width, bmp.height);
      ctx.fillStyle = '#0f1115';
      ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
      ctx.drawImage(bmp, rect.dx, rect.dy, rect.dw, rect.dh);
      // hook 屏显大字
      drawHookTitle(ctx, shots[si].onScreenText || '', t01);
      // 底部逐词字幕（英文词间加 gap，中文 gap=0 不影响）
      drawSubtitleFrame(ctx, shotWords, shotStartSec, globalSec, isEnWords ? 9 : 0);

      try { onCanvasFrame?.(canvas, globalUs); } catch {}
      const outFrame = new VideoFrame(canvas, { timestamp: globalUs, duration: frameDurUs });
      vencoder.encode(outFrame);
      outFrame.close();
    }
    await waitEncoderDrain(vencoder, 2);
    videoOffsetUs += nFrames * frameDurUs;
    perShot.push({ idx: si, durSec: +durSec.toFixed(3), kenBurns: shots[si].kenBurns, role: shots[si].role || '' });
  }

  report(0.9, '冲刷编码器并封装…');
  await vencoder.flush(); vencoder.close();
  await aencoder.flush(); aencoder.close();
  muxer.finalize();

  const { buffer } = muxer.target;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  bitmaps.forEach(b => { try { b.close(); } catch {} });
  return {
    blob, bytes: blob.size,
    durationSec: Math.max(videoOffsetUs, audioEndUs) / 1e6,
    mode: 'slideshow-kenburns',
    perShot,
  };
}

export default { composeVideo };
