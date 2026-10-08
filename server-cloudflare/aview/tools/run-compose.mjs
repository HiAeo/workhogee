// aview/tools/run-compose.mjs — Playwright headless 跑 aview-studio.html，产出 mp4 + 抽帧
// 用法: node run-compose.mjs <prod:3c|q7>
import pw from 'file:///C:/Users/91003/Desktop/创业项目孵化/workhogee/marketing-spec/aview-rollout/e2e/node_modules/playwright-core/index.js';
const { chromium } = pw;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artDir = path.resolve(__dirname, '..', '..', '..', 'aview-artifacts');

const prod = process.argv[2] || '3c';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 1400 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

console.log('打开 harness prod=' + prod);
await page.goto('http://127.0.0.1:8765/aview-studio.html?prod=' + prod, { waitUntil: 'domcontentloaded', timeout: 30000 });
// 等待 DONE / ERROR
await page.waitForFunction(() => window._result && (window._result.ok || window._result.error), { timeout: 180000 });
await page.waitForTimeout(800);

const meta = await page.evaluate(() => window._result);
console.log('RESULT ' + JSON.stringify(meta));
if (!meta.ok) { console.error('合成失败'); await browser.close(); process.exit(1); }

// 取 blob → base64
const b64 = await page.evaluate(async () => {
  const buf = await window._blob.arrayBuffer();
  const u8 = new Uint8Array(buf);
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
});
const mp4Path = path.join(artDir, prod + '.mp4');
fs.writeFileSync(mp4Path, Buffer.from(b64, 'base64'));
console.log('成片写出 ' + mp4Path + ' (' + (meta.bytes / 1048576).toFixed(2) + 'MB)');

// 抽帧落盘
const frameDir = path.join(artDir, 'frames', prod);
fs.mkdirSync(frameDir, { recursive: true });
const caps = await page.evaluate(async () => {
  const out = {};
  for (const [t, b] of window._caps.entries()) {
    out[t] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  }
  return out;
});
for (const [t, dataUrl] of Object.entries(caps)) {
  fs.writeFileSync(path.join(frameDir, 'frame_' + String(t).replace('.', 'p') + 's.jpg'), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
console.log('抽帧 ' + Object.keys(caps).length + ' 张 → ' + frameDir);
const realErrs = errs.filter(e => !/net::|ERR_|favicon|404/i.test(e));
console.log('real errors: ' + (realErrs.length ? realErrs.join(' | ') : 'none'));
await browser.close();
console.log('COMPOSE DONE');
