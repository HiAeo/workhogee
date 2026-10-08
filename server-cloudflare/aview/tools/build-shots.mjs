// aview/tools/build-shots.mjs — 阿视真机成片：mctx + 阿文 copy → 分镜 shots.json（供 TTS 与浏览器合成）
// ---------------------------------------------------------------------------
// 用真实跑出来的 mctx（OCR+联网已验证，见 _mctx_test 输出）+ 符合平台骨架的阿文 copy，
// 调 buildStoryboard 生成分镜；imageUrl 指向 8765 静态根可访问的真实商品静帧。
// 本脚本 0 LLM 二次调用（mctx 已构建好），只做规则编排。
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { buildStoryboard } = await import(pathToFileURL(path.join(__dirname, '..', 'storyboard.js')).href);

// 8765 静态根 = workhogee/；图片相对路径
const IMG = (sub, n) => `/marketing-spec/aview-rollout/frames/${sub}/shot${n}.jpg`;

// ============ 产品一：3C 头戴话务耳机（抖音中文）============
// mctx 取自真实 _mctx_test 输出（品类/颜色/材质/关键部件/联网痛点均真实）
const mctx3c = {
  language: { code: 'zh-CN', name: 'Simplified Chinese' },
  brand: '', brand_source: 'none',
  category: { zh: '头戴式有线话务耳机', en: 'wired over-ear headset with mic' },
  color: '银色、黑色', materials: ['塑料外壳', '海绵耳垫', '海绵麦克风套', '线材'],
  key_parts: ['麦克风杆', '耳罩单元', '头梁', '出线口'],
};
// 阿文 copy（仿 platform-skeleton.douyin：title=3秒钩子，body=痛点→解决→效果→动作指令）
const copy3c = { cps: { douyin: {
  title: '客服打工人注意，戴一天耳机耳朵不疼的秘密找到了。',
  body: '这副话务耳机耳罩全包住，海绵软垫软乎乎，久戴不压耳。可调节头梁，小头大头都贴合不夹头。长杆麦克风正对嘴，开会通话清清楚楚。点左下角小黄车，客服党闭眼入。',
}}};

// ============ 产品二：q7 二手车（TikTok 英文）============
const mctxQ7 = {
  language: { code: 'en', name: 'English' },
  brand: '', brand_source: 'none',
  category: { zh: '二手车', en: 'used car' },
};
const copyQ7 = { cps: { tiktok: {
  title: 'Stop scrolling if you need a reliable used car under 10k.',
  body: 'This one-owner sedan just passed inspection with a clean record. Cold AC, new tires, smooth highway ride. Tap the link in bio to book a test drive before it is gone.',
}}};

const jobs = [
  { prod: '3c', mctx: mctx3c, copy: copy3c, platform: 'douyin', images: [IMG('3c', 1), IMG('3c', 2), IMG('3c', 3)] },
  { prod: 'q7', mctx: mctxQ7, copy: copyQ7, platform: 'tiktok', images: [IMG('q7', 1), IMG('q7', 2), IMG('q7', 3)] },
];

const outDir = path.resolve(__dirname, '..', '..', '..', 'aview-artifacts');
fs.mkdirSync(outDir, { recursive: true });

for (const j of jobs) {
  const sb = buildStoryboard(j.mctx, j.copy, { platform: j.platform, images: j.images });
  if (!sb.ok) { console.error(j.prod, 'storyboard fail', sb.error); continue; }
  // 给每镜补上 TTS 产物文件名
  sb.shots.forEach((s, i) => {
    s.mp3File = `${j.prod}-shot${i + 1}.mp3`;
    s.wordsFile = `${j.prod}-shot${i + 1}.words.json`;
  });
  const out = path.join(outDir, `shots-${j.prod}.json`);
  fs.writeFileSync(out, JSON.stringify(sb, null, 2));
  console.log(`\n=== ${j.prod} (${sb.platform}/${sb.language}) → ${out} ===`);
  console.log(`shots=${sb.meta.totalShots} estTotalSec=${sb.meta.estTotalSec} hasHook=${sb.meta.hasHook} hasCta=${sb.meta.hasCta}`);
  for (const s of sb.shots) {
    console.log(`  [${s.role.padEnd(7)}] ${s.kenBurns.padEnd(11)} img=${s.image} «${s.narration}»`);
  }
}
