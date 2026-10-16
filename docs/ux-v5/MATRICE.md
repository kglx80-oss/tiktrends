# UX V5 · matrice de raccordement

Référence : prototype V5.15 de Kevin du 14/10/2026 (dossier « TikTrends-V5-Dossier-Claude-Code-14oct », 64 fichiers, empreintes du manifeste vérifiées). Code : `main` à `394ed04`, plus les dix PR UX V2 ouvertes (#782 à #791).

Cette page dit, pour chaque vue de la V5, ce qui existe réellement, ce qui manque et ce qui attend une décision. Le détail contrôle par contrôle (libellé exact, fichier:ligne, garde serveur, persistance, coût) vit dans les quatre inventaires :

| Zone | Fichier | Lignes |
| --- | --- | --- |
| Coquille, profil, Accueil, Studios, Réglages | [inventaire-coquille-accueil.md](inventaire-coquille-accueil.md) | 152 |
| Veille, Bibliothèque, Marques, personas | [inventaire-veille-biblio-marques.md](inventaire-veille-biblio-marques.md) | 213 |
| Projets, assistant, canvas, devis, export | [inventaire-projets-canvas.md](inventaire-projets-canvas.md) | 160 |
| Résultats, Jarvis, ADMIN+ | [inventaire-resultats-jarvis-admin.md](inventaire-resultats-jarvis-admin.md) | 140 |

## Statuts

- **raccordé** : la fonction existe sur `main` avec le même rôle. La présentation V5 reste à porter.
- **raccordé PR #n** : la fonction n'existe que dans une PR ouverte.
- **partiel** : la fonction existe, mais diffère de la V5 (la colonne « note » dit en quoi).
- **à créer** : rien d'équivalent dans le code.
- **décision Kevin** : offre, prix, crédits par action, Stripe, nouveau connecteur publicitaire, Drive étendu, nouvelle dépense IA, nouveaux droits. Rien n'est codé sans son accord écrit.

Comptage (environ 665 contrôles, tableaux des quatre inventaires) :

| Zone | raccordé | raccordé PR | partiel | à créer | décision Kevin |
| --- | --- | --- | --- | --- | --- |
| Coquille et Accueil | 56 | 5 | 55 | 27 | 9 |
| Veille, Bibliothèque, Marques | 33 | 4 | 84 | 73 | 18 |
| Projets et canvas | 61 | 7 | 59 | 29 | 4 |
| Résultats, Jarvis, ADMIN+ | 34 | 6 | 45 | 35 | 20 |
| **Total** | **184** | **22** | **243** | **164** | **51** |

Un contrôle « raccordé » n'est pas livré : il le sera quand la vue V5 est portée, rendue, testée et observée sur OVH.

## Correspondance V5 et routes réelles

| Vue V5 | Route réelle |
| --- | --- |
| #home | `/dashboard` |
| #studios, pop-up « Nouveau projet » | `/studio/projets`, `/studio/projets/nouveau` (`?ref=`, `?iter=`) |
| #project (Brief, Canvas, Créations), #product, #review | `/studio/projets/[id]` et ses ateliers `/image`, `/video`, `/textes`, `/produit`, `/identites`, `/export` |
| #veille, #saved, #scale, #formats | `/veille`, `/saved`, `/veille/scale`, `/veille/formats` |
| #tags, recherches enregistrées | aucune (la page `/tags` actuelle est une démonstration de performance des tags) |
| #radar | `/saved?onglet=marques` (marques suivies), `/adsmap/radar` (admin, Plus) |
| #library, #assets | `/assets` |
| #brands, #brand, #competitors, audiences | `/brands`, `/brands/[id]?tab=…`, `/brands/[id]/competitors/[name]` |
| #results, #lots, #protocol, #import, #learning | `/adsmap`, `/adsmap/lots`, `/adsmap/protocole`, `/adsmap/import`, `/adsmap/suites` |
| #hypotheses | aucune équivalence stricte (`/adsmap/tri` trie des propositions) |
| #jarvis, #sources | `/jarvis`, `/jarvis/sources` |
| #settings, #team, #connections, #usage, #billing, #profile, #support | mêmes chemins |
| #admin | `/admin` |
| #prompts, #prompt-edit, #releases, #execution | `/admin/ia-studios` (onglets) |
| #knowledge | `/admin/connaissances` |
| #capabilities | `/admin/studios-interrupteurs` |
| #admincosts, #jobs | `/admin/depenses` |
| #adminmargins | `/credits` |
| #adminfinance, #adminusers, #adminroles et #adminperms, #adminplans, #adminpayment, #adminincidents, #adminintelligence, #console | `/admin/finance`, `/admin/signups`, `/admin/equipe`, `/admin/plans`, `/admin/paiement`, `/admin/incidents`, `/admin/intelligence`, `/console` |
| #auditlog, #activity | aucune (les événements Studios sont écrits dans `studio_audit_events`, sans écran) |

## Constats sur le prototype

- `#flow` n'est pas une route : c'est l'identifiant du bloc canvas, monté seulement dans `#project` avec l'onglet Canvas et le mode Image. Une ouverture directe de `#flow` donne une page vide. Dans l'application, le canvas est l'onglet d'un projet existant (`/studio/projets/[id]`) et s'ouvre toujours avec son projet.
- `v5-new.js` (routes `#new-strategie` à `#new-resultats`) n'est pas chargé par `index.html`. Le parcours réel du prototype est la modale `studioWizard` de `v5-wizard.js`, complétée par `v5-r12.js` (persona obligatoire). C'est elle qui fait référence.
- Dans la dernière couche, la bascule clair / sombre est dans la pop-up profil, pas dans l'en-tête.
- L'orbe Jarvis occupe le coin bas droit, où se trouve aujourd'hui la bulle Support. La cloche des notifications, absente du prototype, est à garder.
- Le thème sombre de la V5 reprend les fonds de `main` (`#120810`, `#1c121b`, `#0d070c`). L'accent passe du dégradé `#fe2c55 → #ff2d8f` à un rose plein `#ff5c8a`.

## Écarts structurants

1. **Thème clair et ADMIN+ bleu nuit / menthe.** `main` n'a que des tokens sombres et environ 886 couleurs écrites en dur dans 175 fichiers d'interface. Il faut des tokens sémantiques, une préférence lue au rendu serveur (cookie, sans flash), puis passer chaque littéral en token, avec une garde qui refuse tout nouveau littéral.
2. **Canvas de lignée.** Le canvas réel montre la chaîne de production d'une version (cartes dérivées, liens calculés, positions seules enregistrées). Le canvas V5 montre la lignée marketing : brief, références, hypothèse, direction, créations, résultat, apprentissage, itération. Ces données existent déjà (`studio_project_versions.parentId`, `studio_variants`, `studio_test_links`, verdicts Adsmap, `sourceRefs`, `brief.hypothesisId`). La voie retenue est une projection en lecture seule calculée dans `packages/core`, dont chaque nœud appelle les commandes existantes (`iterer`, `creerDevis`, `rattacherVarianteAuTest`, `proposerPatch`). Aucun second moteur, aucun lien dessiné qui se ferait passer pour une dépendance.
3. **Assistant « Nouveau projet » en étapes et brief structuré.** Aujourd'hui, un projet naît vide en deux champs. La V5 demande persona, objectif, plateformes, angle, concept dans le brief : extension de `BriefCanonique` (jsonb, sans migration), du contrat `brief.build` et du lien vers les personas et angles Adsmap.
4. **Panneau Jarvis global** (orbe, touche J hors saisie, contexte de page). Jarvis existe en page pleine et dans les projets. Un panneau partout réutilise la même route et le même fil ; toute tâche contextuelle nouvelle qui coûte passe par une release et un devis.
5. **Veille et Bibliothèque.** Il manque en base : dossiers de bibliothèque, collections multiples et tags de sauvegarde, recherches enregistrées et alertes, personas détaillés. Chacun est une migration.
6. **Boucle Hypothèse, Lot, Apprentissage.** Dans le réel, l'hypothèse est un texte par annonce et le verdict se rend par annonce. Le kanban d'hypothèses et la conclusion par lot demandent un modèle et des règles nouvelles au noyau.
7. **ADMIN+.** Les fonctions existent surtout sous forme de pages séparées. La V5 les range dans un espace à rail dédié. La plupart des écrans se portent sans changer de service.

## Décisions qui reviennent à Kevin

Rien de ce qui suit n'est codé tant qu'il n'a pas tranché par écrit.

- **Offre et prix** : formules du prototype (Essentiel, Pro, Agence) au lieu de Starter, Core, Plus, Business ; forfaits de recharge 500 / 1 500 / 5 000 au lieu des packs actuels ; crédits par action modifiables ; édition des offres et liens Stripe depuis ADMIN+ ; codes promo.
- **Nouvelles dépenses IA** : Score Jarvis (0 ou 2 crédits), choix du moteur avec grille par moteur, voix, contrôle de conformité de marque, scan de marque, transcription et actions IA sur une créative de Veille, analyse automatique des médias Drive, suggestions « Sur cette page » de Jarvis.
- **Nouveaux connecteurs** : TikTok Ads (pas de callback aujourd'hui), Google Ads, Snapchat, Pinterest, Dropbox, GA4 ; Drive en plusieurs dossiers avec synchronisation.
- **Sécurité et droits affichés par la V5 qui n'existent pas** : double authentification, connexion « en tant que », groupes à niveaux, portée partenaire, SSO, restriction par IP, sessions de 8 h, rotation des clés, suspension, export RGPD. Aucun écran ne les affichera avant leur implémentation.
- **Recherches enregistrées avec alertes** : appel récurrent au fournisseur de Veille, donc coût récurrent.

## Défauts trouvés pendant l'inventaire

- **Bibliothèque** : les actions serveur de `app/actions/assets.ts` ne vérifient que la session, alors que la page exige le rôle membre et la formule Core. Un compte client en lecture peut supprimer ou importer un asset et lancer le tagging IA, qui consomme des crédits. Correctif en PR séparée.
- **Marques suivies** : `followBrand` et `unfollowBrand` ne vérifient que la session. Même correctif.

## Ordre des lots

Chaque lot est une PR partie de `main`, sans empilement, avec les quatre portes, un test de rendu éprouvé par mutation, des captures clair et sombre en 1440, 1280 et 390 × 720, puis la recette Codex.

1. **Socle** : A1 logos (à partir de `logos-outils.ts` et `BrandTile` existants), A2 garde du tiret cadratin, A3 modales, puis A4 tokens et thème clair (après la fusion des PR UX V2, qui touchent les mêmes fichiers).
2. **Coquille V5** : rail, pastille de crédits au solde réel, en-tête, pop-up profil avec bascule de thème, ADMIN+ en espace séparé avec rail dédié et retour créatif.
3. **Parcours complet** : Accueil (prochaines itérations sur les données Adsmap réelles), Nouveau projet en étapes, projet en onglets, devis, génération, créations, export.
4. **Canvas de lignée**, Bibliothèque, variantes et reprise des projets.
5. **Résultats, apprentissage, itération** ; ADMIN+ connecté (prompts, connaissances, coûts, incidents, accès).
6. **Interactions secondaires** et recette transversale, puis déploiement OVH et observation.

## Ce qui conditionne le calendrier

Les dix PR UX V2 (#782 à #791) touchent la coquille, l'Accueil, la Veille, les Résultats, ADMIN+ et la barre de projet, c'est-à-dire la base de la V5. Elles sont vertes, sans conflit avec `main` et entre elles (trois résolutions connues : `app/(app)/layout.tsx`, `EditeurCalques.tsx`, `packages/core/src/index.ts`). Les lots 1 (A4) à 5 partent après leur fusion.
