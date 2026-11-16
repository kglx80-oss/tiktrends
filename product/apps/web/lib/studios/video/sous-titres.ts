import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import {
  ACTION_AUDIT_CONTROLE_PAROLE, FICHIER_POLICE_SOUS_TITRES, NON_INCLUS_SOUS_TITRES, motsDuJournal, motsDuMontage, sousTitresAss, instantsDeControle, nonInclusApresSousTitres,
  type ConstatSousTitres, type MotHorodate, type PlanRenduFinal,
} from '@tiktrends/core';
import { brulerSousTitresFfmpeg, type EntreeSousTitres, type ResultatSousTitresVideo } from '@tiktrends/integrations';
import type { ExecStudio } from '../execution/types';
import { dossierPolicesEmbarquees } from '../rendu/polices';

/**
 * Studios · sous-titres de la vidéo finale, posés sur les mots VRAIMENT dits.
 *
 * Les mots horodatés viennent du contrôle de la parole des prises (worker,
 * audit `media.speech.control`, un par prise) · jamais de la narration écrite.
 * La passe ffmpeg est SÉPARÉE de l'assemblage : elle prend les octets du MP4
 * assemblé et rend d'autres octets ; « Sous-titres » ne quitte la liste « non
 * inclus » que si la relecture du fichier produit a vu le texte
 * (`nonInclusApresSousTitres`).
 */

/** Les mots de chaque plan · le dernier contrôle de la prise retenue pour le plan (son média). */
export async function motsDesPrises(ex: ExecStudio, p: { workspaceId: string; brandId: string }, segments: PlanRenduFinal['segments']): Promise<Record<string, MotHorodate[]>> {
  if (segments.length === 0) return {};
  const AU = schema.studioAuditEvents;
  const lignes = await ex.select({ details: AU.details, occurredAt: AU.occurredAt }).from(AU).where(and(
    eq(AU.action, ACTION_AUDIT_CONTROLE_PAROLE), eq(AU.workspaceId, p.workspaceId), eq(AU.brandId, p.brandId),
    inArray(sql<string>`${AU.details}->>'assetId'`, segments.map((s) => s.assetId)),
  )).orderBy(desc(AU.occurredAt)).limit(200);
  const out: Record<string, MotHorodate[]> = {};
  for (const s of segments) {
    const l = lignes.find((x) => (x.details as { assetId?: unknown } | null)?.assetId === s.assetId && motsDuJournal(x.details));
    const mots = l ? motsDuJournal(l.details) : null;
    if (mots) out[s.shotId] = mots;
  }
  return out;
}

export interface PasseSousTitres {
  octets: Uint8Array;
  dureeMs: number;
  nonInclus: string[];
  constat: ConstatSousTitres | null;
}

/**
 * La passe des sous-titres sur un MP4 assemblé · rend les octets à conserver
 * (brûlés si le constat le dit, sinon ceux de l'assemblage, intacts) et la
 * liste « non inclus » relue d'après le constat.
 */
export async function passeSousTitres(
  ex: ExecStudio,
  e: { portee: { workspaceId: string; brandId: string }; plan: PlanRenduFinal; octets: Uint8Array; dureeMs: number },
  bruler: (x: EntreeSousTitres) => Promise<ResultatSousTitresVideo> = (x) => brulerSousTitresFfmpeg(x),
): Promise<PasseSousTitres> {
  const sans = (constat: ConstatSousTitres | null): PasseSousTitres => ({ octets: e.octets, dureeMs: e.dureeMs, nonInclus: nonInclusApresSousTitres(e.plan.nonInclus, constat), constat });
  // Sous-titres désactivés, ou aucun plan parlé : rien à poser, la liste ne change pas.
  if (!e.plan.nonInclus.includes(NON_INCLUS_SOUS_TITRES)) return { octets: e.octets, dureeMs: e.dureeMs, nonInclus: [...e.plan.nonInclus], constat: null };
  const mots = motsDuMontage(e.plan.segments, await motsDesPrises(ex, e.portee, e.plan.segments));
  if (mots.length === 0) return sans({ brules: false, raison: 'aucune prise parlée transcrite' });
  const st = sousTitresAss(mots, { largeur: e.plan.largeur, hauteur: e.plan.hauteur, dureeMs: e.dureeMs });
  if (st.cartons.length === 0) return sans({ brules: false, raison: 'aucun mot affichable' });
  const polices = dossierPolicesEmbarquees(FICHIER_POLICE_SOUS_TITRES);
  if (!polices) return sans({ brules: false, raison: 'police Liberation Sans introuvable sur le serveur' });
  const r = await bruler({
    octets: e.octets, ass: st.ass, largeur: e.plan.largeur, hauteur: e.plan.hauteur, dureeMs: e.dureeMs, fps: e.plan.fps,
    zone: st.page.zone, controles: instantsDeControle(st.cartons, e.dureeMs), dossierPolices: polices,
  });
  if (!r.ok) {
    console.error(`[studios] sous-titres non brûlés · ${r.cause} · ${r.motif}`);
    return sans(r.constat);
  }
  return { octets: r.octets, dureeMs: e.dureeMs, nonInclus: nonInclusApresSousTitres(e.plan.nonInclus, r.constat), constat: r.constat };
}
