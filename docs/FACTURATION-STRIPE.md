# Facturation · mettre en ligne l'offre V2 dans Stripe

Ce guide s'adresse au propriétaire (Kevin). Il décrit ce qu'il faut créer dans Stripe en **mode réel**, où coller chaque identifiant dans `.env.deploy` sur le VPS, comment allumer l'offre et comment vérifier. **Aucun secret ne va dans le dépôt ni dans une conversation.**

Offre décidée le 29/10 :

| Forfait | Mensuel TTC | Annuel TTC (−30 %) | Crédits par mois |
| --- | --- | --- | --- |
| Essentiel | 29,00 € | 243,60 € par an | 4 000 |
| Pro | 49,00 € | 411,60 € par an | 7 000 |
| Agence | 129,00 € | 1 083,60 € par an | 18 500 |

Les recharges coûtent 5,00 / 4,50 / 4,20 € TTC les 1 000 crédits selon le forfait, en packs de 2 000, 5 000 et 15 000 crédits.

Source unique dans le code : `product/packages/core/src/offre/`. Le test `offre-marges.test.ts` y garde une marge d'au moins 70 % au pire cas.

---

## 0. Ce qu'il faut savoir avant de commencer

- **Rien ne change tant que `TARIFS_V2` n'est pas posé.** La page Forfaits, le paiement et les droits restent ceux d'aujourd'hui. Les gardes `forfaits-v2-rendu` et `stripe-v2-db` le prouvent. On peut donc créer les prix, les coller, redéployer, et n'allumer qu'à la fin.
- **Il faut des identifiants de prix (`price_…`), jamais des liens de paiement (`buy.stripe.com/…`).** Un paiement passé par un lien ne porte pas le forfait. Le webhook ne créditerait pas le client.
- **Les prix sont TTC.** Chaque prix est créé « taxe incluse », et Stripe Tax calcule la TVA à l'intérieur. Un client professionnel de l'Union européenne qui donne son numéro de TVA paie le même montant, en autoliquidation.

## 1. Stripe Tax (une fois)

1. Dans Stripe, mode **réel** : **Paramètres → Taxes**.
2. Renseigne l'**adresse d'origine** (le siège en France) et le **code fiscal par défaut** des produits : *Logiciel en tant que service · usage professionnel* (`txcd_10103001`).
3. **Inscriptions** : ajoute la France (TVA). Ajoute aussi les pays où tu dépasses le seuil européen de vente à distance, si c'est le cas (Stripe les signale dans le même écran).
4. **Comportement des prix** : choisis *taxe incluse* par défaut.

> L'appli active `automatic_tax` à chaque paiement V2, abonnement comme recharge. Elle collecte l'adresse de facturation et le numéro de TVA (`tax_id_collection`). Sans Stripe Tax configuré, Stripe refuse la session : c'est pourquoi ce réglage passe en premier.
>
> Stripe Tax facture environ 0,5 % par paiement taxé (tarif public, à vérifier). Ce coût est compté dans la marge (`FRAIS_STRIPE_TAX_PCT`).

## 2. Produits et prix (six prix)

**Catalogue de produits → Ajouter un produit**, trois fois :

| Produit | Prix 1 (mensuel) | Prix 2 (annuel) |
| --- | --- | --- |
| TikTrends · Essentiel | 29,00 EUR · récurrent · **mensuel** · taxe **incluse** | 243,60 EUR · récurrent · **annuel** · taxe **incluse** |
| TikTrends · Pro | 49,00 EUR · mensuel · incluse | 411,60 EUR · annuel · incluse |
| TikTrends · Agence | 129,00 EUR · mensuel · incluse | 1 083,60 EUR · annuel · incluse |

Pour chaque prix, ouvre sa fiche et copie son identifiant **`price_…`**.

**Recharges (facultatif).** Sans rien créer, l'appli envoie un prix en ligne TTC au bon montant, taxe incluse. Si tu préfères des produits Stripe, crée un prix ponctuel par forfait et par pack, soit neuf prix au plus. Les noms de variables sont donnés au point 3.

## 3. Où coller chaque identifiant (`.env.deploy` sur le VPS)

