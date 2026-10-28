/**
 * Le test manuel de la chaîne de paiement, à la carte (repris tel quel de
 * l'ancien `/admin/paiement`) · ce qu'on fait, et ce qu'on doit constater. Seul
 * ce parcours valide l'expérience réelle · le diagnostic valide la configuration.
 */
export const ETAPES_TEST_PAIEMENT: ReadonlyArray<{ faire: string; verifier: string }> = [
  {
    faire: 'Depuis un compte client (pas le compte fondateur), ouvrir « Abonnement & factures » et souscrire la formule Core.',
    verifier: 'Stripe Checkout s’ouvre en euros, au tarif affiché sur la carte.',
  },
  {
    faire: 'Payer avec la carte de test 4242 4242 4242 4242 · date future, CVC au hasard.',
    verifier: 'Retour sur /billing avec le bandeau « Abonnement activé ».',
  },
  {
    faire: 'Ouvrir « Utilisation des crédits ».',
    verifier: 'Le solde vaut l’allocation de la formule, et une ligne « Abonnement core · allocation » apparaît au journal.',
  },
  {
    faire: 'Acheter une recharge depuis la puce de crédits (menu en bas du rail).',
    verifier: 'Le solde augmente du montant acheté · une ligne « Recharge de crédits (Stripe) » s’ajoute.',
  },
  {
    faire: 'Dans Stripe (mode test), déclencher un renouvellement sur l’abonnement.',
    verifier: 'Le solde repart à l’allocation SANS effacer la recharge achetée juste avant. C’est le point le plus important.',
  },
  {
    faire: 'Cliquer « Gérer mon abonnement », puis résilier depuis le portail Stripe.',
    verifier: 'L’espace repasse en Starter, et les fonctionnalités Core se verrouillent.',
  },
  {
    faire: 'Dans Stripe > Développeurs > Webhooks, ouvrir l’endpoint et regarder les livraisons.',
    verifier: 'Tous les événements sont en 200. Un renvoi manuel du même événement répond « duplicate » sans re-créditer.',
  },
];
