// aview/tools/verify-playback.mjs — 真机播放最终 mp4：逐 0.5s 抽帧 + 黑帧检测 + 音频 RMS
// 用法: node verify-playback.mjs <prod:3c|q7>
import pw from 'file:///C:/Users/91003/Desktop/创业项目孵化/workhogee/marketing-spec/aview-rollout/e2e/node_modules/playwright-core/index.js';
const { chromium } = pw;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artDir = path.resolve(__dirname, '..', '..', '..', 'aview-artifacts');

const prod = process.argv[2] || '3c';
const videoUrl = 'http://127.0.0.1:8765/aview-artifacts/' + prod + '.mp4';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 1400 } });
await page.goto('http://127.0.0.1:8765/aview-studio.html', { waitUntil: 'domcontentloaded', timeout: 20000 });

const report = await page.evaluate(async (url) => {
  const v = document.createElement('video');
  v.src = url; v.muted = false; v.playsInline = true; v.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('loaderr')); setTimeout(() => rej(new Error('meta_timeout')), 20000); });
  const dur = v.duration, w = v.videoWidth, h = v.videoHeight;

  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  // ---- 1) 逐 0.5s 抽帧 + 亮度（黑帧检测）----
  const STEP = 0.5;
  const frames = [];
  for (let t = 0; t < dur; t += STEP) {
    v.currentTime = t;
    await new Promise(r => { v.onseeked = r; setTimeout(r, 1500); });
    await new Promise(r => setTimeout(r, 120));
    ctx.drawImage(v, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h).data;
    // 采样：每 40 像素取一点算亮度，加速
    let sum = 0, n = 0;
    for (let i = 0; i < img.length; i += 40 * 4) {
      const lum = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
      sum += lum; n++;
    }
    const avg = sum / n;
    // 抽 20% 帧存图
    frames.push({ t: +t.toFixed(2), lum: +avg.toFixed(1), black: avg < 12 });
  }

  // ---- 2) 音频 RMS 真机分析 ----
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC(); await ac.resume();
  const src = ac.createMediaElementSource(v);
  const an = ac.createAnalyser(); an.fftSize = 2048;
  src.connect(an); an.connect(ac.destination);
  const buf = new Float32Array(an.fftSize);
  const rms = [];
  v.currentTime = 0; v.muted = true; await v.play();
  const t0 = performance.now();
  while (performance.now() - t0 < dur * 1000 + 1000) {
    an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    rms.push(Math.sqrt(s / buf.length));
    await new Promise(r => setTimeout(r, 100));
  }
  v.pause(); ac.close();
  const avgRms = rms.reduce((a, b) => a + b, 0) / rms.length;
  const silentRatio = (rms.filter(x => x < 0.004).length / rms.length) * 100;

  return { dur: +dur.toFixed(2), w, h, frames, avgRms: +avgRms.toFixed(4), silentRatio: +silentRatio.toFixed(1), maxRms: +Math.max(...rms).toFixed(4) };
}, videoUrl);

// 保存关键抽帧（每秒一张）供人工核对字幕/画面
const frameDir = path.join(artDir, 'playback', prod);
fs.mkdirSync(frameDir, { recursive: true });
// 重新抽每秒关键帧存图
const saved = await page.evaluate(async (url) => {
  const v = document.createElement('video'); v.src = url; v.crossOrigin='anonymous'; v.muted=true;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; setTimeout(()=>rej(new Error('l')),20000); });
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const ctx = c.getContext('2d');
  const out = {};
  for (let t = 0; t < v.duration; t += 1.0) {
    v.currentTime = t; await new Promise(r => { v.onseeked = r; setTimeout(r, 1200); });
    await new Promise(r=>setTimeout(r,150));
    ctx.drawImage(v, 0, 0, v.videoWidth, v.videoHeight);
    out[t.toFixed(1)] = c.toDataURL('image/jpeg', 0.8);
  }
  return out;
}, videoUrl);
for (const [t, du] of Object.entries(saved)) {
  fs.writeFileSync(path.join(frameDir, 'play_' + t.replace('.', 'p') + 's.jpg'), Buffer.from(du.split(',')[1], 'base64'));
}
await browser.close();

report.prod = prod;
report.blackFrames = report.frames.filter(f => f.black).map(f => f.t);
fs.writeFileSync(path.join(artDir, 'verify-' + prod + '.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ prod, dur: report.dur, w: report.w, h: report.h, avgRms: report.avgRms, silentRatio: report.silentRatio + '%', blackFrames: report.blackFrames, sampledFrames: report.frames.length, savedKeyFrames: Object.keys(saved).length }, null, 2));
console.log('每帧亮度: ' + report.frames.map(f => f.t + 's=' + f.lum).join(' '));
console.log('VERIFY DONE');
