import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parité de structure Spatial · le rendu React d'un écran doit reproduire le
 * SQUELETTE du fragment de la maquette (`docs/spatial/reference/<route>.html`).
 * Même CSS (repris tel quel) + même squelette ⇒ mêmes pixels.
 *
 * Le squelette garde ce qui décide de la mise en page : balise, classes,
 * PROPRIÉTÉS de style en ligne (pas leurs valeurs, souvent issues des données),
 * icône du sprite appelée. Il ignore les textes et les autres attributs · nos
 * données sont réelles, celles de la maquette sont fictives.
 *
 * Deux équivalences, et seulement deux :
 *  · `a.btn` ⇔ `button.btn` · la maquette simule une action par un bouton là où
 *    l'outil ouvre un vrai lien (ou l'inverse) ; les classes `.btn` le stylent
 *    à l'identique ;
 *  · `ignorer` · des sélecteurs dont on retire les DESCENDANTS des deux côtés
 *    (ex. le logo de marque · SVG fictif dans la maquette, image réelle ici).
 *
 * À lancer dans un test `// @vitest-environment jsdom`.
 */

// test/spatial → apps/web → product → racine du dépôt.
const RACINE = join(__dirname, '..', '..', '..', '..', '..', 'docs', 'spatial', 'reference');

export function fragmentReference(route: string): string {
  return readFileSync(join(RACINE, `${route}.html`), 'utf8').replace(/^<!--[^]*?-->\s*/, '');
}

function element(html: string, selecteur?: string): Element {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const racine = selecteur ? t.content.querySelector(selecteur) : t.content.firstElementChild;
  if (!racine) throw new Error(`parité · aucun élément ${selecteur ?? '(racine)'} dans le HTML fourni`);
  return racine;
}

function signature(e: Element): string {
  let tag = e.tagName.toLowerCase();
  const classes = [...e.classList].filter(Boolean).sort();
  if ((tag === 'a' || tag === 'button') && classes.includes('btn')) tag = 'a|button';
  const style = (e.getAttribute('style') || '').split(';').map((d) => d.split(':')[0]!.trim().toLowerCase()).filter(Boolean).sort();
  let s = tag + classes.map((c) => '.' + c).join('');
  if (style.length) s += `[style:${style.join(',')}]`;
  if (tag === 'svg') {
    const use = e.querySelector('use');
    const href = use?.getAttribute('href') || use?.getAttribute('xlink:href');
    if (href) s += ` @${href.replace(/^#/, '')}`;
  }
  return s;
}

function parcourir(e: Element, profondeur: number, out: string[]) {
  out.push('  '.repeat(profondeur) + signature(e));
  // Une icône ou un graphique SVG est une feuille · son dessin ne se compare pas.
  if (e.tagName.toLowerCase() === 'svg') return;
  for (const c of [...e.children]) parcourir(c, profondeur + 1, out);
}

export interface OptionsParite {
  /** Compare le sous-arbre désigné (des deux côtés) au lieu de la racine. */
  selecteur?: string;
  /** Sélecteurs dont les DESCENDANTS sont retirés des deux côtés. */
  ignorer?: string[];
}

export function squelette(html: string, o: OptionsParite = {}): string[] {
  const racine = element(html, o.selecteur);
  for (const sel of o.ignorer ?? []) racine.querySelectorAll(sel).forEach((n) => { n.innerHTML = ''; });
  const out: string[] = [];
  parcourir(racine, 0, out);
  return out;
}

/** Les deux squelettes, prêts pour `expect(rendu).toEqual(reference)` (diff lisible). */
export function parite(htmlRendu: string, route: string, o: OptionsParite = {}): { rendu: string[]; reference: string[] } {
  return { rendu: squelette(htmlRendu, o), reference: squelette(fragmentReference(route), o) };
}
