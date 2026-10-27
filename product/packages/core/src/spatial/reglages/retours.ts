/**
 * Spatial · Réglages · les messages des actions serveur qui redirigent
 * (`?ok=` / `?e=`) · mêmes textes que les écrans V5 (`/team`, `/billing`,
 * `/connections`). Indexés `ok:<code>` / `e:<code>` pour l'annonce de l'écran.
 */
const prefixer = (ok: Record<string, string>, err: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ok)) out[`ok:${k}`] = v;
  for (const [k, v] of Object.entries(err)) out[`e:${k}`] = v;
  return out;
};

export function messagesRetourEquipe(): Record<string, string> {
  return prefixer({
    invite: 'Invitation créée · aucun e-mail n’est parti (envoi non configuré) · copie le lien de l’invitation pour l’envoyer.',
    invite_mail: 'Invitation créée · l’e-mail est parti, le lien reste aussi copiable.',
    revoked: 'Invitation révoquée.',
  }, {
    forbidden: 'Action réservée aux administrateurs.', email: 'Renseigne un e-mail.', role: 'Rôle invalide.',
    already: 'Cette personne a déjà un compte.', notfound: 'Invitation introuvable.', bad: 'Demande incomplète · réessaie depuis la liste.',
  });
}

export function messagesRetourForfaits(): Record<string, string> {
  return prefixer({
    changed: 'Formule mise à jour.', same: 'C’est déjà ta formule actuelle.', subscribed: 'Abonnement activé · bienvenue !', topup: 'Crédits ajoutés · merci !',
  }, {
    forbidden: 'Réservé au propriétaire.', plan: 'Formule inconnue.', stripe: 'Paiement indisponible pour le moment.', cancel: 'Paiement annulé.', nosub: 'Aucun abonnement à gérer.',
  });
}

export function messagesRetourConnexions(): Record<string, string> {
  return prefixer({
    meta: 'Meta Ads connecté. Lance une synchro pour remonter les performances.',
    meta_pick: 'Meta connecté · plusieurs comptes publicitaires trouvés : choisis celui de cette marque dans « Gérer ».',
    meta_noacct: 'Meta connecté, mais aucun compte publicitaire trouvé · renseigne l’identifiant à la main.',
    shopify: 'Boutique Shopify connectée. Lance une synchro pour remonter les ventes.',
  }, {
    meta_config: 'Connexion Meta non configurée côté serveur.', meta_state: 'Session de connexion expirée, réessaie.', meta_session: 'Session invalide, reconnecte-toi.',
    meta_token: 'Échange du jeton Meta impossible.', meta_exchange: 'Erreur lors de la connexion Meta.', nobrand: 'Sélectionne une marque active.',
    shopify_config: 'Connexion Shopify non configurée côté serveur.', shopify_shop: 'Domaine .myshopify.com attendu.', shopify_state: 'Session de connexion expirée, réessaie.',
    shopify_hmac: 'Vérification Shopify échouée.', shopify_token: 'Échange du jeton Shopify impossible.', shopify_exchange: 'Erreur lors de la connexion Shopify.', shopify_session: 'Session invalide, reconnecte-toi.',
  });
}
