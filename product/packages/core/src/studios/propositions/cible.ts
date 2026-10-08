/**
 * Studios · L4 · cible d'une proposition et chemins qu'elle peut toucher.
 *
 * Pur. Une proposition vise UNE cible du contenu de version (un plan, un
 * calque, une identité, le brief…) sur UNE version de base. La cible fixe la
 * RACINE des chemins permis : une proposition sur le plan 2 ne peut toucher que
 * `/shots/byId/<id du plan 2>/…`, et la tâche peut encore resserrer (« corrige
 * seulement le CTA » ⇒ `/document/layers/l_cta/text`). Rien n'élargit jamais
 * au-delà de la racine : un chemin demandé hors racine est REFUSÉ, pas ignoré.
 *
 * La cible s'écrit en texte stable dans `studio_proposals.target`
 * (`shot:s_produit`, `layer:l_titre`, `brief`…) et se lit pour l'écran
 * (« Plan 2 · version 7 »). L'identifiant reste l'identité ; la position dans
 * l'ordre n'est qu'un libellé.
 */

import { estIdStable, type ContenuVersion, type ViolationStudio } from '../document';
import { cheminCouvertPar, lirePointeur } from '../patch';

export type TypeCible = 'shot' | 'layer' | 'character' | 'brief' | 'style' | 'product' | 'document' | 'timeline';

export type CibleProposition =
  | { type: 'shot' | 'layer' | 'character'; id: string }
  | { type: 'brief' | 'style' | 'product' | 'document' | 'timeline' };

const AVEC_ID = new Set<TypeCible>(['shot', 'layer', 'character']);
const SANS_ID = new Set<TypeCible>(['brief', 'style', 'product', 'document', 'timeline']);

/** `shot:s_produit` → `{ type: 'shot', id: 's_produit' }` · `null` si illisible. */
export function lireCible(x: unknown): CibleProposition | null {
  if (typeof x !== 'string' || x.length === 0 || x.length > 200) return null;
  const i = x.indexOf(':');
  if (i < 0) return SANS_ID.has(x as TypeCible) ? { type: x as 'brief' } : null;
  const type = x.slice(0, i) as TypeCible;
  const id = x.slice(i + 1);
  if (!AVEC_ID.has(type) || !estIdStable(id)) return null;
  return { type: type as 'shot', id };
}

export function ecrireCible(c: CibleProposition): string {
  return 'id' in c ? `${c.type}:${c.id}` : c.type;
}

const echapper = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

/** La racine des chemins permis par la cible (JSON Pointer concret, sans joker). */
export function racineCible(c: CibleProposition): string {
  switch (c.type) {
    case 'shot': return `/shots/byId/${echapper(c.id)}`;
    case 'layer': return `/document/layers/${echapper(c.id)}`;
    case 'character': return `/characterRefs/${echapper(c.id)}`;
    case 'brief': return '/brief';
    case 'style': return '/styleRef';
    case 'product': return '/productRef';
    case 'document': return '/document';
    case 'timeline': return '/timeline';
  }
}

/** La cible existe-t-elle dans le contenu de base ? Une clé racine existe toujours (éventuellement `null`). */
export function cibleExiste(c: CibleProposition, contenu: ContenuVersion): boolean {
  const possede = (o: unknown, k: string) => typeof o === 'object' && o !== null && Object.prototype.hasOwnProperty.call(o, k);
  switch (c.type) {
    case 'shot': return possede(contenu.shots.byId, c.id);
    case 'layer': return contenu.document !== null && possede(contenu.document.layers, c.id);
    case 'character': return possede(contenu.characterRefs, c.id);
    default: return true;
  }
}

export type ResultatChemins = { ok: true; allowedPaths: string[] } | { ok: false; violations: ViolationStudio[] };

/**
 * Chemins permis pour cette proposition : la racine de la cible, ou les chemins
 * demandés par la tâche s'ils sont tous SOUS la racine. Concrets (ni joker, ni
 * indice positionnel, ni segment de prototype), uniques, 1 à 100.
 */
export function borneCheminsACible(c: CibleProposition, demandes?: readonly unknown[] | null): ResultatChemins {
  const racine = racineCible(c);
  const r = lirePointeur(racine);
  if (!r.ok) return { ok: false, violations: [{ chemin: 'target', raison: r.raison }] };
  if (!demandes || demandes.length === 0) return { ok: true, allowedPaths: [racine] };
  if (demandes.length > 100) return { ok: false, violations: [{ chemin: 'allowedPaths', raison: '100 chemins au plus' }] };
  const violations: ViolationStudio[] = [];
  const vus = new Set<string>();
  demandes.forEach((p, i) => {
    const s = lirePointeur(p);
    if (!s.ok) { violations.push({ chemin: `allowedPaths/${i}`, raison: s.raison }); return; }
    if (!cheminCouvertPar(s.segments, r.segments)) { violations.push({ chemin: `allowedPaths/${i}`, raison: `chemin hors de la cible (${racine})` }); return; }
    vus.add(p as string);
  });
  if (violations.length) return { ok: false, violations };
  return { ok: true, allowedPaths: [...vus] };
}

