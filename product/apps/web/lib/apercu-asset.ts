/**
 * Comment afficher la miniature d'un asset · règle pure, donc testable.
 *
 * ── On montre le VRAI asset, pas une icône de type ───────────────────────────
 *
 * L'ancienne règle ne rendait une `<video>` que pour un fichier téléversé · tout
 * ce qui arrivait par lien ou par Drive (la majorité des vidéos, vu l'UX
 * d'import) tombait sur l'icône 🎬, même quand le flux était parfaitement
 * lisible. On tente donc le vrai média dès qu'on a un `kind` visuel · si le lien
 * n'est réellement pas jouable, `onError` bascule sur l'icône (le composant s'en
 * charge). Le repli reste, mais il n'est plus le cas par défaut.
 */
export type ApercuAsset = 'image' | 'video' | 'icone';

export function apercuAsset(kind: string, cassee: boolean): ApercuAsset {
  if (cassee) return 'icone';            // le chargement a échoué · repli propre
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'video';  // le vrai flux, quelle que soit la source
  return 'icone';                        // audio, autre · rien à rendre en visuel
}
