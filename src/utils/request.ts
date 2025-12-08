export async function apiFetch(path: string, body: any, options?: { timeoutMs?: number; retries?: number; retryDelayMs?: number }) {
  const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';
  const timeoutMs = options?.timeoutMs ?? 180000;
  const retries = options?.retries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 2000;
  let lastError: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = data;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
          continue;
        }
        throw new Error(typeof data?.error === 'string' ? data.error : '请求失败');
      }
      return data;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}
