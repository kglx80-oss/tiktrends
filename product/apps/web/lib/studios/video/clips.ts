import 'server-only';
import { and, eq } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import {
  parametresDeLaPrise, empreinteParametresClip, lireParametresClip, planDeClip, erreurStudio, modeleAnimationStudio, lignesAvecTarifClip, refusTarifClipChange,
  choixClipDuDevis, MESSAGE_DEVIS_AVANT_CATALOGUE,
  type ContenuVersion, type ErreurStudio, type LigneDevis, type ParametresClipSnapshot,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import type { ExecStudio } from '../execution/types';
import { mediasProduits } from './lecture';

/**
 * Studios · animation d'un plan · raccord des clips (`clip:<plan>`) aux
 * commandes L3, sur le modèle des images clés (`image/plans.ts`).
 *
 *  · au devis : un clip se devise SEUL ; son plan doit avoir une image clé
 *    PRODUITE et encore valide pour la version courante (média du projet,
 *    stocké) ; les paramètres sont construits par le serveur (modèle
 *    `FAL_VIDEO_MODEL_STUDIO`, durée permise, voix) et leur empreinte entre
 *    dans `inputHash` ; la ligne du clip est REPRISE au tarif catalogue du
 *    modèle (une unité par seconde, `lignesAvecTarifClip`) ;
 *  · à l'approbation : `snapshot.parametres` = `studio_clip/2`, reconstruit
 *    depuis la version DEVISÉE et les médias relus MAINTENANT · une image clé
 *    remplacée ou retirée entre-temps, ou un tarif qui ne vaut plus la ligne
 *    du devis ⇒ refus, rien débité.
 */

interface Portee { workspaceId: string; brandId: string; projectId: string }

/** Les clips d'un devis · `concerne` dès qu'une ligne est un clip ; `horsClip` = ce qui l'accompagne à tort. */
export function exigenceClipsDuDevis(lignes: ReadonlyArray<LigneDevis>): { concerne: boolean; plans: string[]; horsClip: string[] } {
  const plans: string[] = [];
  const horsClip: string[] = [];
  for (const l of lignes) {
    const sid = planDeClip(l.operation);
    if (sid) plans.push(sid);
    else if (l.profil !== 'calcul' && l.profil !== 'controle_visuel' && l.profil !== 'controle_parole') horsClip.push(l.operation);
  }
  return { concerne: plans.length > 0, plans, horsClip };
}

/** L'image clé valide d'un plan pour CETTE version · média du projet stocké et son empreinte, sinon `null`. */
export async function keyframeValideDuPlan(ex: ExecStudio, p: Portee, contenu: ContenuVersion, shotId: string): Promise<{ assetUuid: string; sha256: string } | null> {
  const { assets } = await mediasProduits(ex, p, contenu);
  const id = assets.get(`keyframe:${shotId}`);
  if (!id) return null;
  const S = schema.studioAssets;
  const [a] = await ex.select({ sha256: S.sha256, mime: S.mime, storageKey: S.storageKey }).from(S)
    .where(and(eq(S.id, id), eq(S.workspaceId, p.workspaceId), eq(S.brandId, p.brandId), eq(S.storageState, 'stored'))).limit(1);
  if (!a || !a.mime.startsWith('image/') || a.storageKey.startsWith('simule/')) return null;
  return { assetUuid: id, sha256: a.sha256 };
}

async function parametres(ex: ExecStudio, ctx: ContexteStudio, p: Portee, contenu: ContenuVersion, lignes: ReadonlyArray<LigneDevis>, suffixe: string, modele: string):
  Promise<{ ok: true; parametres: ParametresClipSnapshot | null } | ErreurStudio> {
  const x = exigenceClipsDuDevis(lignes);
  if (!x.concerne) return { ok: true, parametres: null };
  if (x.horsClip.length || x.plans.length !== 1) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'operations', raison: 'un clip se devise seul, un plan à la fois' }] });
  }
  const sid = x.plans[0]!;
  const keyframe = await keyframeValideDuPlan(ex, p, contenu, sid);
  // Les paramètres du catalogue (modèle figé, durée, voix native) avec la consigne de la PRISE · réplique validée
  // mot pour mot seulement si le plan parle ET que le modèle rend la voix, consigne de mouvement à l'identique sinon.
  const r = parametresDeLaPrise({ contenu, shotId: sid, keyframe, modele });
  if (!r.ok) return erreurStudio(r.code, { traceId: ctx.traceId, targetIds: [`clip:${sid}`], message: `${r.motif}${suffixe}` });
  return { ok: true, parametres: r.parametres };
}

