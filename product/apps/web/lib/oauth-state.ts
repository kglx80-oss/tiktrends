import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * État OAuth signé (anti-CSRF) · HMAC avec AUTH_SECRET.
 * Pas de repli en dur : un secret connu rendrait la protection CSRF inopérante.
 * Sans AUTH_SECRET, on signe avec une clé aléatoire propre au process (les états
 * ne vivent que 15 min, donc l'impact d'un redémarrage est nul).
 */
const FALLBACK = randomBytes(48).toString('base64url');
function secret(): string {
  const v = process.env.AUTH_SECRET;
  return v && v !== 'change-me' ? v : FALLBACK;
}

export function signState(payload: Record<string, string | number>): string {
  const data = Buffer.from(JSON.stringify({ ...payload, t: Date.now() })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyState<T = Record<string, unknown>>(state: string | null | undefined, maxAgeMs = 15 * 60_000): T | null {
  if (!state) return null;
  const [data, sig] = state.split('.');
  if (!data || !sig) return null;
  // Comparaison à TEMPS CONSTANT · une comparaison de chaînes s'arrête au premier
  // octet qui diffère, ce qui laisse mesurer la signature octet par octet. On
  // compare les digests bruts avec `timingSafeEqual` · la garde de longueur évite
  // qu'il lève (il exige deux buffers de même taille) et ne fuit rien de plus que
  // « mauvaise longueur », trivial pour qui connaît SHA-256.
  const expected = createHmac('sha256', secret()).update(data).digest();
  const provided = Buffer.from(sig, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as { t?: number } & T;
    if (payload.t && Date.now() - payload.t > maxAgeMs) return null;
    return payload as T;
  } catch { return null; }
}
