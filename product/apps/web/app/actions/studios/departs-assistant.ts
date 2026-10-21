'use server';

import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { annonceObservee, briefDepuisTest, objectifDepuisIteration, estGagnanteValidee, type VerdictValue } from '@tiktrends/core';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../lib/studios/interrupteurs';
import { getActiveBrand } from '../../../lib/brands';
import { adsDeLaMarque } from '../../../lib/adsmap-marque';
import { assetAiUrl } from '../../../lib/asset-ai-url';
import { listAdsAction } from '../adsmap';
import { adDetailAction } from '../adsmap-verdict';
import { chargerSources } from '../../../lib/studios/sources/sources';

export type OrigineDepartAssistant = 'veille' | 'iteration';
export interface ChoixDepartAssistant { id: string; titre: string; detail: string; apercu: string | null }
export interface DepartAssistant {
  origine: OrigineDepartAssistant;
  id: string;
  titre: string;
  intention: string;
  /** Identifiants uniquement. Les sources seront relues à la création. */
  sources: { type: 'sauvegarde'; id: string }[];
  /** Le test Adsmap est une provenance, pas une annonce concurrente. */
  testId: string | null;
}

/** Lecture seulement. Aucune proposition, création de projet ou dépense à l'ouverture. */
export async function listerDepartsAssistant(origine: OrigineDepartAssistant): Promise<{ ok: true; choix: ChoixDepartAssistant[] } | { ok: false; message: string }> {
  const g = await gardeSources('studio.read');
  if (!g.ok) return { ok: false, message: g.message };
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return { ok: false, message: coupe.message };
  const marque = await getActiveBrand(g.ctx.workspaceId);
  if (!marque || !g.ctx.marques.includes(marque.id)) return { ok: false, message: 'Choisissez une marque accessible.' };
  if (origine === 'iteration') {
    // Cette lecture refait sa propre garde Adsmap et la portée marque active.
    const r = await listAdsAction({ comparableOnly: true });
    if (r.error) return { ok: false, message: r.error };
    return { ok: true, choix: (r.rows ?? []).filter((r) => r.verdictStatus === 'validated' && estGagnanteValidee(r.verdict as VerdictValue, r.comparable === true) && r.learnings.length > 0).slice(0, 100).map((r) => ({ id: r.id, titre: `${r.concept} · ${r.variantCode}`, detail: r.learnings.join(' · ') || 'Test gagnant arbitré · apprentissages à relire', apercu: r.assetUrl ? assetAiUrl(r.assetUrl, g.ctx.workspaceId) : null })) };
  }
  if (origine !== 'veille') return { ok: false, message: 'Point de départ inconnu.' };
  if (!g.veilleOuverte) return { ok: false, message: 'La Veille est indisponible.' };
  const t = schema.savedAds;
  const lignes = await db.select({ id: t.id, snapshot: t.snapshot }).from(t).where(and(eq(t.workspaceId, g.ctx.workspaceId), or(eq(t.brandId, marque.id), isNull(t.brandId)))).orderBy(desc(t.createdAt)).limit(100);
  return { ok: true, choix: lignes.flatMap((l) => {
    const annonce = annonceObservee(l.snapshot);
    if (!annonce) return [];
    const brut = l.snapshot as Record<string, unknown>;
    const url = typeof brut.thumbnailUrl === 'string' ? brut.thumbnailUrl : annonce.mediaType === 'image' && typeof brut.mediaUrl === 'string' ? brut.mediaUrl : null;
    return [{ id: l.id, titre: annonce.advertiserName || 'Annonce sauvegardée', detail: annonce.body.slice(0, 280), apercu: url ? assetAiUrl(url, g.ctx.workspaceId) : null }];
  }) };
}

/** Relit l'objet choisi : aucune confiance dans les titres ou verdicts du client. */
export async function lireDepartAssistant(origine: OrigineDepartAssistant, id: unknown): Promise<{ ok: true; depart: DepartAssistant } | { ok: false; message: string }> {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { ok: false, message: 'Point de départ indisponible.' };
  const g = await gardeSources('studio.read');
  if (!g.ok) return { ok: false, message: g.message };
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return { ok: false, message: coupe.message };
  const marque = await getActiveBrand(g.ctx.workspaceId);
  if (!marque || !g.ctx.marques.includes(marque.id)) return { ok: false, message: 'Choisissez une marque accessible.' };
  if (origine === 'veille') {
    if (!g.veilleOuverte) return { ok: false, message: 'La Veille est indisponible.' };
    const sources = [{ type: 'sauvegarde' as const, id }];
    const r = await chargerSources({ ...g.ctx, marques: [marque.id] }, sources, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
    if (!r.ok) return { ok: false, message: r.message };
    const source = r.sources[0];
    if (!source) return { ok: false, message: 'Source indisponible.' };
    return { ok: true, depart: { origine, id, titre: `D’après ${source.annonceur || 'une annonce sauvegardée'}`, intention: '', sources, testId: null } };
  }
  if (origine !== 'iteration') return { ok: false, message: 'Point de départ inconnu.' };
  if (!(await adsDeLaMarque(g.ctx.workspaceId, marque.id, [id])).has(id)) return { ok: false, message: 'Test indisponible pour cette marque.' };
  const d = (await adDetailAction(id)).detail;
  if (!d) return { ok: false, message: 'Test indisponible pour cette marque.' };
  const brief = briefDepuisTest({ adId: d.id, variantCode: d.variantCode, concept: d.concept, angle: d.angle, persona: d.persona, personaId: d.personaId, verdictStatus: d.verdictStatus, validated: d.validated, comparable: d.comparable, testedVariable: d.testedVariable, variableValue: d.variableValue, metrics: { cpa: d.metrics.cpa, hookRate: d.metrics.hookRate, ctr: d.metrics.ctr }, learnings: d.learnings.map((l) => ({ statement: l.statement, confidence: l.confidence, scope: l.scope })) });
  if (!brief.eligible) return { ok: false, message: 'Ce test ne permet pas une reprise d’itération selon son verdict actuel.' };
  const contexte = objectifDepuisIteration(brief);
  return { ok: true, depart: { origine, id, titre: contexte.titre, intention: `Test source Adsmap : ${id}\n${contexte.objectif}`.slice(0, 2000), sources: [], testId: id } };
}
