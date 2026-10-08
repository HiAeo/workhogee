// aview/tools/make-tts-jobs.mjs — 从 shots-*.json 提取 narration → tts-synth 的 jobs.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artDir = path.resolve(__dirname, '..', '..', '..', 'aview-artifacts');

const jobs = [];
for (const prod of ['3c', 'q7']) {
  const sb = JSON.parse(fs.readFileSync(path.join(artDir, `shots-${prod}.json`), 'utf8'));
  for (const s of sb.shots) {
    jobs.push({ file: prod + '-shot' + (s.idx + 1), text: s.narration });
  }
}
const out = path.join(artDir, '_tts_jobs.json');
fs.writeFileSync(out, JSON.stringify(jobs, null, 2));
console.log('wrote', out, 'jobs=', jobs.length);
