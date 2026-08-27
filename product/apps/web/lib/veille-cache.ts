import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { InspoAd } from '@tiktrends/integrations';

/**
 * Cache global de la veille par niche (données marché, non liées à un workspace).
 * Stocké dans app_settings ; TTL 7 jours (cadence veille hebdo). Évite de rebrûler
 * des crédits Trendtrack à chaque visite.
 */
export const VEILLE_TTL_MS = 7 * 24 * 3600 * 1000;

/**
 * Âge minimum avant qu'un « Rafraîchir » soit réellement honoré.
 *
 * Le cache est global par (pays, niche) : sans ce plancher, un simple rechargement
 * de /inspo/scale?refresh=1 en boucle brûle un appel Trendtrack à chaque fois, et
 * la facture est pour nous. Six heures laissent quatre rafraîchissements par jour
 * et par niche, largement au-dessus de la cadence réelle d'une veille hebdomadaire.
 */
export const VEILLE_REFRESH_MIN_AGE_MS = 6 * 3600 * 1000;

/** Le cache est-il assez vieux pour qu'un rafraîchissement manuel soit accepté ? */
export function refreshAllowed(cache: VeilleCache | null): boolean {
  if (!cache) return true;
  return Date.now() - new Date(cache.fetchedAt).getTime() >= VEILLE_REFRESH_MIN_AGE_MS;
}

export interface VeilleCache { fetchedAt: string; ads: InspoAd[] }

const key = (country: string, niche: string) => `veille:${country.toUpperCase()}:${niche.trim().toLowerCase().slice(0, 80)}`;

export async function getVeilleCache(country: string, niche: string): Promise<VeilleCache | null> {
  if (!db) return null;
  try {
    const [row] = await db.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, key(country, niche))).limit(1);
    const v = row?.value as VeilleCache | undefined;
    return v && Array.isArray(v.ads) ? v : null;
  } catch { return null; }
}

export function isFresh(cache: VeilleCache | null): boolean {
  if (!cache) return false;
  return Date.now() - new Date(cache.fetchedAt).getTime() < VEILLE_TTL_MS;
}

export async function setVeilleCache(country: string, niche: string, ads: InspoAd[]): Promise<void> {
  if (!db) return;
  const value: VeilleCache = { fetchedAt: new Date().toISOString(), ads };
  try {
    await db.insert(schema.appSettings).values({ key: key(country, niche), value })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  } catch { /* best-effort */ }
}
