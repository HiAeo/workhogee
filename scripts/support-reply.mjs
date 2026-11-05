// WorkHogee 在线客服 - 人工回复写回（本地受控，以 role='bot' 写入 D1）
//
// 用法：
//   node scripts/support-reply.mjs --sid <sid> --text "回复内容"
//   node scripts/support-reply.mjs --sid <sid> --file reply.txt   # 长文本 / 多行 / 含中文，推荐用文件
//   加 --local 写入本地 pages dev 库；缺省 / --remote 写入云端生产库。
//
// 安全：该能力只存在于本机（凭 wrangler OAuth），公网没有任何匿名回复入口。
// 每次执行写入一条客服消息；访客下次打开 widget 或轮询 history 时即可看到。

import fs from 'node:fs';
import path from 'node:path';
import {
  parseFlags, queryRows, executeSqlFile, sqlLit, newReplyCid,
  SID_RE, MAX_TEXT, fail
} from './support-lib.mjs';

const flags = parseFlags(process.argv.slice(2));
const local = flags.targetLocal;
const where = local ? '本地库' : '云端库';

function usage() {
  console.log(
    '用法：\n' +
    '  node scripts/support-reply.mjs --sid <sid> --text "回复内容"\n' +
    '  node scripts/support-reply.mjs --sid <sid> --file <utf8 文本文件>\n' +
    '  可选 --local（默认 --remote 云端库）'
  );
}
if (flags.help) { usage(); process.exit(0); }

if (!flags.sid || !SID_RE.test(flags.sid)) fail('缺少或非法的 --sid。先用 support-inbox.mjs 查到有效 sid。');

let text;
if (flags.file) {
  const p = path.isAbsolute(flags.file) ? flags.file : path.resolve(process.cwd(), flags.file);
  if (!fs.existsSync(p)) fail('回复文件不存在：' + p);
  text = fs.readFileSync(p, 'utf8');
} else {
  text = flags.text || '';
}
text = text.replace(/\s+$/,'').replace(/^\s+/, '');
if (!text) { usage(); fail('回复内容为空（--text 或 --file 二选一）。'); }
if (text.length > MAX_TEXT) fail('回复超出 ' + MAX_TEXT + ' 字上限，当前 ' + text.length + ' 字。');

// 仅允许回复已存在的会话，杜绝向幽灵 sid 写数据。
const sess = queryRows('SELECT sid FROM support_sessions WHERE sid = ' + sqlLit(flags.sid) + ' LIMIT 1', local);
if (!sess.length) fail(where + '中不存在该会话，无法回复：' + flags.sid);

const now = Date.now();
const cid = newReplyCid(now);

// 中文 / 换行通过 UTF-8 SQL 文件提交，规避命令行编码；单引号已在 sqlLit 内翻倍转义。
const sql =
  'INSERT OR IGNORE INTO support_messages ' +
  '(cid, sid, role, text, email, path, beacon, ts, ip, ua, created_at) VALUES (' +
  [sqlLit(cid), sqlLit(flags.sid), "'bot'", sqlLit(text), "''", "''", '0', String(now), "''", "''", String(now)].join(', ') +
  ');\n' +
  'UPDATE support_sessions SET last_at = ' + now + ' WHERE sid = ' + sqlLit(flags.sid) + ';\n';

executeSqlFile(sql, local);

console.log('[support] 已写入客服回复（' + where + '）');
console.log('  cid : ' + cid);
console.log('  sid : ' + flags.sid);
console.log('  时间: ' + new Date(now).toLocaleString());
console.log('  内容: ' + text.replace(/\r?\n/g, '\n        '));
console.log('提示：访客端打开 widget 后会在数秒内经 /api/support/history 拉到该回复。');
