/**
 * Comment afficher la miniature d'un asset · règle pure, donc testable.
 *
 * Un asset dont l'URL ne charge plus (lien expiré, objet supprimé) montrait
 * l'icône « image cassée » du navigateur. Et un lien vidéo (non téléversé) n'a
 * pas de flux lisible en `<video>`. On décide ici quoi rendre · l'image, la
 * vidéo, ou une icône de repli · le composant applique.
 */
export type ApercuAsset = 'image' | 'video' | 'icone';

export function apercuAsset(kind: string, source: string | undefined, cassee: boolean): ApercuAsset {
  if (cassee) return 'icone';                       // le chargement a échoué
  if (kind === 'image') return 'image';
  if (kind === 'video' && source === 'upload') return 'video'; // seul un upload a un flux lisible
  return 'icone';                                   // audio, autre, ou vidéo par lien
}