/**
 * Les chemins stockés sont-ils toujours bornés à la cible stockée ? Contrôle
 * repris À L'APPLICATION : une ligne écrite par une version antérieure du code,
 * ou modifiée hors application, ne s'applique pas si elle sort de sa cible.
 */
export function cheminsDansCible(c: CibleProposition, allowedPaths: unknown): ViolationStudio[] {
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) return [{ chemin: 'allowedPaths', raison: 'liste de chemins attendue' }];
  const b = borneCheminsACible(c, allowedPaths);
  return b.ok ? [] : b.violations;
}

/** Libellé lisible de la cible dans le contenu donné (« Plan 2 », « Calque · Titre »…). */
export function libelleCible(c: CibleProposition, contenu: ContenuVersion | null): string {
  switch (c.type) {
    case 'shot': {
      const i = contenu ? contenu.shots.order.indexOf(c.id) : -1;
      return i >= 0 ? `Plan ${i + 1}` : `Plan ${c.id}`;
    }
    case 'layer': {
      const l = contenu?.document?.layers[c.id];
      return l && typeof l.name === 'string' && l.name.trim() ? `Calque · ${l.name.trim()}` : `Calque ${c.id}`;
    }
    case 'character': return `Identité ${c.id}`;
    case 'brief': return 'Brief';
    case 'style': return 'Style';
    case 'product': return 'Produit';
    case 'document': return 'Mise en page';
    case 'timeline': return 'Montage';
  }
}

/** « Plan 2 · version 7 » · la cible ET la version de base, toujours ensemble. */
export function libelleCibleEtVersion(c: CibleProposition, contenu: ContenuVersion | null, n: number): string {
  return `${libelleCible(c, contenu)} · version ${n}`;
}

/**
 * Cibles proposables dans une version · plans dans l'ordre, calques par z,
 * identités, puis le brief. Sert le sélecteur de l'écran ; l'identité est le
 * texte de la cible, jamais la position.
 */
export function ciblesDisponibles(contenu: ContenuVersion): Array<{ cible: string; libelle: string }> {
  const out: Array<{ cible: string; libelle: string }> = [];
  for (const id of contenu.shots.order) if (estIdStable(id)) out.push({ cible: `shot:${id}`, libelle: libelleCible({ type: 'shot', id }, contenu) });
  if (contenu.document) {
    const calques = Object.values(contenu.document.layers).filter((l) => estIdStable(l.id)).sort((a, b) => a.z - b.z);
    for (const l of calques) out.push({ cible: `layer:${l.id}`, libelle: libelleCible({ type: 'layer', id: l.id }, contenu) });
  }
  for (const id of Object.keys(contenu.characterRefs).sort()) if (estIdStable(id)) out.push({ cible: `character:${id}`, libelle: libelleCible({ type: 'character', id }, contenu) });
  out.push({ cible: 'brief', libelle: 'Brief' });
  return out;
}

/** Libellé lisible d'un chemin de changement, relatif à la cible (« Texte à l'écran »). */
const CHAMPS: Readonly<Record<string, string>> = {
  purpose: 'Rôle du plan', subject: 'Sujet', action: 'Action', framing: 'Cadrage', camera: 'Caméra', lighting: 'Lumière',
  environment: 'Décor', referenceIds: 'Références', narration: 'Narration', onScreenText: 'Texte à l’écran', speechMode: 'Mode de parole',
  estimatedDurationMs: 'Durée estimée', text: 'Texte', color: 'Couleur', fontSizePx: 'Taille du texte', visible: 'Visibilité',
  objective: 'Objectif', audience: 'Audience', testedVariable: 'Variable testée', composition: 'Composition', styleIntent: 'Intention de style',
  texts: 'Textes', formats: 'Formats', exclusions: 'Exclusions', invariants: 'Invariants', variables: 'Variables', facts: 'Faits',
  references: 'Références', hypothesisId: 'Hypothèse', tenue: 'Tenue',
};

export function libelleChemin(c: CibleProposition, chemin: string): string {
  const racine = racineCible(c);
  const reste = chemin === racine ? '' : chemin.startsWith(`${racine}/`) ? chemin.slice(racine.length + 1) : chemin;
  if (reste === '') return 'Ensemble de la cible';
  const segs = reste.split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  return segs.map((s) => CHAMPS[s] ?? s).join(' · ');
}
