/**
 * Studios · L6-A · l'impact d'un geste de montage, dit AVANT tout devis.
 *
 * Pur. Aucune comparaison de champs à la main : le graphe L1 (`impact.ts`)
 * hache ce que chaque sortie LIT, et l'impact d'un geste est la différence
 * d'empreintes entre la version de départ et le contenu obtenu. Ce module
 * met ce plan en mots pour l'écran : ce qui sera refait (payant ou non), ce
 * qui est conservé, et les médias déjà produits qui deviennent obsolètes.
 */

import type { ContenuVersion } from '../document';
import { calculerPlanImpact, grapheImpact, type NatureNoeud, type PlanImpact } from '../impact';
import { profilDuNoeud } from '../execution/tarifs';

export interface LigneImpactVideo { id: string; libelle: string; nature: NatureNoeud; payant: boolean }

export interface ImpactVideo {
  plan: PlanImpact;
  aRefaire: LigneImpactVideo[];
  conservees: LigneImpactVideo[];
  /** Médias RÉELLEMENT produits que le geste rend obsolètes (ils restent consultables). */
  mediasObsoletes: LigneImpactVideo[];
  /** Générations payantes que le geste exigerait (images, animations, voix, fiches). */
  generations: string[];
  aucuneGeneration: boolean;
  resume: string;
}

const LIBELLES_CALCUL: Readonly<Record<string, string>> = {
  montage: 'Montage', mix: 'Mix audio', sous_titres: 'Sous-titres', export: 'Export', composition: 'Composition',
};

/** « Image clé · plan 2 » · le rang suit l'ordre du montage (après le geste, sinon avant). */
export function libelleSortie(id: string, ordres: ReadonlyArray<readonly string[]>): string {
  if (LIBELLES_CALCUL[id]) return LIBELLES_CALCUL[id]!;
  const [prefixe, cible = ''] = id.split(/:(.*)/s);
  const rang = (() => { for (const o of ordres) { const i = o.indexOf(cible); if (i >= 0) return i + 1; } return null; })();
  const plan = rang ? `plan ${rang}` : `plan ${cible}`;
  if (prefixe === 'keyframe') return `Image clé · ${plan}`;
  if (prefixe === 'clip') return `Animation · ${plan}`;
  if (prefixe === 'voix') return `Voix · ${plan}`;
  if (prefixe === 'identite') return `Fiche identité · ${cible}`;
  return id;
}

const tri = (a: LigneImpactVideo, b: LigneImpactVideo) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * L'impact de `avant` → `apres` · par défaut chaque sortie de `avant` est
 * supposée exister : on mesure ce que le GESTE invalide, pas ce qui n'a jamais
 * été produit. `mediasExistants` (sorties réellement livrées et valides)
 * nomme les médias rendus obsolètes.
 */
export function impactVideo(avant: ContenuVersion, apres: ContenuVersion, o: { mediasExistants?: Iterable<string> } = {}): ImpactVideo {
  const plan = calculerPlanImpact(avant, apres);
  const ordres = [apres.shots.order, avant.shots.order];
  const ligne = (id: string, nature: NatureNoeud): LigneImpactVideo => ({ id, libelle: libelleSortie(id, ordres), nature, payant: nature === 'generation' && profilDuNoeud(id, nature) !== 'calcul' });
  const ga = grapheImpact(avant);
  const aRefaire = plan.aRefaire.map((n) => ligne(n.id, n.nature));
  const conservees = plan.reutilisees.map((id) => ligne(id, ga.get(id)!.nature)).sort(tri);
  const existants = new Set(o.mediasExistants ?? []);
  const mediasObsoletes = plan.obsoletes.filter((id) => existants.has(id)).map((id) => ligne(id, ga.get(id)!.nature));
  const generations = aRefaire.filter((l) => l.payant).map((l) => l.id);
  const calculs = aRefaire.filter((l) => !l.payant).map((l) => l.libelle.toLowerCase());
  const resume = generations.length === 0
    ? (calculs.length ? `Aucune image, animation ni voix à refaire · seuls ${calculs.join(', ')} sont recalculés, sans fournisseur payant.` : 'Rien à refaire.')
    : `À refaire : ${aRefaire.filter((l) => l.payant).map((l) => l.libelle).join(', ')}. Conservé : ${conservees.filter((l) => l.payant).length} sortie${conservees.filter((l) => l.payant).length > 1 ? 's' : ''} payante${conservees.filter((l) => l.payant).length > 1 ? 's' : ''}.`;
  return { plan, aRefaire, conservees, mediasObsoletes, generations, aucuneGeneration: generations.length === 0, resume };
}

/** Empreinte de chaque image clé d'un contenu · « identiques par empreinte » se vérifie là. */
export function empreintesKeyframes(c: ContenuVersion): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, n] of grapheImpact(c)) if (id.startsWith('keyframe:')) out[id] = n.empreinte;
  return out;
}

/**
 * Les sorties PRODUITES qui valent encore pour `courante` · une sortie livrée
 * pour une version passée reste valable si son nœud a la même empreinte dans
 * la version courante (le graphe le dit, pas une comparaison de champs).
 */
export function sortiesValides(courante: ContenuVersion, produites: ReadonlyArray<{ operation: string; source: ContenuVersion }>): Set<string> {
  const gc = grapheImpact(courante);
  const cache = new Map<ContenuVersion, ReturnType<typeof grapheImpact>>();
  const out = new Set<string>();
  for (const p of produites) {
    let g = cache.get(p.source);
    if (!g) { g = grapheImpact(p.source); cache.set(p.source, g); }
    const a = g.get(p.operation);
    const b = gc.get(p.operation);
    if (a && b && a.empreinte === b.empreinte) out.add(p.operation);
  }
  return out;
}
