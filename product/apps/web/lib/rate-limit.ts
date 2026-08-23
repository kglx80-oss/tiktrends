// Limiteur anti-force-brute simple (en mémoire du process web).
// Suffisant pour une instance unique ; se réinitialise au redémarrage.
// Pour du multi-instance, remplacer par un compteur Redis.

interface Bucket { count: number; resetAt: number }
const store = new Map<string, Bucket>();

export interface RateResult { ok: boolean; retryAfterSec: number; remaining: number }

/**
 * Autorise jusqu'à `max` tentatives par fenêtre `windowMs` pour une `key`.
 * Compte chaque appel comme une tentative.
 */
export function hit(key: string, max = 6, windowMs = 15 * 60_000): RateResult {
  const now = Date.now();
  const b = store.get(key);

  if (!b || now >= b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0, remaining: max - 1 };
  }

  b.count += 1;
  if (b.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000), remaining: 0 };
  }
  return { ok: true, retryAfterSec: 0, remaining: max - b.count };
}

/** Réinitialise le compteur (ex : après une connexion réussie). */
export function reset(key: string): void {
  store.delete(key);
}

// Purge périodique des buckets expirés (évite une fuite mémoire sur le long terme).
if (typeof setInterval !== 'undefined') {
  const t = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of store) if (now >= b.resetAt) store.delete(k);
  }, 10 * 60_000);
  // Ne bloque pas l'arrêt du process.
  (t as { unref?: () => void }).unref?.();
}