```
STRIPE_PRICE_ESSENTIEL_MENSUEL=price_…
STRIPE_PRICE_ESSENTIEL_ANNUEL=price_…
STRIPE_PRICE_PRO_MENSUEL=price_…
STRIPE_PRICE_PRO_ANNUEL=price_…
STRIPE_PRICE_AGENCE_MENSUEL=price_…
STRIPE_PRICE_AGENCE_ANNUEL=price_…

# facultatif · recharges en produits Stripe (vide = prix en ligne TTC calculé par l'appli)
STRIPE_PRICE_RECHARGE_ESSENTIEL_2000=
STRIPE_PRICE_RECHARGE_ESSENTIEL_5000=
STRIPE_PRICE_RECHARGE_ESSENTIEL_15000=
STRIPE_PRICE_RECHARGE_PRO_2000=
STRIPE_PRICE_RECHARGE_PRO_5000=
STRIPE_PRICE_RECHARGE_PRO_15000=
STRIPE_PRICE_RECHARGE_AGENCE_2000=
STRIPE_PRICE_RECHARGE_AGENCE_5000=
STRIPE_PRICE_RECHARGE_AGENCE_15000=
```

Une recharge en produit Stripe doit être un prix **ponctuel**, EUR, taxe **incluse**, au montant de la grille (par exemple 22,50 € pour 5 000 crédits Pro). Le plus simple est de laisser ces neuf lignes vides.

Garde aussi `STRIPE_SECRET_KEY` (clé **réelle** `sk_live_…`) et `STRIPE_WEBHOOK_SECRET`, comme aujourd'hui. Les anciens `STRIPE_PRICE_CORE`, `STRIPE_PRICE_PLUS` et `STRIPE_PRICE_BUSINESS` restent posés : les abonnés actuels sont encore sur ces prix jusqu'à leur échéance.

Les deux gabarits (`product/.env.example` et `product/.env.deploy.example`) listent ces noms, vides. La garde `stripe-env-exemples` échoue si le code lit un nom absent des gabarits.

Les deux tâches planifiées de la facturation (point 5) passent par `CRON_SECRET`, comme le radar et le tracker. S'il est déjà posé dans `.env.deploy` (les radars tournent), il n'y a rien à faire. Sinon, les tâches ne partent pas et les workers écrivent « CRON_SECRET absent ».

## 4. Portail client et webhook

- **Paramètres → Facturation → Portail client** :
  - autorise l'**annulation** ;
  - autorise le **changement d'abonnement** entre les six prix V2 (Essentiel, Pro et Agence, en mensuel et en annuel) ;
  - choisis *sans prorata* ou *prorata immédiat*, à ta préférence.
- **Développeurs → Webhooks** : l'endpoint existant `https://app.tiktrends.co/api/stripe/webhook` suffit. Il doit écouter `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted` et `invoice.paid`. Ce sont les mêmes événements qu'aujourd'hui, rien à ajouter.

## 5. Allumer l'offre V2

1. Ajoute **`TARIFS_V2=1`** dans `.env.deploy` sur le VPS. Le redéploiement de la minute suivante relit l'environnement.
2. Ce qui change alors :
   - **Réglages · Forfaits** montre Essentiel, Pro et Agence, avec la bascule mensuel / annuel (−30 %), les prix TTC, les crédits et les droits réels ;
   - un nouvel abonné souscrit un forfait V2. Le paiement passe par Stripe Tax ;
   - un abonné V2 a ses droits appliqués au serveur (marques, concurrents par marque, durée vidéo, clone vidéo, file du support). Ses appels IA aujourd'hui inclus (conversation Jarvis, appels texte des Studios, contrôle visuel, radar, brouillon de concept, relecture) se débitent en crédits, au prix annoncé avant le clic ;
   - un abonné actuel (Core, Plus, Business) **garde son prix et ses droits** et voit un préavis daté dans Réglages · Forfaits. La tâche quotidienne `bascule-forfaits` (03:40) pose dans Stripe un échéancier qui passe son abonnement au prix V2 mensuel **à son échéance**, sans prorata. Core devient Essentiel, Plus devient Pro, Business devient Agence ;
   - un abonné annuel reçoit ses crédits chaque mois, par la tâche quotidienne `allocations-annuelles` (03:20).
