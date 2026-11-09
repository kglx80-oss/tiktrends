import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  etatLotSpatial, gestesContexteJarvis, reponseLisible,
  type DemandeContexteJarvis, type GesteJarvis,
} from '@tiktrends/core';
import type { Session } from './auth';
import { effectiveAccess } from './access';
import { canAccess, FEATURES } from './rbac';
import { chargerLots, type AdLue, type LotLu } from '../app/(spatial)/sp/adsmap/donnees';

/**
 * Jarvis qui AGIT, sans rien appliquer seul (lot 5 bis V5) · le côté serveur.
 * Les règles vivent au noyau (`C/spatial/jarvis/gestes.ts`).
 *
 * Deux lectures, jamais une écriture, aucun modèle :
 *  · la RÉPONSE désignée par une adresse (`?reponse=<uuid>`) · relue dans la
 *    portée de la session (espace, marque ACTIVE, personne, rôle « assistant »)
 *    · une réponse d'une autre marque, d'une autre personne, inconnue ou mal
 *    formée rend `null` · l'appelant dit `REFUS_GESTE_JARVIS` ;
 *  · le CONTEXTE (lot ou hypothèse) · la fonction `adsmap`, puis
 *    `chargerLots(espace, marque ACTIVE)`, la lecture des écrans Résultats ·
 *    un lot ou une ad d'une autre marque n'y figure pas.
 */

const ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionLue = Pick<Session, 'workspaceId' | 'role' | 'plan' | 'user' | 'equipe'>;

/** Le texte lisible d'une réponse de Jarvis, dans la portée · `null` hors portée. */
export async function lireReponseJarvis(s: SessionLue, brandId: string, id: string): Promise<string | null> {
  if (!db || !UUID.test(id)) return null;
  const M = schema.jarvisMessages;
  try {
    const [m] = await db.select({ content: M.content }).from(M)
      .where(and(eq(M.id, id), eq(M.workspaceId, s.workspaceId), eq(M.brandId, brandId), eq(M.userId, s.user.id), eq(M.role, 'assistant')))
      .limit(1);
    return m ? reponseLisible(m.content).texte : null;
  } catch {
    return null;
  }
}

export interface ContexteGestesLu {
  /** Les variantes du contexte · celles du lot, ou la seule ad de l'hypothèse. */
  ads: AdLue[];
  /** Le lot à conclure · le lot joint, ou celui de l'hypothèse. */
  lot: LotLu | null;
  etat: ReturnType<typeof etatLotSpatial> | null;
}

/** Le lot ou l'hypothèse, relu dans la marque active · `null` hors portée (autre marque, sans droit, inconnu). */
export async function lireContexteGestes(s: SessionLue, brandId: string, demande: DemandeContexteJarvis, maintenant: Date = new Date()): Promise<ContexteGestesLu | null> {
  if (demande.type !== 'lot' && demande.type !== 'hypothese') return null;
  if (!canAccess(effectiveAccess(s), ADSMAP)) return null;
  try {
    const d = await chargerLots(s.workspaceId, brandId, maintenant);
    if (demande.type === 'lot') {
      const lot = d.lots.find((l) => l.id === demande.id);
      return lot ? { ads: lot.ads, lot, etat: etatLotSpatial(lot, d.ctx) } : null;
    }
    const ad = [...d.lots.flatMap((l) => l.ads), ...d.horsLot].find((a) => a.id === demande.id);
    if (!ad) return null;
    const lot = ad.lotId ? d.lots.find((l) => l.id === ad.lotId) ?? null : null;
    return { ads: [ad], lot, etat: lot ? etatLotSpatial(lot, d.ctx) : null };
  } catch {
    return null;
  }
}

/** Les gestes d'un contexte joint à `/jarvis` · `null` pour une page de Résultats, un projet, ou hors portée. */
export async function gestesPourContexte(s: SessionLue, brandId: string, demande: DemandeContexteJarvis, maintenant: Date = new Date()): Promise<{ iterer: GesteJarvis; conclure: GesteJarvis } | null> {
  const c = await lireContexteGestes(s, brandId, demande, maintenant);
  if (!c) return null;
  return gestesContexteJarvis({
    type: demande.type, id: demande.id, ads: c.ads,
    lot: c.lot && c.etat ? { id: c.lot.id, etat: c.etat, ads: c.lot.ads } : null,
  });
}
