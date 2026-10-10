import { performance } from 'node:perf_hooks';
import { contenuEchelle, idMediaSynthetique, dimensionsMediaSynthetique, MEDIAS_SYNTHETIQUES, type EchelleSynthetique } from '../src/studios/perf/synthetique';
import { resumerTirages, type ResumeTirages } from '../src/studios/perf/statistiques';
import { CLES_CONTENU, validerContenuVersion, type ContenuVersion, type CalqueTexte } from '../src/studios/document';
import { appliquerPatch, type ChangementPatch } from '../src/studios/patch';
import { calculerPlanImpact } from '../src/studios/impact';
import { empreinteContenu } from '../src/studios/version';
import { impactVideo } from '../src/studios/video/impact-video';
import { timelineDesPlans } from '../src/studios/video/timeline';
import { appliquerOperationVideo } from '../src/studios/video/operations';
import { ajouterTexte, transformerCalque, impactEdition } from '../src/studios/calques/operations';
import { statutEnregistrement } from '../src/studios/calques/conflit';
import { preflightVersion } from '../src/studios/export/preflight';
import { preflightExportVideo } from '../src/studios/video/export-video';
import { planRendu } from '../src/studios/rendu/plan';
import { CALQUES_MAX } from '../src/studios/perf/limites';

/**
 * L8-C · les chemins CHAUDS du noyau, définis une fois : la mesure
 * (`l8c-mesure.test.ts`, sur demande) et les gardes de budget
 * (`l8c-budgets.test.ts`) exécutent EXACTEMENT les mêmes fonctions sur les
 * mêmes contenus synthétiques. Chaque préparation est hors chronomètre ;
 * seul l'appel rendu est chronométré.
 */

export const CHEMINS_EDITEUR = CLES_CONTENU.map((k) => `/${k}`);

export interface CheminChaud { id: string; libelle: string; preparer: (c: ContenuVersion) => () => unknown }

const premierTexte = (c: ContenuVersion): CalqueTexte => Object.values(c.document!.layers).find((l): l is CalqueTexte => l.kind === 'text' && !l.locked)!;
const premierLibre = (c: ContenuVersion) => Object.values(c.document!.layers).find((l) => !l.locked)!;

/** Le geste d'édition le plus courant · un texte corrigé (le CTA). */
export function patchTexte(c: ContenuVersion): ChangementPatch[] {
  const t = premierTexte(c);
  return [{ op: 'replace', path: `/document/layers/${t.id}/text`, newValue: 'Je le teste', reason: 'CTA' }];
}

/** Le patch le plus LOURD accepté · 100 changements (borne `MAX_CHANGEMENTS_PATCH`), 100 calques déplacés. */
export function patchLourd(c: ContenuVersion): ChangementPatch[] {
  return Object.values(c.document!.layers).slice(0, 100).map((l) => ({ op: 'replace' as const, path: `/document/layers/${l.id}/x`, newValue: l.x === 0 ? 1 : l.x - 1, reason: 'déplacement' }));
}

export function disponiblesExport() {
  const medias: Record<string, { etat: 'ok'; largeur: number; hauteur: number }> = {};
  for (let i = 0; i < MEDIAS_SYNTHETIQUES; i++) {
    const d = dimensionsMediaSynthetique(i);
    medias[idMediaSynthetique(i)] = { etat: 'ok', largeur: d.largeur, hauteur: d.hauteur };
  }
  return { polices: ['Sans', 'Sans Bold'], medias };
}

const CAPACITE = { decodage: true, encodeurs: { libx264: true, aac: true }, raison: '', sondeLe: '2026-10-09T00:00:00Z' };

