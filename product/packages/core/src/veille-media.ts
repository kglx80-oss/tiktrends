/**
 * L'image d'aperçu d'une créa de veille.
 *
 * ── Le défaut que ça corrige ─────────────────────────────────────────────────
 *
 * La source ne génère un `thumbnailUrl` que pour la VIDÉO. Un statique (photo)
 * porte son image dans `mediaUrl` · c'est déjà ce que suppose le reste du code,
 * qui ouvre `mediaUrl` « en grand » quand on clique une image. Mais l'affichage
 * inline ne lisait que `thumbnailUrl` · résultat, un statique qui AVAIT une
 * image montrait « Aperçu indisponible ».
 *
 * Ici, une seule règle · l'aperçu est le thumbnail s'il existe, sinon le média
 * lui-même quand ce n'est PAS une vidéo (on ne met jamais un `.mp4` dans un
 * `<img>`). Rien à afficher renvoie `null` · l'appelant montre alors le repli.
 */
export function apercuImage(m: {
  isVideo?: boolean;
  thumbnailUrl?: string | null;
  mediaUrl?: string | null;
}): string | null {
  if (m.thumbnailUrl) return m.thumbnailUrl;
  if (!m.isVideo && m.mediaUrl) return m.mediaUrl;
  return null;
}
