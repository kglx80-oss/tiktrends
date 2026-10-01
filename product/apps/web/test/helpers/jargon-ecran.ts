/**
 * Les marques de configuration technique qui ne doivent jamais atteindre un
 * écran client · noms de variables, de clés, de fournisseurs internes, de
 * « serveur » et d'infrastructure (recette #106b).
 *
 * Même intention que `jargonTechnique` du noyau (#716, pas encore sur main) ·
 * à réunir avec lui une fois #716 fusionnée.
 */
const MOTIFS: readonly RegExp[] = [
  /\b[A-Z0-9]+(_[A-Z0-9]+)+\b/, /API[_ ]?KEY/i, /\bscope\b/i, /oauth/i, /\bvariables?\b/i, /\btoken\b/i, /\bjeton\b/i,
  /configur/i, /\.env\b/i, /trendtrack/i, /anthropic/i, /serveur/i, /\bS3\b/, /\bCORS\b/, /bucket/i, /\bVPS\b/, /docker/i,
  /proxy/i, /postgres/i,
];

export function jargonEcran(texte: string): string[] {
  return MOTIFS.filter((m) => m.test(texte)).map((m) => (texte.match(m) ?? [''])[0]);
}

/** Le texte VISIBLE d'un HTML rendu · balises retirées, entités courantes décodées. */
export function texteVisible(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
}
