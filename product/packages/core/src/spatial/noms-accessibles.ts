/**
 * Les noms accessibles des contrôles DE LIGNE (WCAG 2.4.4 · 2.4.9 · 2.5.3).
 *
 * Un même bouton répété sur chaque ligne d'une liste (« Fiche », « Montrer
 * sur le canvas », « Valider le verdict »…) se lit « Fiche, Fiche, Fiche »
 * dans la liste des liens d'un lecteur d'écran · on ne sait pas laquelle ouvre
 * quoi. La règle · le nom accessible COMMENCE par le libellé visible (2.5.3,
 * la commande vocale « clique sur Fiche » marche toujours), puis nomme
 * l'élément de la ligne · « Fiche · V3 · Crème ». Le texte visible ne change
 * pas · seul `aria-label` est posé.
 *
 * Deux lignes qui portent le MÊME élément (deux lots au même titre) gardent
 * des noms distincts · la deuxième occurrence est numérotée (« n° 2 »), dans
 * l'ordre de la liste. Pur · ni base, ni réseau, ni DOM.
 */

/** Le séparateur maison entre le libellé visible et l'élément de la ligne (jamais un tiret cadratin). */
export const SEPARATEUR_NOM_LIGNE = ' · ';

const net = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Le nom d'UN contrôle de ligne · « libellé · élément » · sans élément, le libellé seul. */
export function nomDeLigne(libelle: string, element: string | null | undefined): string {
  const l = net(libelle);
  const e = net(element ?? '');
  return e ? `${l}${SEPARATEUR_NOM_LIGNE}${e}` : l;
}

/**
 * Les noms d'une liste entière · un par ligne, dans l'ordre · un élément
 * répété reçoit « n° k » à partir de sa deuxième occurrence (la première garde
 * le nom simple · ajouter une ligne ne renomme pas les précédentes).
 */
export function nomsDeLignes(libelle: string, elements: ReadonlyArray<string | null | undefined>): string[] {
  return nomsDeControles(elements.map((e) => [libelle, e] as const));
}

/** Comme `nomsDeLignes`, quand le libellé visible change d'une ligne à l'autre (« Voir », « Conclure »…) · `[libellé, élément]` par ligne. */
export function nomsDeControles(lignes: ReadonlyArray<readonly [string, string | null | undefined]>): string[] {
  const vus = new Map<string, number>();
  return lignes.map(([libelle, e]) => {
    const base = nomDeLigne(libelle, e);
    const k = (vus.get(base) ?? 0) + 1;
    vus.set(base, k);
    return k === 1 ? base : `${base}${SEPARATEUR_NOM_LIGNE}n° ${k}`;
  });
}

/** Un élément de ligne court · coupé au mot près à `max` caractères (« … »), pour un nom qui reste écoutable. */
export function elementCourt(texte: string, max = 60): string {
  const t = net(texte);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/* ─────────────────────────── la garde, pure ─────────────────────────── */

/** Un contrôle tel qu'un rendu le montre · son nom accessible, son libellé VISIBLE, où il mène. */
export interface ControleNomme {
  nom: string;
  visible: string;
  /** « lien /x » · « fermé » (aucune cible) · « bouton #i » (un bouton actif agit sur sa ligne). */
  cible: string;
}

const pli = (s: string) => net(s).toLocaleLowerCase('fr');

/** Deux contrôles de même nom accessible qui mènent à deux cibles · « nom → cible | cible ». */
export function controlesEnDouble(c: readonly ControleNomme[]): string[] {
  const par = new Map<string, Set<string>>();
  for (const x of c) par.set(net(x.nom), (par.get(net(x.nom)) ?? new Set()).add(x.cible));
  return [...par.entries()].filter(([, s]) => s.size > 1).map(([n, s]) => `${n} → ${[...s].join(' | ')}`);
}

/**
 * Les noms qui ne contiennent pas le libellé visible (2.5.3) · « nom ⇐ visible ».
 * Un libellé visible sans lettre ni chiffre (« ← », « × ») n'est pas un mot à
 * dire · ignoré.
 */
export function nomsSansLibelleVisible(c: readonly ControleNomme[]): string[] {
  return c
    .filter((x) => /[\p{L}\p{N}]/u.test(x.visible) && !pli(x.nom).includes(pli(x.visible)))
    .map((x) => `${net(x.nom)} ⇐ ${net(x.visible)}`);
}