export const CHEMINS_CHAUDS: readonly CheminChaud[] = [
  { id: 'valider_contenu', libelle: 'Validation du contenu (validerContenuVersion)', preparer: (c) => () => validerContenuVersion(c) },
  { id: 'empreinte_contenu', libelle: 'Empreinte SHA-256 canonique (empreinteContenu)', preparer: (c) => () => empreinteContenu(c) },
  { id: 'patch_texte', libelle: 'Patch · un texte (appliquerPatch)', preparer: (c) => { const ch = patchTexte(c); return () => appliquerPatch(c, ch, CHEMINS_EDITEUR); } },
  { id: 'patch_lourd', libelle: 'Patch · 100 changements (appliquerPatch)', preparer: (c) => { const ch = patchLourd(c); return () => appliquerPatch(c, ch, CHEMINS_EDITEUR); } },
  {
    id: 'enregistrement_noyau', libelle: 'Enregistrement · patch + validation + empreinte (part pure de enregistrerVersion)',
    preparer: (c) => { const ch = patchTexte(c); return () => { const r = appliquerPatch(c, ch, CHEMINS_EDITEUR); if (!r.ok) throw new Error('patch refusé'); validerContenuVersion(r.resultat); return empreinteContenu(r.resultat); }; },
  },
  {
    id: 'impact_texte', libelle: 'Impact d’un texte corrigé (calculerPlanImpact)',
    preparer: (c) => { const r = appliquerPatch(c, patchTexte(c), CHEMINS_EDITEUR); if (!r.ok) throw new Error('patch'); return () => calculerPlanImpact(c, r.resultat); },
  },
  {
    id: 'impact_video_ordre', libelle: 'Impact vidéo d’un ordre inversé (impactVideo)',
    preparer: (c) => { const r = appliquerOperationVideo(c, { type: 'ordre', ordre: [...c.shots.order].reverse() }); if (!r.ok) throw new Error(r.message); return () => impactVideo(c, r.contenu); },
  },
  { id: 'timeline', libelle: 'Timeline recalée (timelineDesPlans)', preparer: (c) => () => timelineDesPlans(c, c.timeline) },
  { id: 'operation_ordre', libelle: 'Geste de montage · ordre (appliquerOperationVideo)', preparer: (c) => { const o = [...c.shots.order].reverse(); return () => appliquerOperationVideo(c, { type: 'ordre', ordre: o }); } },
  { id: 'operation_narration', libelle: 'Geste de montage · narration (appliquerOperationVideo)', preparer: (c) => { const sid = c.shots.order.find((s) => c.shots.byId[s]!.speechMode !== 'none')!; return () => appliquerOperationVideo(c, { type: 'narration', shotId: sid, narration: 'Voici le sérum qui change tout.' }); } },
  {
    // À l'échelle de stress, le document est plein (1000 calques) : on retire le dernier pour mesurer un AJOUT accepté, pas un refus.
    id: 'calque_ajout', libelle: 'Geste calque · ajouter un texte (ajouterTexte)',
    preparer: (c) => {
      const d = c.document!;
      const ids = Object.keys(d.layers);
      const doc = ids.length === CALQUES_MAX ? { ...d, layers: Object.fromEntries(ids.slice(0, CALQUES_MAX - 1).map((id) => [id, d.layers[id]!])) } : d;
      return () => { const r = ajouterTexte(doc); if (!r.ok) throw new Error(r.message); return r; };
    },
  },
  { id: 'calque_deplacement', libelle: 'Geste calque · déplacer (transformerCalque)', preparer: (c) => { const l = premierLibre(c); return () => transformerCalque(c.document!, l.id, { x: l.x + 1 }); } },
  {
    // Ce que l'éditeur refait à CHAQUE rendu d'un geste (`EditeurCalques.tsx`) : l'opération, le statut, l'impact.
    id: 'geste_editeur', libelle: 'Réaction de l’éditeur à un déplacement (transformerCalque + statutEnregistrement + impactEdition)',
    preparer: (c) => { const l = premierLibre(c); return () => { const r = transformerCalque(c.document!, l.id, { x: l.x + 1 }); if (!r.ok) throw new Error(r.message); statutEnregistrement({ base: c.document, present: r.document, enCours: false, conflit: false, erreur: false }); return impactEdition(c, r.document); }; },
  },
  {
    // L'aperçu d'un geste de montage (`apercuDuGeste`, `EcranVideo.tsx`) : l'opération puis son impact.
    id: 'geste_video', libelle: 'Aperçu d’un geste de montage (appliquerOperationVideo + impactVideo)',
    preparer: (c) => { const o = [...c.shots.order].reverse(); return () => { const r = appliquerOperationVideo(c, { type: 'ordre', ordre: o }); if (!r.ok) throw new Error(r.message); return impactVideo(c, r.contenu); }; },
  },
  { id: 'preflight_image', libelle: 'Préflight d’export image (preflightVersion)', preparer: (c) => { const v = { content: c, contentHash: empreinteContenu(c) }; const d = disponiblesExport(); return () => preflightVersion(v, d); } },
  { id: 'preflight_video', libelle: 'Préflight d’export vidéo (preflightExportVideo)', preparer: (c) => () => preflightExportVideo({ contenu: c, medias: {}, capacite: CAPACITE, fournisseurs: { animation: true, voix: true, lipsync: true } }) },
  { id: 'plan_rendu', libelle: 'Plan de rendu du document (planRendu)', preparer: (c) => () => planRendu(c.document!) },
];

/**
 * `n` tirages chronométrés après `chauffe` tirages à blanc · temps MUR et
 * temps CPU du processus (`process.cpuUsage`). La machine de mesure est
 * partagée (charge notée) : le temps CPU est l'estimation du temps mur sur
 * une machine non chargée (code synchrone, un fil), c'est lui que lisent le
 * tableau et les gardes ; le temps mur est gardé pour l'honnêteté du relevé.
 */
export interface Chrono { mur: ResumeTirages; cpu: ResumeTirages }
export function chronometrer(f: () => unknown, n: number, chauffe = 3): Chrono {
  for (let i = 0; i < chauffe; i++) f();
  const mur: number[] = [];
  const cpu: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = process.cpuUsage();
    const d = performance.now();
    f();
    mur.push(performance.now() - d);
    const u = process.cpuUsage(c);
    cpu.push((u.user + u.system) / 1000);
  }
  return { mur: resumerTirages(mur), cpu: resumerTirages(cpu) };
}

export function mesurerEchelle(e: EchelleSynthetique, n: number, ids?: readonly string[]): Record<string, Chrono> {
  const c = contenuEchelle(e);
  const out: Record<string, Chrono> = {};
  for (const ch of CHEMINS_CHAUDS) {
    if (ids && !ids.includes(ch.id)) continue;
    out[ch.id] = chronometrer(ch.preparer(c), n);
  }
  return out;
}
