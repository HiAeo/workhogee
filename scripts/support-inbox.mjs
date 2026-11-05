// WorkHogee 在线客服 - 留言查看 / 导出（本地受控，经 wrangler 读 D1）
//
// 用法：
//   node scripts/support-inbox.mjs                 # 列出最近会话（默认云端库 --remote）
//   node scripts/support-inbox.mjs --local         # 查看本地 pages dev 库
//   node scripts/support-inbox.mjs --sid <sid>     # 查看某会话全部消息
//   node scripts/support-inbox.mjs --csv [文件路径] # 导出全量消息 CSV（UTF-8 BOM，Excel 可直接打开）
//
// 仅读取，不写入。ip/ua 等隐私列只在本机运营视图 / CSV 中出现，不会经公网 history 外泄。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFlags, queryRows, sqlLit, csvCell, fmtTime, SID_RE, fail, REPO_ROOT
} from './support-lib.mjs';

const flags = parseFlags(process.argv.slice(2));
const local = flags.targetLocal;
const where = local ? '本地库' : '云端库';

function roleLabel(role) {
  return role === 'bot' ? '客服' : '访客';
}

// ---- 全量导出 CSV ----
if ('csv' in flags) {
  const rows = queryRows(
    'SELECT m.cid, m.sid, m.role, m.text, m.email, m.path, m.beacon, m.ts, m.created_at, m.ip, m.ua ' +
    'FROM support_messages m ORDER BY m.created_at ASC, m.ts ASC',
    local
  );
  const header = ['落库时间', '消息ID', '会话ID', '角色', '内容', '留资邮箱', '落地页', 'beacon', '客户端时间', 'IP', 'UA'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([
      fmtTime(r.created_at), r.cid, r.sid, roleLabel(r.role), r.text,
      r.email, r.path, r.beacon, fmtTime(r.ts), r.ip, r.ua
    ].map(csvCell).join(','));
  }
  let outPath = flags.csv;
  if (!outPath) {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    outPath = path.join(dir, 'support-export-' + stamp + '.csv');
  } else if (!path.isAbsolute(outPath)) {
    outPath = path.resolve(REPO_ROOT, outPath);
  }
  // UTF-8 BOM，保证 Windows Excel 正确识别中文。
  fs.writeFileSync(outPath, '﻿' + lines.join('\r\n'), { encoding: 'utf8' });
  console.log('[support] 已导出 ' + rows.length + ' 条消息（' + where + '）-> ' + outPath);
  process.exit(0);
}

// ---- 单会话详情 ----
if (flags.sid) {
  if (!SID_RE.test(flags.sid)) fail('sid 不合规：' + flags.sid);
  const sess = queryRows('SELECT sid, created_at, last_at, email, path, ip, ua FROM support_sessions WHERE sid = ' + sqlLit(flags.sid), local);
  if (!sess.length) fail(where + '中不存在该会话：' + flags.sid);
  const s = sess[0];
  const msgs = queryRows(
    'SELECT cid, role, text, ts, created_at, beacon, ip, ua FROM support_messages WHERE sid = ' + sqlLit(flags.sid) +
    ' ORDER BY ts ASC, created_at ASC LIMIT 200',
    local
  );
  console.log('========== 会话详情（' + where + '） ==========');
  console.log('sid       : ' + s.sid);
  console.log('首次/最近 : ' + fmtTime(s.created_at) + '  /  ' + fmtTime(s.last_at));
  console.log('邮箱/落地 : ' + (s.email || '(无)') + '  |  ' + (s.path || '(无)'));
  console.log('IP / UA   : ' + (s.ip || '(无)') + '  |  ' + (s.ua || '(无)'));
  console.log('消息数     : ' + msgs.length);
  console.log('------------------------------------------------');
  msgs.forEach((m, i) => {
    console.log('[' + (i + 1) + '] ' + fmtTime(m.ts) + ' ' + roleLabel(m.role) +
      (m.beacon ? ' (beacon)' : '') + (m.ip ? '  <' + m.ip + '>' : ''));
    console.log('    ' + String(m.text || '').replace(/\r?\n/g, '\n    '));
  });
  process.exit(0);
}

// ---- 会话列表（默认） ----
const sessions = queryRows(
  'SELECT s.sid, s.created_at, s.last_at, s.email, s.path, ' +
  '(SELECT COUNT(1) FROM support_messages m WHERE m.sid = s.sid) AS msg_total, ' +
  "(SELECT COUNT(1) FROM support_messages m WHERE m.sid = s.sid AND m.role = 'me') AS msg_user, " +
  "(SELECT COUNT(1) FROM support_messages m WHERE m.sid = s.sid AND m.role = 'bot') AS msg_bot " +
  'FROM support_sessions s ORDER BY s.last_at DESC LIMIT 200',
  local
);

console.log('========== 客服会话列表（' + where + '，共 ' + sessions.length + ' 个） ==========');
if (!sessions.length) {
  console.log('（暂无会话）');
  process.exit(0);
}
sessions.forEach((s, i) => {
  const unreplied = Number(s.msg_user) > 0 && Number(s.msg_bot) === 0 ? '  [待回复]' : '';
  console.log(
    '#' + (i + 1) + '  ' + fmtTime(s.last_at) +
    '  访客 ' + s.msg_user + ' / 客服 ' + s.msg_bot + ' 条' + unreplied
  );
  console.log('    sid  : ' + s.sid);
  console.log('    邮箱 : ' + (s.email || '(无)') + '   落地页: ' + (s.path || '(无)'));
});
console.log('------------------------------------------------');
console.log('查看对话：node scripts/support-inbox.mjs' + (local ? ' --local' : '') + ' --sid <sid>');
console.log('回复访客：node scripts/support-reply.mjs' + (local ? ' --local' : '') + ' --sid <sid> --text "回复内容"');
