// WorkHogee 在线客服 - 本地受控运营工具共享库（个人主体 / 单运营阶段）
//
// 设计边界（务必保持）：
//   1. 只在本机运行，通过已登录的 wrangler OAuth 操作 D1，不引入任何额外密钥或令牌。
//   2. 公网 Pages Functions 不新增任何管理 / 回复端点：客服回复只能从这里以 role='bot' 写回。
//   3. 不读取、不依赖 server-cloudflare/.dev.vars，仅调用同仓已安装的 wrangler。
//   4. 默认操作云端库（--remote）；--local 仅用于本地 pages dev 联调，二者是两套独立库。
//
// 运行：Node >= 18，仅使用内置模块，无需 npm install。

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_NAME = 'workhogee-support';
export const MAX_TEXT = 2000;

// 与 functions/api/support/_lib.js 的白名单保持一致。
export const SID_RE = /^[A-Za-z0-9._-]{4,80}$/;

// 直接用 node 启动 wrangler 的 JS 入口，绕过 .bin/*.cmd 批处理：
// 否则 Windows 经 cmd 传参会把含空格的 --command SQL 拆散，中文路径也受控制台代码页影响。
const WRANGLER_JS = path.join(
  REPO_ROOT,
  'server-cloudflare',
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js'
);
const LOCAL_STATE = path.join(REPO_ROOT, '.local-serve', 'state');
const LOCAL_CONFIG = path.join(REPO_ROOT, '.local-serve', 'wrangler.toml');

// 极简参数解析：支持 --key value，以及布尔开关 --local / --remote / --help。
export function parseFlags(argv) {
  const flags = { _: [], local: false, remote: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'local') { flags.local = true; continue; }
      if (key === 'remote') { flags.remote = true; continue; }
      if (key === 'help') { flags.help = true; continue; }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = '';
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      flags._.push(a);
    }
  }
  // 显式 --local 走本地库；缺省或 --remote 走云端库。
  flags.targetLocal = flags.local === true && flags.remote !== true;
  return flags;
}

// 组装 d1 execute 的公共参数。
function d1BaseArgs(local) {
  const args = ['d1', 'execute', DB_NAME];
  if (local) {
    args.push('--local', '--persist-to', LOCAL_STATE, '-c', LOCAL_CONFIG);
  } else {
    args.push('--remote');
  }
  args.push('-y');
  return args;
}

// 调用 wrangler 并返回进程结果；CI=true 关闭交互式确认，避免无 TTY 卡住。
export function runWrangler(extraArgs, local) {
  if (!fs.existsSync(WRANGLER_JS)) {
    throw new Error('找不到 wrangler 入口：' + WRANGLER_JS + '，请先确认 server-cloudflare 依赖已安装。');
  }
  const args = [WRANGLER_JS].concat(d1BaseArgs(Boolean(local)), extraArgs);
  const res = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    shell: false, // 原生 argv 直传，SQL 空格与中文路径都不被 shell 改写
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' }
  });
  if (res.error) throw res.error;
  return res;
}

// 以 --json 执行查询，返回结果行数组（解析失败或非查询返回 []）。
export function queryRows(sql, local) {
  const res = runWrangler(['--json', '--command', sql], local);
  if (res.status !== 0) {
    throw new Error('wrangler 查询失败：\n' + (res.stderr || res.stdout));
  }
  let parsed;
  try {
    parsed = JSON.parse(res.stdout.trim());
  } catch (e) {
    throw new Error('无法解析 wrangler --json 输出：\n' + res.stdout);
  }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return (first && Array.isArray(first.results)) ? first.results : [];
}

// 通过临时 SQL 文件执行（含中文 / 多行文本时走这里，彻底绕开命令行编码问题）。
export function executeSqlFile(sqlText, local) {
  const file = path.join(os.tmpdir(), 'whg-support-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.sql');
  // UTF-8 无 BOM；wrangler / SQLite 按 UTF-8 读取。
  fs.writeFileSync(file, sqlText, { encoding: 'utf8' });
  try {
    const res = runWrangler(['--file', file], local);
    if (res.status !== 0) {
      throw new Error('wrangler 执行失败：\n' + (res.stderr || res.stdout));
    }
    return res.stdout || '';
  } finally {
    try { fs.unlinkSync(file); } catch (e) { /* 临时文件清理失败不致命 */ }
  }
}

// SQL 字符串字面量转义：去除 NUL，单引号翻倍。所有用户输入都经参数化思路手工转义后再拼字面量。
export function sqlLit(v) {
  return "'" + String(v == null ? '' : v).replace(/\u0000/g, '').replace(/'/g, "''") + "'";
}

// 毫秒时间戳 -> 本地可读时间 YYYY-MM-DD HH:mm:ss。
export function fmtTime(ms) {
  const n = Number(ms);
  if (!isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  const p = (x) => (x < 10 ? '0' : '') + x;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

// RFC 4180 CSV 单元格转义。
export function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 生成符合 CID_RE([A-Za-z0-9._-]{4,90}) 的客服回复幂等 ID。
export function newReplyCid(now) {
  const cid = 'r-' + Number(now).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  if (!/^[A-Za-z0-9._-]{4,90}$/.test(cid)) throw new Error('生成的回复 cid 不合规：' + cid);
  return cid;
}

export function fail(msg) {
  console.error('[support] ' + msg);
  process.exit(1);
}
