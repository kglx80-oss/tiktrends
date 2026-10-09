/**
 * Studios · L8-C · LIMITES explicites d'un contenu (UX-06, cahier §13).
 *
 * Pur. Le cahier fixe l'échelle de stress à 200 plans et 1000 calques : « l'UI
 * doit rester navigable ou indiquer la limite documentée sans crash ni
 * perte ». Ces limites sont cette échelle, MESURÉE (`mesures.ts`, temps CPU) :
 *
 *  · règle de choix : la plus grande échelle mesurée où chaque geste
 *    interactif tient la cible du cahier (feedback < 300 ms) avec une marge
 *    d'au moins ×2 ;
 *  · à 200 plans / 1000 calques, la réaction de l'éditeur à un geste tient
 *    en 108 ms p95 (×2,8), l'aperçu d'un geste de montage en 101 ms (×3,0),
 *    l'enregistrement en 109 ms (cible 2 s), l'ouverture de l'écran vidéo en
 *    119 ms (cible 2 s) ;
 *  · au double (400 / 2000), l'impact d'une seule correction de texte coûte
 *    déjà 158 ms médiane, 215 ms p95 (marge ×1,4) avant même le geste et le
 *    statut ; la règle n'est plus tenue. On s'arrête à l'échelle éprouvée.
 *
 * Au-delà : REFUS ciblé, sans perte. Rien n'est écrit, la version courante
 * reste intacte, et le message dit la limite et quoi faire. Un contenu DÉJÀ
 * au-delà (antérieur à ces limites) n'est refusé que s'il GRANDIT, dès que
 * l'appelant passe sa base (`base`) : l'éditeur l'ouvre (lecture L8-C) ; les
 * gestes et l'enregistrement qui ne passent pas encore leur base sont des
 * raccords nommés au rapport L8-C.
 *
 * La taille maximale du contenu sérialisé (`TAILLE_MAX_CONTENU`, document.ts)
 * reste la borne de dernier recours : 200 plans et 1000 calques synthétiques
 * occupent 0,41 M caractères sur 2 M (mesuré).
 */

/** Calques d'un document · au-delà, refus. */
export const CALQUES_MAX = 1000;
/** Plans d'un projet (toutes sources confondues) · au-delà, refus. `PLANS_MAX` (20) reste la borne d'UN scénario. */
export const PLANS_MAX_PROJET = 200;

export interface ViolationLimite { chemin: string; raison: string }

/** Phrase de refus · la limite, le compte, et quoi faire. */
export function messageLimiteCalques(n: number): string {
  return `Le document compterait ${n} calques · la limite est de ${CALQUES_MAX} par document. Supprime ou regroupe des calques avant d’en ajouter ; rien d’autre n’est modifié.`;
}
export function messageLimitePlans(n: number): string {
  return `Le projet compterait ${n} plans · la limite est de ${PLANS_MAX_PROJET} par projet. Retire des plans ou scinde la vidéo en plusieurs projets ; rien d’autre n’est modifié.`;
}

/** Libellé à afficher près des contrôles qui ajoutent (raccord d'écran). */
export const LIBELLE_LIMITES_STUDIO = `Jusqu’à ${CALQUES_MAX} calques par document et ${PLANS_MAX_PROJET} plans par projet.`;

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const compte = (x: unknown): number => (estObjet(x) ? Object.keys(x).length : 0);

/** Nombre de calques d'un document (0 si illisible). */
export const nombreCalques = (doc: unknown): number => (estObjet(doc) ? compte(doc.layers) : 0);
/** Nombre de plans d'un contenu · le plus grand de `byId` et `order` (0 si illisible). */
export function nombrePlans(contenu: unknown): number {
  if (!estObjet(contenu) || !estObjet(contenu.shots)) return 0;
  const ordre = contenu.shots.order;
  return Math.max(compte(contenu.shots.byId), Array.isArray(ordre) ? ordre.length : 0);
}

/**
 * Refus si `n` dépasse `max` ET grandit par rapport à la base (`nBase`, 0
 * sans base) : on n'empêche jamais de ramener un contenu sous la limite.
 */
export const depasse = (n: number, max: number, nBase: number): boolean => n > max && n > nBase;

export function depassementCalques(doc: unknown, base: unknown, chemin = '/document'): ViolationLimite | null {
  const n = nombreCalques(doc);
  return depasse(n, CALQUES_MAX, nombreCalques(base)) ? { chemin: `${chemin}/layers`, raison: messageLimiteCalques(n) } : null;
}

export function depassementPlans(contenu: unknown, base: unknown): ViolationLimite | null {
  const n = nombrePlans(contenu);
  return depasse(n, PLANS_MAX_PROJET, nombrePlans(base)) ? { chemin: '/shots', raison: messageLimitePlans(n) } : null;
}
