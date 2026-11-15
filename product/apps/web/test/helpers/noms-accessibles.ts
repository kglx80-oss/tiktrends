import { controlesEnDouble, nomsSansLibelleVisible, SEPARATEUR_NOM_LIGNE, type ControleNomme } from '@tiktrends/core';

/**
 * La garde des noms accessibles, côté DOM (suite de #1089) · on lit chaque
 * contrôle RENDU (`a[href]`, `button`) comme le ferait un lecteur d'écran ·
 * `aria-labelledby`, sinon `aria-label`, sinon le texte (sans ce qui est caché
 * aux lecteurs d'écran) · et la règle pure du noyau (`controlesEnDouble`,
 * `nomsSansLibelleVisible`) dit ce qui ne va pas. Aucune exception.
 * À lancer dans un test `// @vitest-environment jsdom`.
 */

const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Le nom accessible · `aria-labelledby` (les textes cités, dans l'ordre), sinon `aria-label`, sinon le texte sans `[aria-hidden="true"]`. */
export function nomAccessible(el: Element, racine: ParentNode = el.ownerDocument ?? document): string {
  const lb = el.getAttribute('aria-labelledby');
  if (lb) {
    const cites = lb.split(/\s+/).filter(Boolean).map((i) => (racine as ParentNode).querySelector(`#${CSS.escape(i)}`)?.textContent ?? '');
    if (cites.some((c) => net(c))) return net(cites.join(' '));
  }
  const l = el.getAttribute('aria-label');
  if (l && net(l)) return net(l);
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll('[aria-hidden="true"]').forEach((k) => k.remove());
  return net(c.textContent);
}

/** Le libellé VISIBLE d'un contrôle · son texte, sans la touche dessinée (`kbd`). */
export function libelleVisible(el: Element): string {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll('kbd').forEach((k) => k.remove());
  return net(c.textContent);
}

/** Où mène un contrôle · un lien, son adresse · un bouton fermé, rien · un bouton actif, lui-même (deux boutons actifs du même nom agissent sur deux lignes). */
export function cibleDe(el: Element, i: number): string {
  if (el.tagName === 'A') return `lien ${el.getAttribute('href')}`;
  return el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled ? 'fermé' : `bouton #${i}`;
}

export function lireControles(racine: ParentNode): Array<ControleNomme & { el: Element }> {
  return [...racine.querySelectorAll('a[href], button')].map((el, i) => ({ el, nom: nomAccessible(el, racine), visible: libelleVisible(el), cible: cibleDe(el, i) }));
}

/**
 * Un contrôle dont le texte EST un libellé (un mot, une phrase, une icône) ·
 * pas une carte entière (titre, résumé, vignette · son nom en dit le titre, pas
 * tout le contenu). C'est à lui que 2.5.3 s'applique ici.
 */
const CARTE = 'div, p, strong, small, h1, h2, h3, h4, h5, h6, img, ul, ol, li, section, article, figure, br';
export const estUnLibelle = (el: Element) => !el.querySelector(CARTE);
/**
 * L'en-tête COMMUN de la coquille (`header.top` · recherche, profil) n'est pas
 * une ligne · son bouton profil (« KG », nommé « Kevin Guilbaux, profil ») est
 * recensé hors de ce lot (`docs/ux-v5/MATRICE.md`) · il reste compté dans les
 * doublons.
 */
const EN_TETE = 'header.top';

/** Ce qui ne va pas dans un rendu · deux contrôles de même nom vers deux cibles · un nom qui ne contient pas le libellé visible. */
export function ecartsDeNoms(racine: ParentNode): { doublons: string[]; sansLibelle: string[] } {
  const c = lireControles(racine);
  return { doublons: controlesEnDouble(c), sansLibelle: nomsSansLibelleVisible(c.filter((x) => estUnLibelle(x.el) && !x.el.closest(EN_TETE))) };
}

/**
 * Le HTML d'APRÈS ramené à celui d'AVANT, hors des attributs AJOUTÉS · un
 * `aria-label` d'après qui commence par « libellé visible · » et dont la
 * valeur n'existe nulle part avant est retiré · rien d'autre ne bouge (un
 * autre attribut, un texte, un nom qui ne suit pas la règle, un nom qui en
 * REMPLACE un autre restent, et la comparaison tombe). Rend aussi le nombre
 * d'attributs retirés (une garde vérifie qu'il y en a).
 */
export function sansNomsAjoutes(apres: string, avant: string): { html: string; avant: string; retires: number } {
  const a = document.createElement('template'); a.innerHTML = apres;
  const b = document.createElement('template'); b.innerHTML = avant;
  let retires = 0;
  const deja = new Set([...b.content.querySelectorAll('[aria-label]')].map((x) => x.getAttribute('aria-label')));
  for (const x of a.content.querySelectorAll('a[aria-label], button[aria-label]')) {
    const l = x.getAttribute('aria-label')!;
    const v = libelleVisible(x);
    if (v && !deja.has(l) && net(l).startsWith(`${v}${SEPARATEUR_NOM_LIGNE}`)) { x.removeAttribute('aria-label'); retires += 1; }
  }
  // Les deux côtés passent par le même sérialiseur (le DOM) · `<br/>` et `<br>` sont le même balisage.
  return { html: a.innerHTML, avant: b.innerHTML, retires };
}
