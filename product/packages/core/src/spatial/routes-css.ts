/**
 * Les règles de la maquette qui visent une ADRESSE À DIÈSE du prototype
 * (`.qa2[href="#nouveau"] .ico`, `.stat2[href="#lots"] .ring .pr`…). Dans
 * l'application, les liens pointent vers de vraies adresses (`/studio/…`),
 * donc ces sélecteurs ne s'appliquent jamais et les couleurs disparaissent.
 *
 * `spatial.css` reste intouchable (garde à l'octet). On en DÉRIVE une seconde
 * feuille, mécaniquement : chaque règle qui contient `[href="#X"]` est reprise
 * telle quelle, ce sélecteur devenant `[data-route="X"]`. Même spécificité,
 * mêmes déclarations · un composant pose `data-route="nouveau"` sur son lien.
 * Pur. La garde `spatial-fondation` exige que le fichier livré soit EXACTEMENT
 * cette dérivation.
 */
const DIESE = /\[href="#([a-z0-9-]+)"\]/g;

export const ENTETE_ROUTES_CSS = '/* Dérivée de spatial.css par deriverRoutesCss (noyau) · ne pas éditer à la main. */\n';

export function deriverRoutesCss(css: string): string {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const regles: string[] = [];
  // Règles de premier niveau seulement · celles visées n'ont ni @media ni imbrication.
  let profondeur = 0, debut = 0;
  for (let i = 0; i < sansCommentaires.length; i++) {
    const c = sansCommentaires[i];
    if (c === '{') profondeur++;
    else if (c === '}') {
      profondeur--;
      if (profondeur === 0) {
        const regle = sansCommentaires.slice(debut, i + 1).trim();
        debut = i + 1;
        const sel = regle.slice(0, regle.indexOf('{'));
        if (!sel.startsWith('@') && DIESE.test(sel)) regles.push(regle.replace(DIESE, '[data-route="$1"]'));
        DIESE.lastIndex = 0;
      }
    }
  }
  return ENTETE_ROUTES_CSS + regles.join('\n') + '\n';
}

/** Les adresses de la maquette qui portent une couleur propre. */
export function routesColorees(css: string): string[] {
  return [...new Set([...css.matchAll(DIESE)].map((m) => m[1]!))].sort();
}
