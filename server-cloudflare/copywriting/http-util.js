// copywriting/http-util.js —— 带硬超时与外部取消信号的 fetch（API 中立，ES module）
export class FetchTimeoutError extends Error {
  constructor(ms) { super('fetch timeout after ' + ms + 'ms'); this.name = 'FetchTimeoutError'; }
}
export class FetchAbortError extends Error {
  constructor() { super('fetch aborted'); this.name = 'FetchAbortError'; }
}

export function fetchWithTimeout(url, options = {}, ms = 75000, externalSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new FetchTimeoutError(ms)), ms);
  const onExt = () => ctrl.abort(new FetchAbortError());
  if (externalSignal) {
    if (externalSignal.aborted) onExt();
    else externalSignal.addEventListener('abort', onExt, { once: true });
  }
  return fetch(url, { ...options, signal: ctrl.signal })
    .catch((e) => {
      if (e && (e.name === 'AbortError' || e instanceof FetchTimeoutError || e instanceof FetchAbortError)) {
        throw (e.cause instanceof Error) ? e.cause : e;
      }
      throw e;
    })
    .finally(() => {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExt);
    });
}
export default { fetchWithTimeout, FetchTimeoutError, FetchAbortError };
