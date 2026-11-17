/**
 * Échappement HTML d'une valeur SAISIE insérée dans un gabarit (e-mails).
 *
 * Les cinq caractères qui changent le sens d'un fragment HTML, en texte comme
 * dans une valeur d'attribut entre guillemets · `&` (d'abord, sinon une entité
 * légitime serait lue comme telle), `<`, `>`, `"`, `'`. Un nom d'espace
 * `<a href="https://piege.test">Valider</a>` devient du TEXTE affiché, jamais
 * un lien. Pur · aucune dépendance.
 */
const ENTITES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
const RETOUR: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'', '&#8203;': '\u200b' };

export function echapperHtml(valeur: string | number | null | undefined): string {
  return String(valeur ?? '').replace(/[&<>"']/g, (c) => ENTITES[c]!);
}

/**
 * L'inverse, pour la version TEXTE d'un e-mail tirée de son HTML · le texte
 * brut affiche « L'Atelier & Co », pas « L&#39;Atelier &amp; Co ». Une seule
 * passe · `&amp;lt;` redonne `&lt;`, jamais `<`.
 */
export function desechapperHtml(html: string): string {
  return html.replace(/&(?:amp|lt|gt|quot|#39|#8203);/g, (e) => RETOUR[e]!);
}

/**
 * Un NOM qui ressemble à une adresse (`piege.com`, `https://piege.com/x`,
 * `www.piege.com`) · les messageries en font un lien cliquable d'elles-mêmes,
 * même échappé. On glisse une espace de largeur nulle (`&#8203;`) après chaque
 * point (ASCII, et les points idéographiques et pleine chasse `。．｡` que les
 * messageries lisent aussi comme des points) suivi d'une lettre ou d'un chiffre
 * de toute écriture, et dans `://` · le nom s'affiche
 * à l'identique, aucun lien automatique ne se forme.
 *
 * Choix · neutraliser dans l'e-mail plutôt que refuser ces noms à la création
 * ou au renommage · c'est le moins intrusif (aucun espace existant n'est
 * bloqué, aucun écran ne change, « Studio.Paris » reste un nom valable), et le
 * risque n'existe QUE dans l'e-mail. S'applique à un texte DÉJÀ échappé
 * (`echapperHtml`).
 */
/**
 * Le même nom pour un SUJET d'e-mail (texte, pas HTML) · tronqué à `max`
 * caractères (« … » ensuite), neutralisé par la même règle (espace de largeur
 * nulle réelle, pas d'entité).
 */
export function nomPourSujet(nom: string, max = 60): string {
  const court = nom.length > max ? `${nom.slice(0, max)}…` : nom;
  return desechapperHtml(neutraliserAdresses(echapperHtml(court)));
}

export function neutraliserAdresses(texteEchappe: string): string {
  return texteEchappe.replace(/[.。．｡](?=[\p{L}\p{N}])/gu, (p) => `${p}&#8203;`).replace(/:\/\//g, ':&#8203;//');
}
