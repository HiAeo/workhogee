/* =====================================================================
 * WorkHogee · 确定性语种检测 / 校验（无 LLM、可在 Worker 与测试中复用）
 * ---------------------------------------------------------------------
 * 用于上屏文案的语种硬校验，弥补单次大 VL 调用对日语等小语种遵循不稳、
 * Seedream 烤小语种文字易变英文/乱码/截断的问题。
 * 支持集合：en / zh-CN / ja / ko。判定基于文字脚本（kana / hangul / han / latin）。
 * ===================================================================*/

const RE = {
  hiragana: /[぀-ゟ]/g,
  katakana: /[゠-ヿ]/g,
  hangul: /[가-힯ᄀ-ᇿ㄰-㆏]/g,
  han: /[一-鿿豈-﫿]/g,
  latin: /[a-zA-ZÀ-ɏ]/g
};

function count(re, s) { const m = String(s || '').match(re); return m ? m.length : 0; }

export function scriptProfile(text) {
  const s = String(text || '');
  const hiragana = count(RE.hiragana, s);
  const katakana = count(RE.katakana, s);
  const hangul = count(RE.hangul, s);
  const han = count(RE.han, s);
  const latin = count(RE.latin, s);
  return { hiragana, katakana, kana: hiragana + katakana, hangul, han, latin, len: s.replace(/\s/g, '').length };
}

/**
 * 检测文本主导语种。
 * @returns 'ja' | 'ko' | 'zh-CN' | 'en' | 'mixed' | 'empty'
 */
export function detectLangCode(text) {
  const p = scriptProfile(text);
  if (!p.len) return 'empty';
  const scriptTotal = p.kana + p.hangul + p.han + p.latin;
  if (!scriptTotal) return 'empty';
  const r = {
    kana: p.kana / scriptTotal,
    hangul: p.hangul / scriptTotal,
    han: p.han / scriptTotal,
    latin: p.latin / scriptTotal
  };
  // 日语：真实日文几乎必含假名（平/片名）。含假名即判日（即使混大量汉字）。
  if (p.kana > 0 && (r.kana >= 0.08 || p.hangul === 0)) return 'ja';
  if (p.hangul > 0 && r.hangul >= 0.15) return 'ko';
  if (p.hangul > 0 && p.kana === 0 && r.latin < 0.5) return 'ko';
  // 中文：汉字主导且无假名/谚文
  if (r.han >= 0.5 && p.kana === 0 && p.hangul === 0) return 'zh-CN';
  if (r.latin >= 0.85 && p.kana === 0 && p.hangul === 0 && p.han === 0) return 'en';
  // 纯拉丁（允许极少量符号）
  if (p.latin > 0 && p.kana === 0 && p.hangul === 0 && p.han === 0) return 'en';
  // 汉字+少量拉丁（中文里夹英文词）仍算中文
  if (r.han >= 0.5 && p.kana === 0 && p.hangul === 0) return 'zh-CN';
  return 'mixed';
}

function norm(code) {
  let c = String(code || '').toLowerCase();
  if (c === 'zh' || c === 'zh-cn') c = 'zh-CN';
  return c;
}

/**
 * 校验单段文本是否符合目标语种。
 * @returns {ok, detected, profile, reasons:[]}
 */
export function validateTextLang(text, expected) {
  const exp = norm(expected);
  const p = scriptProfile(text);
  const detected = detectLangCode(text);
  const reasons = [];
  if (detected === 'empty') return { ok: false, detected, profile: p, reasons: ['empty'] };

  if (exp === 'ja') {
    if (p.kana === 0) reasons.push('ja_requires_kana');           // 没有假名=不是真正日文（可能是中文/英文）
    if (p.hangul > 0) reasons.push('hangul_leak');
    const scriptTotal = p.kana + p.han + p.latin + p.hangul;
    if (p.latin / Math.max(1, scriptTotal) > 0.55) reasons.push('latin_dominant'); // 英文占比过高
  } else if (exp === 'ko') {
    if (p.hangul === 0) reasons.push('ko_requires_hangul');
    if (p.kana > 0) reasons.push('kana_leak');
  } else if (exp === 'zh-CN') {
    if (p.han === 0) reasons.push('zh_requires_han');
    if (p.kana > 0) reasons.push('kana_leak');
    if (p.hangul > 0) reasons.push('hangul_leak');
  } else if (exp === 'en') {
    if (p.kana > 0 || p.hangul > 0 || p.han > 0) reasons.push('non_latin_leak');
    if (p.latin === 0) reasons.push('en_requires_latin');
  }
  // detected 与期望明显冲突时补一条
  if (detected !== 'mixed' && detected !== exp && !reasons.length) reasons.push('detected_' + detected);
  return { ok: reasons.length === 0, detected, profile: p, reasons };
}

/** 遍历 on_screen_text 所有上屏字段做语种校验，返回违规列表。 */
export function validateOnScreen(ost = {}, expected) {
  const violations = [];
  const check = (field, val) => {
    const s = String(val || '').trim();
    if (!s) return;
    const r = validateTextLang(s, expected);
    if (!r.ok) violations.push({ field, text: s.slice(0, 60), reasons: r.reasons, detected: r.detected });
  };
  check('headline', ost.headline);
  check('subheadline', ost.subheadline);
  (ost.icons || []).forEach((i, idx) => check('icons[' + idx + '].label', i && i.label));
  (ost.panels || []).forEach((pn, idx) => {
    check('panels[' + idx + '].title', pn && pn.title);
    check('panels[' + idx + '].caption', pn && pn.caption);
  });
  (ost.callouts || []).forEach((c, idx) => check('callouts[' + idx + '].label', c && c.label));
  (ost.bullets || []).forEach((b, idx) => check('bullets[' + idx + ']', b));
  return violations;
}

export { norm as normalizeLang };
