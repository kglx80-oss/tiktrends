/**
 * Bibliothèque · le PUT présigné vers le bucket · commun au téléversement
 * (`Bibliotheque.tsx`) et au remplacement (`remplacer-fichier.tsx`). Module
 * sans `'use client'` · une fonction exportée d'un module client deviendrait
 * une référence client (garde `spatial-fondation`).
 *
 * Le `Content-Type` envoyé est celui que le serveur a retenu et SIGNÉ (`decisionDepot`) · un autre type, le bucket refuse.
 * Le `Content-Length` est signé lui aussi, à la taille déclarée (`file.size`) · on envoie le fichier ENTIER, dont le
 * navigateur pose seul la longueur (en-tête interdit au script) ; un autre corps, le bucket refuse.
 */
export function envoyerVersBucket(url: string, file: File, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', contentType);
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('HTTP ' + x.status)));
    x.onerror = () => reject(new Error('Réseau'));
    x.send(file);
  });
}
