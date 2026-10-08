// video/poller.js —— 通用异步任务 submit+poll（对齐 http-util 硬超时/外部 signal）
import { fetchWithTimeout } from '../copywriting/http-util.js';

export async function submitAndPoll(submitUrl, submitBody, { tokenUrl, resultPath, externalSignal, totalMs = 10 * 60 * 1000, pollTimeoutMs = 15000, backoffMs = 2000, maxConcurrent = 1 } = {}) {
  const root = new AbortController();
  const onAbort = () => root.abort();
  if (externalSignal) {
    if (externalSignal.aborted) root.abort();
    else externalSignal.addEventListener('abort', onAbort, { once: true });
  }
  const deadline = Date.now() + totalMs;
  const sub = await fetchWithTimeout(submitUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (submitBody._token || '') }, body: JSON.stringify(submitBody) }, pollTimeoutMs, root.signal);
  const job = await sub.json();
  const id = job.id || job.job_id;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, backoffMs));
    const r = await fetchWithTimeout(tokenUrl(id), { headers: { Authorization: 'Bearer ' + (submitBody._token || '') } }, pollTimeoutMs, root.signal);
    const j = await r.json();
    if (j.state === 'success' || j.status === 'done') return { ok: true, job: j };
    if (j.state === 'failed' || j.status === 'error') return { ok: false, rejected: true, job: j };
  }
  return { ok: false, reason: 'poll_timeout' };
}
export default { submitAndPoll };