3. **Revenir en arrière** : retire `TARIFS_V2`. La page et le paiement redeviennent ceux d'aujourd'hui. Les échéanciers déjà posés dans Stripe restent : pour en annuler un, va dans **Abonnements → l'abonnement → Échéancier → Libérer**.

## 6. Vérifier

**D'abord en mode test, conseillé.** Tout ce qui suit marche aussi avec une clé `sk_test_…`, des prix de test et la carte `4242 4242 4242 4242`. On peut ensuite refaire le seul achat réel ci-dessous. Remets bien les clés et les prix **réels** avant d'allumer.

- **Un achat** : souscris Essentiel mensuel. L'espace passe en Essentiel avec 4 000 crédits. La facture Stripe montre la TVA incluse dans 29 €.
- **Une recharge** : depuis Réglages · Forfaits, achète le plus petit pack (2 000 crédits, 10 € pour Essentiel). Le solde augmente de 2 000. Le journal montre « Recharge de crédits (Stripe) ». Ces crédits restent après le renouvellement.
- **Un renouvellement** : en mode test, crée l'abonnement sur une **horloge de test** (Stripe, Facturation, Horloges de test) et avance d'un mois. Au paiement de la facture (`invoice.paid`), la poche du forfait revient à 4 000 et les crédits achetés ne bougent pas. Pour un **annuel**, avance d'un mois sans facture : c'est la tâche `allocations-annuelles` (03:20) qui remet les crédits du mois. Pour la déclencher tout de suite, appelle `/api/cron/allocations` avec l'en-tête `Authorization: Bearer <CRON_SECRET>`, depuis le VPS.

- **Page** : ouvre Réglages · Forfaits. Tu dois voir trois cartes, « / mois TTC » et la bascule Annuel −30 %.
- **Paiement réel** : souscris Essentiel mensuel avec ta carte. Vérifie que la TVA apparaît sur la facture Stripe et que l'espace reçoit 4 000 crédits. Rembourse-toi ensuite depuis Stripe.
- **Base** (accès SSH, lecture seule) :
  ```sql
  SELECT plan, billing_interval, subscription_status, count(*) FROM workspaces GROUP BY 1,2,3 ORDER BY 1,2,3;
  SELECT id, plan, next_allocation_at FROM workspaces WHERE billing_interval = 'annuel';
  ```
- **Tâches planifiées** : dans les journaux des workers, `[cron] completed allocations-annuelles` et `[cron] completed bascule-forfaits`. La réponse de `/api/cron/bascule-forfaits` donne le nombre d'échéanciers posés.
- **Diagnostic ADMIN (Stripe & Whop)** : la section **« Prêt pour l'offre V2 ? »** (personnel de la plateforme) lit Stripe en lecture seule au clic sur « Vérifier » et dit, ligne par ligne (OK · À faire · Erreur) avec le geste correctif : la clé secrète et son mode (par le préfixe seulement, jamais la valeur), le secret du webhook, les six `STRIPE_PRICE_<FORFAIT>_<MENSUEL|ANNUEL>` (existant, actif, EUR, montant TTC du code, récurrence, taxe incluse, même mode que la clé), les recharges posées, `CRON_SECRET`, Stripe Tax, l'endpoint webhook et ses événements, le portail client (annulation, changement entre les six prix), puis l'état de `TARIFS_V2`. Sa dernière phrase dit « Tout est prêt, tu peux poser TARIFS_V2=1 » ou ce qui manque. La règle vit dans `product/packages/core/src/offre/diagnostic-v2.ts`.

## 7. Starter (non appliqué · à décider)

Starter est l'essai gratuit (3 000 crédits sur 14 jours) et n'a pas d'abonnement. Il reste tel quel sous `TARIFS_V2`, avec les droits, le barème et les recharges d'aujourd'hui. Proposition : à la fin de l'essai, demander de choisir Essentiel, Pro ou Agence, et passer les recharges d'un compte Starter au prix Essentiel (5,00 € les 1 000 crédits). Rien de cela n'est codé tant que tu ne l'as pas validé.
