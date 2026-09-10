/**
 * Le moteur de correspondance de la palette ⌘K · pur, donc testable.
 *
 * Il vivait dans le composant client, insensible à la casse mais PAS aux
 * accents · taper « crea » ne trouvait pas « Créa », « element » ratait
 * « Élément ». Sur un clavier pressé, on tape rarement les accents · la
 * recherche doit les ignorer des deux côtés.
 */

/** Minuscule + accents retirés · « Créa » et « crea » deviennent le même mot. */
export function normaliser(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Score de correspondance (sous-séquence + préfixe de mot), 0 = pas de match. */
export function scoreRecherche(query: string, text: string): number {
  if (!query) return 1;
  const q = normaliser(query);
  const t = normaliser(text);
  const at = t.indexOf(q);
  if (at === 0) return 100;                         // préfixe exact
  if (at > 0) return t[at - 1] === ' ' ? 80 : 50;   // début de mot / contenu
  // sous-séquence (lettres dans l'ordre)
  let i = 0;
  for (const c of t) { if (c === q[i]) i++; if (i === q.length) return 20; }
  return 0;
}