/**
 * Au devis · paramètres du clip construits par le serveur ; leur empreinte
 * entre dans `inputHash`. `lignes` · les lignes du devis, celle du clip
 * reprise au tarif catalogue (inchangées hors clip).
 */
export async function raccordClipsDevis(
  ex: ExecStudio, ctx: ContexteStudio,
  e: { projet: { id: string; workspaceId: string; brandId: string }; contenu: ContenuVersion; lignes: ReadonlyArray<LigneDevis> },
): Promise<{ ok: true; empreinte: string | null; lignes: LigneDevis[]; parametres: ParametresClipSnapshot | null } | ErreurStudio> {
  // Au devis, le modèle des Studios en vigueur · il est ensuite FIGÉ dans la ligne du clip.
  const r = await parametres(ex, ctx, { workspaceId: e.projet.workspaceId, brandId: e.projet.brandId, projectId: e.projet.id }, e.contenu, e.lignes, '', modeleAnimationStudio(process.env));
  if (!r.ok) return r;
  if (!r.parametres) return { ok: true, empreinte: null, lignes: [...e.lignes], parametres: null };
  const t = lignesAvecTarifClip(e.lignes, r.parametres);
  if (!t.ok) return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, targetIds: [r.parametres.operation], message: `Clip sans tarif · ${t.motif}. Retire-le du devis.` });
  return { ok: true, empreinte: empreinteParametresClip(r.parametres), lignes: t.lignes, parametres: r.parametres };
}

/** À l'approbation · `studio_clip/2` relu des données SERVEUR de la version devisée, tarif revérifié · `null` hors clips. */
export async function parametresClipsApprobation(
  ex: ExecStudio, ctx: ContexteStudio,
  q: { workspaceId: string; brandId: string; projectId: string; projectVersionId: string; lines: unknown },
): Promise<{ ok: true; parametres: Record<string, unknown> | null } | ErreurStudio> {
  const lignes = Array.isArray(q.lines) ? (q.lines as LigneDevis[]) : [];
  if (!exigenceClipsDuDevis(lignes).concerne) return { ok: true, parametres: null };
  const V = schema.studioProjectVersions;
  const [v] = await ex.select({ content: V.content }).from(V)
    .where(and(eq(V.id, q.projectVersionId), eq(V.projectId, q.projectId), eq(V.workspaceId, q.workspaceId), eq(V.brandId, q.brandId))).limit(1);
  if (!v) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  // À l'approbation, le modèle FIGÉ au devis · jamais celui de l'environnement du moment.
  const sid = exigenceClipsDuDevis(lignes).plans[0] ?? '';
  const fige = choixClipDuDevis(lignes, `clip:${sid}`);
  if (!fige) return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [`clip:${sid}`], message: MESSAGE_DEVIS_AVANT_CATALOGUE });
  const r = await parametres(ex, ctx, { workspaceId: q.workspaceId, brandId: q.brandId, projectId: q.projectId }, v.content as ContenuVersion, lignes, ' Rien n’a été débité.', fige.modele);
  if (!r.ok) return r;
  const lu = lireParametresClip(r.parametres);
  if (!lu.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: lu.violations.map((raison) => ({ chemin: 'parametres', raison })) });
  // Ce qui partira (modèle, durée, voix, format) doit être ce que le devis a figé, et son tarif celui annoncé · même à tarif égal.
  const change = refusTarifClipChange(q.lines, lu.parametres);
  if (change) return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [lu.parametres.operation], message: change });
  return { ok: true, parametres: r.parametres as unknown as Record<string, unknown> };
}
