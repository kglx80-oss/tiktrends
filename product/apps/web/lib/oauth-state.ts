import { createHmac } from 'crypto';

/** État OAuth signé (anti-CSRF) · HMAC avec AUTH_SECRET. */
function secret(): string { return process.env.AUTH_SECRET || 'tiktrends-dev-key'; }

export function signState(payload: Record<string, string | number>): string {
  const data = Buffer.from(JSON.stringify({ ...payload, t: Date.now() })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyState<T = Record<string, unknown>>(state: string | null | undefined, maxAgeMs = 15 * 60_000): T | null {
  if (!state) return null;
  const [data, sig] = state.split('.');
  if (!data || !sig) return null;
  const expected = createHmac('sha256', secret()).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as { t?: number } & T;
    if (payload.t && Date.now() - payload.t > maxAgeMs) return null;
    return payload as T;
  } catch { return null; }
}
