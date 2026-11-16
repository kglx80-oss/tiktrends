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
const RETOUR: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'' };

export function echapperHtml(valeur: string | number | null | undefined): string {
  return String(valeur ?? '').replace(/[&<>"']/g, (c) => ENTITES[c]!);
}

/**
 * L'inverse, pour la version TEXTE d'un e-mail tirée de son HTML · le texte
 * brut affiche « L'Atelier & Co », pas « L&#39;Atelier &amp; Co ». Une seule
 * passe · `&amp;lt;` redonne `&lt;`, jamais `<`.
 */
export function desechapperHtml(html: string): string {
  return html.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => RETOUR[e]!);
}
