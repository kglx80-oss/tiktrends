/**
 * Spatial · Réglages · « Mon profil » (vague 4 · écran V5 `/profile` sans
 * fragment de maquette). Pur.
 *
 * Les messages des actions serveur qui redirigent (`changePasswordAction` ·
 * `?ok=pw`, `?e=weak`, `?e=current`) gardent les textes de l'écran V5, indexés
 * `ok:<code>` / `e:<code>` pour l'annonce de l'écran (`AnnonceRetour`).
 */
export function messagesRetourProfil(): Record<string, string> {
  return {
    'ok:1': 'Profil mis à jour.',
    'ok:pw': 'Mot de passe modifié.',
    'e:weak': 'Le nouveau mot de passe doit faire 8 caractères min.',
    'e:current': 'Mot de passe actuel incorrect.',
  };
}

/** Longueur minimale d'un nouveau mot de passe · la règle de `changePasswordAction`. */
export const MOT_DE_PASSE_MIN = 8;

/**
 * Les liens « Espace & accès » du profil · mêmes droits que l'écran V5 :
 * l'abonnement pour un administrateur de l'espace, le Tour de contrôle pour le
 * personnel de la plateforme (fondateur ET administrateur, la porte de `/admin`).
 */
export function liensAccesProfil(p: { admin: boolean; fondateur: boolean }): Array<{ href: string; libelle: string }> {
  if (!p.admin) return [];
  const l = [{ href: '/billing', libelle: 'Abonnement & factures' }];
  if (p.fondateur) l.push({ href: '/admin', libelle: 'Tour de contrôle' });
  return l;
}
