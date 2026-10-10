# UX V2 · inventaire au SHA `0b49d45` (10/10)

Référence : maquettes V2 validées par Kevin (`tiktrends-maquettes-v2`, 41 vues, 12 captures).
Les maquettes sont une référence VISUELLE et d'INTERACTION. Rien de leurs données, montants,
réponses Jarvis ou succès simulés n'entre dans le produit. Ce document dit ce qui EXISTE déjà
dans le dépôt, ce qui manque, et dans quel lot c'est traité.

## 1. Routes · `RACCORDEMENT-ROUTES.csv` rapproché de la tête réelle

Les 58 routes du fichier existent à `0b49d45`, avec deux écarts :

- `/studio`, `/studio/ads`, `/studio/image`, `/studio/video`, `/studio/textes` · déjà des
  REDIRECTIONS (#779) vers `/studio/projets` ou `/studio/projets/nouveau` (contexte repris).
  Elles restent servies ; elles ne réapparaissent pas dans le rail.
- `/studio/projets/nouveau` (préparation d'un projet, #779) · absente du fichier, à garder.

Destination dans le rail V2 (une seule entrée par famille, sous-pages en ONGLETS de page,
famille active sur tous ses descendants) :

| Rail V2 | Routes rattachées |
| --- | --- |
| Accueil | `/dashboard` (onglets Accueil · Analytics `?vue=analytics`), `/analytics` |
| Veille | `/veille`, `/veille/scale`, `/saved`, `/veille/formats`, `/tags`, `/radar` |
| Studios | `/studio/projets`, `/studio/projets/nouveau`, `/studio/projets/[id]` et ses modes (`image`, `video`, `textes`, `produit`, `identites`, `export`) |
| Bibliothèque | `/assets` |
| Résultats | `/adsmap`, `/adsmap/suites`, `/adsmap/lots`, `/adsmap/tri`, `/adsmap/protocole`, `/adsmap/import`, `/adsmap/radar` |
| Jarvis | `/jarvis`, `/jarvis/sources` (`/adsmap/jarvis` redirige) |
| Votre espace · Marques | `/brands`, `/brands/new`, `/brands/[id]`, `/brands/[id]/competitors/[name]` (admin d'espace, inchangé) |
| Votre espace · Réglages | `/settings`, `/team`, `/connections`, `/usage`, `/billing`, `/profile` (admin d'espace pour les pages « Espace », inchangé) |
| Administration (équipe plateforme) | `/admin` et ses 12 sous-pages, `/console`, `/credits` |
| Aide | `/support`, `/support/[id]` |

Hors refonte : `/login`, `/signup`, `/forgot`, `/reset`, `/invite`, `/onboarding`, pages légales et publiques.

## 2. Coquille · ce qui existe déjà

- Rail 184 px / 64 px (`lib/chrome-coquille.ts`), préférence mémorisée par COOKIE lu côté serveur
  (aucun saut au premier rendu), bouton près du logo avec `aria-expanded`.
- Tiroir mobile indépendant : voile, Échap, focus piégé puis rendu au déclencheur, fermeture après navigation.
- Palette ⌘K filtrée par les droits (`commandesOuvertes`), fil d'Ariane depuis `lib/navigation.ts`.

Écarts avec la maquette (lot 1) : rail en trois groupes « Observer / Créer / Tester » avec sous-entrées
dépliables au lieu d'une liste plate + « Votre espace » ; libellés « Assets » et « Adsmap » au lieu de
« Bibliothèque » et « Résultats » ; pas d'infobulle nommée en rail réduit ; pas de raccourci Alt B ;
Marques et Réglages seulement dans le menu de compte.

## 3. Projet · moteur réel vs maquette

| Maquette | État réel | Lot |
| --- | --- | --- |
| Calques, sélection, visibilité, verrouillage, duplication, ordre, propriétés | RÉEL (`core/studios/calques/operations.ts`, `EditeurCalques`) | 2 (présentation) |
| Annuler / rétablir | RÉEL, 100 étapes, séparé des versions (`calques/historique.ts`) | 2 |
| Versions | RÉEL : chaque enregistrement crée une version immuable, conflit 409 avec diff ; lecture d'une version (`?version=`) | 2 · restauration non destructive à vérifier/ajouter |
| Autosauvegarde et récupération | PARTIEL : copie de secours LOCALE et restauration ; l'enregistrement serveur est explicite | 2 · à décider (autosave serveur = une version par sauvegarde) |
| Zoom à point fixe, cadrer la sélection, déplacement de la vue | ABSENT | 2 |
| Mode focus, Jarvis masquable | ABSENT | 2 |
| Modes Image / Vidéo / Textes, Produit & identité | RÉEL en pages séparées (`/image`, `/video`, `/textes`, `/produit`, `/identites`, `/export`) | 2 (en-tête de projet commun) |
| Génération avec devis | RÉEL : devis serveur, approbation séparée, budget réel, plafonds | — (inchangé) |
| Vidéo : storyboard, images clés, clips, vidéo finale MP4 | RÉEL (#777, #778) | — |
| Vidéo : voix, lipsync | ABSENT · aucun fournisseur validé | hors lot (décision fournisseur) |
| Vidéo : texte écran et sous-titres incrustés | ABSENT · faisable ffmpeg, 0 $ | à planifier |
| Textes : variantes, retenir, appliquer au calque | RÉEL (`core/studios/textes`) | 2 (présentation) |
| Variantes, rattachement à un test Adsmap, apprentissage, itération | RÉEL (`lib/studios/variantes`) | 2/3 (rendre visible) |
| Export image, brief, vidéo finale | RÉEL | — |

## 4. Capacités retirées avec les anciens studios (#779) · à restaurer DANS les projets

| Capacité | Moteur restant | Plan |
| --- | --- | --- |
| Téléversement manuel d'une photo produit | Aucun (action retirée) · colonnes `products.image_url(s)` intactes | Lot 3 · priorité 1 |
| Lots d'essai (accroche, mise en page, univers) | Noyau `essai.ts` (pur) · Adsmap lots | Lot 3 · à brancher sur les variantes de projet |
| Suivi d'une créa dans Adsmap | RÉEL côté projet (`rattacherVarianteAuTest`) | Lot 2/3 · le rendre visible |
| Score Jarvis d'une pub | `packages/ai` (`scoreCreative`) · appel payant | Lot 3 · inventaire, devis requis |
| Relecture automatique d'une pub entière | `packages/ai` (`controlePubEntiere`) · appel payant | Lot 3 · inventaire, devis requis |
| Clone avec choix du moteur | Fournisseur image des Studios (sélection de moteur) | Lot 3 · inventaire |
| Scènes enregistrées (presets) | Table `creative_presets` intacte | Lot 3 · inventaire |

## 5. Médias

`/api/studios/media/:id` ne sert pas les requêtes partielles (`Range`) : Safari et iPhone peuvent refuser
de lire les clips et la vidéo finale. Lot 4.

## 6. Banc local de recette

Postgres 16 local, 57 migrations appliquées une à une, comptes de test (propriétaire, membre, client
lecteur), Next en production locale, captures Playwright 1440 / 1280 / 390 × 720. Les captures sont
marquées « local, données de test » ; elles ne remplacent pas la recette en production.
