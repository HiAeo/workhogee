// aview/index.js —— 阿视（短视频伙计）后端聚合出口
// 分镜编排：从已构建好的统一上下文 mctx + 阿文文案 copy → 图文成片镜头。
// 注意：帧质检（无黑帧/字幕对齐）由前端 Playwright 真机抽帧完成；本目录不碰 Seedance 按秒计费。
import { buildStoryboard, pickPlatformCopy, splitNarration, estimateSpeakSec } from './storyboard.js';

export { buildStoryboard, pickPlatformCopy, splitNarration, estimateSpeakSec };
export default { buildStoryboard, pickPlatformCopy, splitNarration, estimateSpeakSec };
