// copywriting/index.js —— 阿文（文案伙计）模块统一导出
import { generateCopy } from './engine.js';
import { buildPrefill, getInfoCard } from './info-card.js';
import { leakCheck, noteLeakAndDecide } from './leak-gate.js';
import { qualityCheck } from './quality-gate.js';
import { PLATFORMS, PLATFORM_KEYS, CN_PLATFORMS, EN_PLATFORMS } from './platform-skeleton.js';
import { getTrendPlaybook } from './platform-trends.js';

export {
  generateCopy,        // 主入口：generateCopy(env, {mctx|images, platforms, infoCard, media, costBook})
  buildPrefill,       // buildPrefill(mctx) -> {fields, values}  智能预填补录卡
  getInfoCard,        // 旧静态兼容表
  leakCheck, noteLeakAndDecide,
  qualityCheck,
  PLATFORMS, PLATFORM_KEYS, CN_PLATFORMS, EN_PLATFORMS,
  getTrendPlaybook
};
export default { generateCopy, buildPrefill, getInfoCard, leakCheck, qualityCheck, PLATFORMS, getTrendPlaybook };
