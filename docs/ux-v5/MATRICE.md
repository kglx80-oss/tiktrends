# UX V5 · matrice de raccordement

> **V5 retirée · 29/10/2026.** L'interface V5 décrite ici n'existe plus · l'ancienne
> interface (groupe `app/(app)`, coquille `AppShell`, bascule `?ui=v5`) a été
> retirée par #941, après le portage écran par écran vers Spatial (#865 à #937).
> La référence vivante est `docs/spatial/` (`README.md` pour l'architecture et la
> méthode, `MATRICE.md` pour écran → adresse → vue).

> **Recalé sur main 18c45d9, 2026-11-08.** Chaque ligne des quatre inventaires qui
> n'était pas « raccordé » a été revérifiée sur le code de `main` à `18c45d9` (#1033) :
> routes `app/(spatial)/sp/…`, vues `apps/web/spatial/vues/…`, actions, noyau,
> migrations. Son statut est mis à jour et la preuve courte est ajoutée en fin de
> note, marquée **18c45d9** (avec « était « … » » quand le statut a changé). Dans ces
> preuves, `W/` = `product/apps/web` et `C/` = `product/packages/core/src`, quelle
> que soit l'abréviation du reste de l'inventaire. Les lignes déjà « raccordé » avant
> le recalage n'ont **pas** été revérifiées (voir « Limites du recalage »).
>
> Ce recalage est une photographie datée, pas un état courant. Pour le refaire :
> relire chaque ligne non « raccordé » sur `main`, mettre à jour statut et preuve,
> puis recompter avec `node docs/ux-v5/compter-statuts.mjs` (tableau ci-dessous) et
> `node docs/ux-v5/compter-statuts.mjs --reste` (identifiants à faire, par zone).
> Ne jamais recopier un comptage à la main.

Référence d'origine : prototype V5.15 de Kevin du 14/10/2026 (dossier « TikTrends-V5-Dossier-Claude-Code-14oct », 64 fichiers, empreintes du manifeste vérifiées). Inventaire d'origine : `main` à `394ed04`, plus les dix PR UX V2 alors ouvertes (#782 à #791, toutes fusionnées depuis).

Cette page dit, pour chaque vue de la V5, ce qui existe réellement, ce qui manque et ce qui attend une décision. Le détail contrôle par contrôle (libellé exact, fichier:ligne, garde serveur, persistance, coût) vit dans les quatre inventaires :

| Zone | Fichier | Lignes |
| --- | --- | --- |
| Coquille, profil, Accueil, Studios, Réglages | [inventaire-coquille-accueil.md](inventaire-coquille-accueil.md) | 152 |
| Veille, Bibliothèque, Marques, personas | [inventaire-veille-biblio-marques.md](inventaire-veille-biblio-marques.md) | 213 |
| Projets, assistant, canvas, devis, export | [inventaire-projets-canvas.md](inventaire-projets-canvas.md) | 160 |
| Résultats, Jarvis, ADMIN+ | [inventaire-resultats-jarvis-admin.md](inventaire-resultats-jarvis-admin.md) | 140 |

## Statuts

- **raccordé** : la fonction existe sur `main`, servie par Spatial, avec le même rôle.
- **raccordé PR #n** : la fonction n'existe que dans une PR ouverte. Il n'en reste aucun · les dix PR UX V2 sont fusionnées.
- **partiel** : la fonction existe, mais diffère de la V5 (la note dit en quoi).
- **à créer** : rien d'équivalent dans le code.
- **décision Kevin** : offre, prix, crédits par action, Stripe, nouveau connecteur publicitaire, Drive étendu, nouvelle dépense IA, nouveaux droits. Rien n'est codé sans son accord écrit. Un statut mixte qui contient « décision Kevin » compte ici. Le recalage n'a requalifié aucune de ces lignes, même quand du code existe (la note le dit alors).
- **caduc** : présentation propre au prototype V5 que la maquette Spatial (mandat Kevin du 27/10) a remplacée sans équivalent, ou geste contraire au modèle (canvas dérivé). Rien à porter sans nouvelle demande. L'ancien « ne pas porter » compte ici.

## Comptage

Recalé sur main 18c45d9, 2026-11-08, puis lot 2 (itérer en choisissant la variable), lot 1 (hypothèses libres), lot 3 (conclure un lot), les boucles d'hypothèse (A04, F26) et lot 4 (mesures) · sortie de `node docs/ux-v5/compter-statuts.mjs`

| Zone | raccordé | raccordé PR | partiel | à créer | décision Kevin | caduc | lignes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Coquille et Accueil | 105 | 0 | 14 | 12 | 9 | 12 | 152 |
| Veille, Bibliothèque, Marques | 99 | 0 | 64 | 29 | 18 | 3 | 213 |
| Projets et canvas | 98 | 0 | 39 | 13 | 4 | 6 | 160 |
| Résultats, Jarvis, ADMIN+ | 73 | 0 | 33 | 13 | 20 | 1 | 140 |
| **Total** | **375** | **0** | **150** | **67** | **51** | **22** | **665** |

Avant le recalage, le même script sur les inventaires d'origine donnait 192 · 21 · 243 · 157 · 51 · 1 (665 lignes). L'ancien tableau, compté à la main, disait 184 · 22 · 243 · 164 · 51 (664) · l'écart vient surtout de la Veille (41 « raccordé » réels contre 33 écrits).

Ce que le recalage a changé, sur 475 lignes relues · 211 statuts requalifiés :

| De | Vers | Lignes |
| --- | --- | --- |
| partiel | raccordé | 89 |
| à créer | raccordé | 59 |
| à créer | partiel | 23 |
| raccordé PR | raccordé | 16 |
| partiel | caduc | 12 |
| à créer | caduc | 5 |
| raccordé PR | caduc | 4 (dont CA R33 · mode focus, retiré avec la V5) |
| partiel | à créer | 2 (PC C15 · filtres des créations, PC D16 · raccourcis, disparus avec la V5) |
| raccordé PR | partiel | 1 |

Les 264 autres gardent leur statut, avec une preuve ajoutée.

## Reste à faire sans décision Kevin

Les contrôles encore « à créer » ou « partiel » qui ne dépendent d'aucune décision Kevin (offre, prix, crédits, Stripe, nouveau connecteur, Drive étendu, nouvelle dépense IA, nouveaux droits), regroupés en lots livrables · un lot = une PR plausible, partie de `main`, avec les quatre portes. Les identifiants sont préfixés par zone · **CA** coquille et Accueil, **VB** Veille, Bibliothèque, Marques, **PC** projets et canvas, **RJ** Résultats, Jarvis, ADMIN+.

Classement par impact sur le cap produit (« créer des créatives winneuses… gérer les hypothèses, les itérations… trouver plus vite de nouvelles winneuses »). Chaque lot est à **0 $** de dépense IA · il ne lance aucun nouvel appel payant. Le lot 5 réutilise le message Jarvis existant, à son prix déjà annoncé · si Kevin juge qu'un contexte plus riche est une nouvelle dépense, ce lot passe chez lui. Les migrations dites « oui » sont additives (table ou colonne nouvelle, rien de supprimé).

| # | Lot | Taille | Migration | Dépense IA |
| --- | --- | --- | --- | --- |
| 1 | Hypothèses libres, reliées aux apprentissages et à la Veille | M | non (oui, additive, pour la priorité) | 0 $ |
| 2 | Itérer en choisissant la variable | M | non | 0 $ |
| 3 | Conclure un lot entier et réutiliser l'apprentissage | M | non | 0 $ |
| 4 | Mesures · import CSV et remontée Meta planifiée | L | oui (additive, 0069) | 0 $ |
| 5 | Jarvis en contexte (lot, hypothèse, page, projet) | M | non | 0 $ (message existant) |
| 6 | Veille · tags, notes et pop-up « Sauvegarder » | L | oui (additive) | 0 $ |
| 7 | Veille · filtres locaux, vue liste, navigation du détail | M | non | 0 $ |
| 8 | Studios · créations filtrables, contrôle humain, projets renommés et dupliqués | M | non | 0 $ |
| 9 | Marque · personas éditables et reliés aux tests | M | oui (additive) | 0 $ |
| 10 | Projet · activité, journal et commentaires | M | oui (additive, commentaires) | 0 $ |
| 11 | Canvas de lignée · groupes de lot, légende, notes, mini-carte | M | oui (additive, notes) | 0 $ |
| 12 | Bibliothèque · aperçu complet, tags à la main, références au brief | M | oui (additive, optionnelle) | 0 $ |
| 13 | Coquille · raccourcis clavier et aide | S | non | 0 $ |
| 14 | Tour de contrôle · recherche, exports, segments, incidents | M | oui (additive, incidents) | 0 $ |

### 1 · Hypothèses libres, reliées aux apprentissages et à la Veille · M

Aujourd'hui une hypothèse n'existe que portée par une ad, et « Nouvelle hypothèse » renvoie aux suites d'un test arbitré. Le lot laisse écrire une hypothèse à partir de rien, d'un apprentissage, d'une pub de la Veille ou d'une accroche de persona, et la range dans « À formuler ».

- **Lignes** : RJ H01, H04, H05, H07 · RJ A04 · VB F25, P13.
- **Vues** : `resultats/Hypotheses.tsx`, `resultats/Apprentissages.tsx`, détail de la Veille (`veille/client.tsx`), fiche persona (`marque/personas-client.tsx`).
- **Services à réutiliser** : `trackSavedAdAction` (`W/app/actions/adsmap-bridge.ts:34`, qui crée déjà un concept en brouillon), `createIterationAction` (`W/app/actions/adsmap-iterate.ts:221`), la règle `cartesHypotheses` (`C/spatial/resultats/ecrans.ts`), tables `adsmap_concepts` et `adsmap_ads` (`hypothesis`, `tested_variable`, statut `draft`).
- **Migration** : non si l'hypothèse est une ad brouillon de concept. Oui, additive, seulement pour la priorité « impact, confiance, effort » (H07).
- **Règle au noyau** : la phrase « si… alors… parce que » et sa complétude, testées en pur.

### 2 · Itérer en choisissant la variable · M

« Nouvelle itération » impose la variable du plan. Le lot laisse choisir parmi les variables admises (une seule à la fois), depuis l'écran Itérer, une pub de la Veille, un prompt conseillé ou un nœud du canvas.

- **Lignes** : CA G16, G17, S04 · RJ IT02, IT03, IT05, R06 · VB F26 · PC E27, E28.
- **Vues** : `studios/Iterer.tsx`, `studios/Prompts.tsx`, `projet/Projet.tsx` (couloir Itération), `resultats/Hypotheses.tsx` et `Lots.tsx` (bouton de boucle).
- **Services à réutiliser** : `iterationPlanAction` (`W/app/actions/adsmap-iterate.ts:70`), `createIterationAction` (mode, variable, valeur, hypothèse), `choixIterationSpatial` (`C/spatial/studios/iterer.ts`), la préparation du projet et son devis serveur (inchangés).
- **Migration** : non.
- **Livré** : la règle des variables admises (`C/spatial/studios/iterer-variable.ts`, rejouée au serveur par `creerIterationChoisieAction`), l'étape « Ce qu'on change » de l'écran Itérer, « Lancer comme itération » des prompts, le nœud « À décliner » du couloir Itération, le bouton de boucle de Lots. **Reste** : VB F26 (depuis une pub de la Veille), la boucle sur Hypothèses (lot 1) et sur Apprentissages (lot 3).

### 3 · Conclure un lot entier et réutiliser l'apprentissage · M

La conclusion se fait variante par variante. Le lot ajoute la conclusion du lot (confirmée, infirmée, non concluante) au-dessus des verdicts du moteur, la duplication d'un lot, l'écart à la référence sur l'Accueil, et le passage d'un apprentissage validé vers les règles de la marque.

- **Lignes** : RJ L03, L06, L09, A01, A03, A05, A06, A08 · CA G09.
- **Vues** : `resultats/Lot.tsx`, `resultats/ActionsLot.tsx`, `resultats/Apprentissages.tsx`, `accueil/Accueil.tsx` (« Quoi itérer »), `marque/regles-client.tsx`.
- **Services à réutiliser** : `validateVerdictAction` (`W/app/actions/adsmap-verdict.ts:228`), `createBatchAction` et `setBatchAdAction` (`W/app/actions/adsmap-batch.ts:257`, `:277`), `saveJarvisRulesAction` (`W/app/actions/jarvis.ts:29`), `indicateursGagnante` (`C/spatial/accueil/accueil.ts:371`).
- **Migration** : non. « À retester » (A01) se calcule ou se tait.
- **Règle au noyau** : la conclusion d'un lot à partir des verdicts, avec effectif minimum et intervalle qui doit exclure la référence (doctrine « comparer à la référence »). Le silence reste une conclusion valable. « Lancer quand même » (L03) ne se code qu'avec sa règle écrite.
- **Livré** : `conclusionLot` (`C/spatial/resultats/conclusion-lot.ts` · 4 variantes tranchées, 4 verdicts de référence, Wilson 0,9, l'intervalle du lot doit exclure celui des autres lots · seuils mesurés, tableau dans le module), « Dupliquer le lot » (`duplicateBatchAction`), écart au reste du lot sur l'Accueil (`ecartAuLot`), « Ajouter aux règles de la marque » (`apprentissageVersReglesAction` → `saveJarvisRulesAction`), filtres d'état, « Rejeter », tiroir de l'apprentissage. Restent L03 (pas de règle écrite) et A04 (lot 1).

### 4 · Mesures · import CSV et remontée Meta planifiée · L

L'import reprend le tableau historique, pas des mesures. Sans connexion Meta, aucun lot ne se conclut. Le lot importe les mesures d'un export Ads Manager (CSV), rattache les lignes aux lots, et planifie la remontée Meta.

- **Lignes** : RJ R01, L05, I04, I06 · CA K12, K13, K14.
- **Vues** : `resultats/Importer.tsx`, `reglages/Connexions.tsx` et `interactifs.tsx` (Meta).
- **Services à réutiliser** : `previewImportAction` / `applyImportAction` (`W/app/actions/adsmap-import.ts:45`, `:90`), `guideColonnes` (`C/adsmap/import-sheet.ts:405`), `syncAdsMapAction` (`W/app/actions/adsmap.ts:284`), `apps/workers` (synchro).
- **Migration** : probable, additive · `metrics_daily` dépend des instances synchronisées (`ad_instances`) ; une source « CSV » se pose à côté, sans rien changer à la synchro.
- **Dépense** : aucune · ni IA, ni nouveau connecteur (Meta existe ; TikTok et Google restent à Kevin).
- **Livré** : l'import des mesures d'un export Ads Manager (`previewMesuresAction` / `applyMesuresAction`, `W/app/actions/adsmap-mesures.ts`) · intitulés français et anglais construits d'après la documentation publique (aucun export réel relu · à vérifier sur un vrai fichier), rattachement par identifiant Meta épinglé puis nom régie, propositions approchées à confirmer (seuil `MIN_JETONS_APPROCHE` mesuré), ambiguës jamais écrites, marque bornée (`C/adsmap/mesures-csv.ts`) · table `adsmap_mesures_csv` à côté de `metrics_daily` (0069, clé ad · début · fin, réimport sans doublon) · priorité · la journée de la connexion Meta l'emporte (`retenirMesures`, dite à l'écran) · verdicts des lots recalculés par les mêmes briques que la synchro (`verdictsDesMesures`, `C/adsmap/mesures-verdicts.ts`) · remontée planifiée · la tâche du worker existante (`adsmap-sync`, motif partagé `MOTIF_REMONTEE_ADSMAP`), journal `adsmap_remontees`, état sur la carte Meta de Connexions (dernière, prochaine, erreur en mots) et réglage actif ou suspendu. **Reste** : un assistant de connexion en étapes (CA K12), une fréquence libre et une alerte de lot (CA K14), les exports TikTok et Google (RJ I04, à Kevin).

### 5 · Jarvis en contexte (lot, hypothèse, page, projet) · M

Les liens « Suggérer avec Jarvis » ouvrent `/jarvis` sans contexte. Le lot transmet à la route le lot, l'hypothèse ou le projet ouvert, comme `/jarvis/veille` le fait déjà pour une annonce, et prépare la question sans l'envoyer.

- **Lignes** : RJ R03, H06, G03, G04, G05, G07, J03, J12 · PC E29, E32, E35, E38.
- **Vues** : `coquille/TiroirJarvis.tsx`, `jarvis/Jarvis.tsx`, `projet/PanneauJarvis.tsx`, `resultats/Hypotheses.tsx`, `resultats/Lot.tsx`.
- **Services à réutiliser** : la route `/api/jarvis/chat` (barrière de dépense, coût annoncé avant l'envoi), le passage de source de `jarvis/JarvisVeille.tsx`, `contexteSelonPuces` (puce « Fiche marque »), `draftConceptAction`.
- **Migration** : non.
- **Dépense** : 0 $ à la livraison · chaque envoi reste le message Jarvis existant, au prix déjà affiché. Exclus : les suggestions « Sur cette page » (CA J03, à Kevin) et la pièce jointe au modèle (RJ J02, voir « Hors lots »).

### 6 · Veille · tags, notes et pop-up « Sauvegarder » · L

Le signet sauvegarde d'un coup, une sauvegarde n'a qu'une collection, la note existe en base sans écran, et `/tags` est un état vide.

- **Lignes** : VB TG01 à TG04, V20, C09, F15, S01, S02, S03, S06, S07, S08, S10, SV01, SV04, SV06, SV08.
- **Vues** : `veille/client.tsx` (`IconeSauvegarde`), `veille/sauvegardes-client.tsx`, `reglages/Tagging.tsx`.
- **Services à réutiliser** : `setSavedAdFolder` (`W/app/actions/inspo.ts:131`), `saved_ads.note` (déjà en base), `provenanceSauvegarde`, les règles de tags de couleur de la Bibliothèque (`C/spatial/bibliotheque/tags-couleur.ts`) comme modèle.
- **Migration** : oui, additive · table des tags et liaison aux sauvegardes, liaison sauvegarde ↔ collections pour en porter plusieurs. La note n'en demande pas.

### 7 · Veille · filtres locaux, vue liste, navigation du détail · M

- **Lignes** : VB V19, V21, V26, V28, C02, C10, C12, F16, F22, F28, SC05, RD01, FO07.
- **Vues** : `veille/client.tsx` (`BarreVeille`, `CarteVeille`, `DetailVeille`), `veille/PubsDuMoment.tsx`, `veille/scale-client.tsx`, `veille/Radar.tsx`, `formats/PageFormat.tsx`.
- **Services à réutiliser** : `C/spatial/veille/recherche.ts` (filtres), `W/app/(spatial)/sp/veille/cartes.ts` (CTA, plateforme déjà lus), `followBrand` (`W/app/actions/inspo.ts:159`).
- **Migration** : non.
- **Garde-fou** : un filtre local ne s'affiche que s'il filtre vraiment la page lue, et le dit (la source pagine) · règle R14 de l'inventaire. Export Word ou PDF du texte en local · Google Docs exclu (Drive étendu, à Kevin).

### 8 · Studios · créations filtrables, contrôle humain, projets renommés et dupliqués · M

- **Lignes** : PC C15, F6, F7, D12, C5, C12, B6, B11, B19, B23 · CA S10, S06, S08, G26.
- **Vues** : `projet/OngletCreations.tsx`, `projet/Export.tsx`, `studios/assistant/FormatDevis.tsx`, `studios/assistant/Direction.tsx`, `studios/GrilleProjets.tsx`.
- **Services à réutiliser** : `exporterVersion` et son contrôle avant export, `preparerLotFormats` / `preparerLotImages`, `creerProjet` et `enregistrerDocument` (`W/app/actions/studios/projets.ts:47`, `:58`) pour dupliquer, la palette de la marque.
- **Migration** : non (renommer touche `studio_projects.title`). « En revue » (S06) demanderait une valeur de statut · à laisser hors du lot ou en migration additive séparée.
- **Garde-fou** : la jauge de budget (B23) lit le solde, elle ne touche ni prix ni crédits.

### 9 · Marque · personas éditables et reliés aux tests · M

- **Lignes** : VB P05, P06, P08, P09, P11, P12, M02, M07, PR04, K03, K04.
- **Vues** : `marque/personas-client.tsx`, `marque/Personas.tsx`, `marque/Offre.tsx`, `marque/ListeMarques.tsx`, `veille/Concurrents.tsx`.
- **Services à réutiliser** : `addPersonaAction` / `deletePersonaAction` (`W/app/actions/brand-detail.ts:181`, `:194`), la chaîne désirs, angles, annonces (`W/app/actions/adsmap-attribution.ts:60`), `lienNouveauProjet` (persona présélectionné), `completudeFicheMarque`.
- **Migration** : oui, additive · rang et segment du persona, table des offres et allégations (M07, PR04), lien concurrents de la fiche ↔ marques suivies (K03, K04).
- **Point d'attention** : les personas de la marque (`personas`) et les personas Adsmap du brief ne sont pas la même table · le lot doit dire lequel il relie, sans fusion silencieuse.

### 10 · Projet · activité, journal et commentaires · M

- **Lignes** : PC D13, D15, F9, F14, F15, F16 · RJ AC01.
- **Vues** : `projet/Projet.tsx` (nouvel onglet ou tuile), `projet/OngletCreations.tsx`.
- **Services à réutiliser** : `studio_audit_events` (déjà écrit, sans écran), `C/spatial/projet/taches.ts`, l'historique des versions.
- **Migration** : non pour l'activité et le journal · oui, additive, pour les commentaires (D15).

### 11 · Canvas de lignée · groupes de lot, légende, notes, mini-carte · M

- **Lignes** : PC E11, E12, E16, E22, E10.
- **Vues** : `projet/Projet.tsx` (couloirs), `projet/CanvasLibre.tsx`.
- **Services à réutiliser** : `projeterLignee` et `C/spatial/projet/noeuds.ts`, les catégories de liens (`C/studios/canvas/lignee.ts:166`), `enregistrerDispositionCanvas`.
- **Migration** : oui, additive, seulement pour les notes (E11). Les groupes, la légende et la mini-carte se calculent.
- **Garde-fou** : aucun nœud libre, aucun lien tracé à la main (lignes E14, E19, E25 caduques).

### 12 · Bibliothèque · aperçu complet, tags à la main, références au brief · M

- **Lignes** : VB L20, L23, L25, L26, L30, L31, L39, L42, L49, L54 · PC A19, A21, F3.
- **Vues** : `bibliotheque/Bibliotheque.tsx` (aperçu, import), `projet/Produit.tsx`, `studios/NouveauProjet.tsx` (références).
- **Services à réutiliser** : `definirDroitsAssetAction` / `definirDroitsAssetsAction`, `renommerAssetAction` (`W/app/actions/assets.ts:379`), `verserSelectionDansProjet`, `associerReference`, la synchro Shopify existante de la Marque.
- **Migration** : optionnelle, additive · dimensions d'un fichier (L30, sinon lues à l'affichage), droits par défaut de la synchro Drive (L49).
- **Dépense** : l'édition manuelle des tags (L31) n'appelle pas `tagAssetAction`, qui reste l'analyse payante au prix affiché.

### 13 · Coquille · raccourcis clavier et aide · S

- **Lignes** : CA R04, H04, H06, H07, J02, G29, P14, X01, X03, G24, T02 · RJ G02 · PC D16.
- **Vues** : `coquille/Coquille.tsx` (écouteur clavier, à côté de ⌘K), `reglages/Support.tsx`, `reglages/Profil.tsx`, `accueil/interactifs.tsx`, `reglages/Equipe.tsx`.
- **Services à réutiliser** : `groupesPalette` (`C/spatial/coquille/palette.ts`), le cookie du rail, la matrice `roleVoitRubrique` en lecture.
- **Migration** : non.
- **Garde-fou** : aucune touche ne part dans un champ de saisie · J reste au tiroir Jarvis. Les liens d'aide demandent du contenu à écrire (X01). Hors maquette Spatial · à confirmer comme demande, sans être une décision de la liste Kevin.

### 14 · Tour de contrôle · recherche, exports, segments, incidents · M

- **Lignes** : RJ PR02, F01, F02, U01 (export seul), U02, IN01, IN02, AD03, AU01, AR06, JB01, JB03, E02, K03, K04, CO01, PE02, PE04, RL01.
- **Vues** : `admin/Prompts.tsx`, `admin/Revenus.tsx`, `admin/Comptes.tsx`, `admin/Incidents.tsx`, `admin/Droits.tsx`, `admin/Couts.tsx`, `admin/Registre.tsx`, `admin/connaissances-client.tsx`.
- **Services à réutiliser** : les lectures existantes du Tour de contrôle (`W/app/(spatial)/sp/admin/…/donnees.ts`), la neutralisation des formules des exports CSV (#1017), `error_log`, `studio_audit_events` de portée plateforme.
- **Migration** : oui, additive, pour les incidents déclarés et leur statut (IN01, IN02) · non pour le reste.
- **Exclus** : « Inviter un membre » dans un autre espace (U01) et le sélecteur d'espace (CA A03, RJ X05) touchent aux droits · à Kevin.

### Hors lots

Encore « à créer » ou « partiel », mais rattachés à une décision Kevin malgré leur statut, ou impossibles sans nouvelle source :

- **Nouveau connecteur ou Drive étendu** : CA K08 (GA4), K11 (Slack), K09 (plusieurs dossiers Drive) · VB F22 pour Google Docs.
- **Stripe** : CA R20 (date de renouvellement, stockée mais à afficher depuis Stripe), B02 (factures listées dans l'app).
- **Nouvelle dépense IA ou fournisseur** : VB F13, F21 (transcription), F14 (analyse à l'ouverture), F17 (alertes de suivi, coût fournisseur récurrent), C10 pour la transcription · RJ A07, L08 (résumé et analyse Jarvis automatiques) · RJ J02, PC E41 (pièce jointe au modèle) · PC B27 (traduction des sous-titres), C16 et E13 (score, voir B22).
- **Nouveaux droits** : CA A03, RJ X05 (portée d'espace), RJ GP03 (niveaux par module), PC F11, F12 (traçabilité ouverte au client).
- **Persona obligatoire** : PC A12 (règle produit, liée à VB P17).
- **La source ne le donne pas** : VB V06 à V10, V14 à V18, C03, C07, C08, F05 à F08, F11, F18, SC02, SC04, K01 (ratio, durée, variantes, dates de vue, accroche distincte, plusieurs plateformes ou pays par requête).
- **À instruire avant de chiffrer** : CA P13 (autres langues de l'interface), PC B26 (choix de musique, droits d'usage), B28 (transitions de la vidéo finale), B30 (nouveaux types de texte, nouvelle version de consigne au registre), B12 et RJ S03, RL03 (montrer la release ou la consigne compilée au client), PC A10, A22 (brouillon d'assistant), B34 (variantes régionales de langue), C7, C13, C14, D17, D22, E36, F4, F13 · VB FO06, FO08, FO09, SR01, M01, M04, M05, M08, M11, M14, M15, PR03, PR05 · RJ AR02, GP01, IN03, J08.

## Limites du recalage

- **Les lignes « raccordé » d'origine n'ont pas été revérifiées.** Certaines ne le sont plus · par exemple CA R05 (Alt B) et la mention « Alt B » de R03 · la coquille Spatial n'écoute plus que ⌘K et Échap (`W/spatial/coquille/Coquille.tsx:204`). Leurs chemins (`AppShell`, `components/…`) désignent du code retiré. Un prochain recalage devrait les relire aussi.
- **Lignes douteuses**, tranchées au mieux et à confirmer sur l'écran : CA S06 (filtres par étape au lieu du statut de la maquette), CA G24 et G26, VB SV04 (collection vide non persistée), VB FO02 (28 styles Spatial au lieu des 16 formats V5, tenu pour raccordé), VB C06 et F02 (sans jauge), VB M13, M16, RJ X03 (sous-navigation tenue pour équivalente à l'accordéon), RJ AD01, RJ J04, PC D10.
- **« caduc » est un jugement de ce recalage** · il s'appuie sur la maquette Spatial, qui fait foi depuis le 27/10. Un contrôle caduc qui redeviendrait utile repasse « à créer ».

---

## Historique · inventaire du 14/10/2026 (`394ed04`)

Ce qui suit est l'analyse d'origine, gardée telle quelle. Ses chemins (`app/(app)/…`, `components/…`) ne désignent plus forcément du code présent.

Un contrôle « raccordé » n'était pas livré : il le serait quand la vue V5 serait portée, rendue, testée et observée sur OVH. La V5 a été remplacée par Spatial avant ce portage.

### Correspondance V5 et routes réelles

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

### Constats sur le prototype

- `#flow` n'est pas une route : c'est l'identifiant du bloc canvas, monté seulement dans `#project` avec l'onglet Canvas et le mode Image. Une ouverture directe de `#flow` donne une page vide. Dans l'application, le canvas est l'onglet d'un projet existant (`/studio/projets/[id]`) et s'ouvre toujours avec son projet.
- `v5-new.js` (routes `#new-strategie` à `#new-resultats`) n'est pas chargé par `index.html`. Le parcours réel du prototype est la modale `studioWizard` de `v5-wizard.js`, complétée par `v5-r12.js` (persona obligatoire). C'est elle qui fait référence.
- Dans la dernière couche, la bascule clair / sombre est dans la pop-up profil, pas dans l'en-tête.
- L'orbe Jarvis occupe le coin bas droit, où se trouve aujourd'hui la bulle Support. La cloche des notifications, absente du prototype, est à garder.
- Le thème sombre de la V5 reprend les fonds de `main` (`#120810`, `#1c121b`, `#0d070c`). L'accent passe du dégradé `#fe2c55 → #ff2d8f` à un rose plein `#ff5c8a`.

### Écarts structurants

1. **Thème clair et ADMIN+ bleu nuit / menthe.** `main` n'a que des tokens sombres et environ 886 couleurs écrites en dur dans 175 fichiers d'interface. Il faut des tokens sémantiques, une préférence lue au rendu serveur (cookie, sans flash), puis passer chaque littéral en token, avec une garde qui refuse tout nouveau littéral.
2. **Canvas de lignée.** Le canvas réel montre la chaîne de production d'une version (cartes dérivées, liens calculés, positions seules enregistrées). Le canvas V5 montre la lignée marketing : brief, références, hypothèse, direction, créations, résultat, apprentissage, itération. Ces données existent déjà (`studio_project_versions.parentId`, `studio_variants`, `studio_test_links`, verdicts Adsmap, `sourceRefs`, `brief.hypothesisId`). La voie retenue est une projection en lecture seule calculée dans `packages/core`, dont chaque nœud appelle les commandes existantes (`iterer`, `creerDevis`, `rattacherVarianteAuTest`, `proposerPatch`). Aucun second moteur, aucun lien dessiné qui se ferait passer pour une dépendance.
3. **Assistant « Nouveau projet » en étapes et brief structuré.** Aujourd'hui, un projet naît vide en deux champs. La V5 demande persona, objectif, plateformes, angle, concept dans le brief : extension de `BriefCanonique` (jsonb, sans migration), du contrat `brief.build` et du lien vers les personas et angles Adsmap.
4. **Panneau Jarvis global** (orbe, touche J hors saisie, contexte de page). Jarvis existe en page pleine et dans les projets. Un panneau partout réutilise la même route et le même fil ; toute tâche contextuelle nouvelle qui coûte passe par une release et un devis.
5. **Veille et Bibliothèque.** Il manque en base : dossiers de bibliothèque, collections multiples et tags de sauvegarde, recherches enregistrées et alertes, personas détaillés. Chacun est une migration.
6. **Boucle Hypothèse, Lot, Apprentissage.** Dans le réel, l'hypothèse est un texte par annonce et le verdict se rend par annonce. Le kanban d'hypothèses et la conclusion par lot demandent un modèle et des règles nouvelles au noyau.
7. **ADMIN+.** Les fonctions existent surtout sous forme de pages séparées. La V5 les range dans un espace à rail dédié. La plupart des écrans se portent sans changer de service.

### Décisions qui reviennent à Kevin

Rien de ce qui suit n'est codé tant qu'il n'a pas tranché par écrit.

- **Offre et prix** : formules du prototype (Essentiel, Pro, Agence) au lieu de Starter, Core, Plus, Business ; forfaits de recharge 500 / 1 500 / 5 000 au lieu des packs actuels ; crédits par action modifiables ; édition des offres et liens Stripe depuis ADMIN+ ; codes promo.
- **Nouvelles dépenses IA** : Score Jarvis (0 ou 2 crédits), choix du moteur avec grille par moteur, voix, contrôle de conformité de marque, scan de marque, transcription et actions IA sur une créative de Veille, analyse automatique des médias Drive, suggestions « Sur cette page » de Jarvis.
- **Nouveaux connecteurs** : TikTok Ads (pas de callback aujourd'hui), Google Ads, Snapchat, Pinterest, Dropbox, GA4 ; Drive en plusieurs dossiers avec synchronisation.
- **Sécurité et droits affichés par la V5 qui n'existent pas** : double authentification, connexion « en tant que », groupes à niveaux, portée partenaire, SSO, restriction par IP, sessions de 8 h, rotation des clés, suspension, export RGPD. Aucun écran ne les affichera avant leur implémentation.
- **Recherches enregistrées avec alertes** : appel récurrent au fournisseur de Veille, donc coût récurrent.

### Défauts trouvés pendant l'inventaire

Les deux défauts ci-dessous ont été corrigés par #796 (les actions serveur appliquent la règle d'accès de la page).

- **Bibliothèque** : les actions serveur de `app/actions/assets.ts` ne vérifient que la session, alors que la page exige le rôle membre et la formule Core. Un compte client en lecture peut supprimer ou importer un asset et lancer le tagging IA, qui consomme des crédits. Correctif en PR séparée.
- **Marques suivies** : `followBrand` et `unfollowBrand` ne vérifient que la session. Même correctif.

### Ordre des lots

Chaque lot est une PR partie de `main`, sans empilement, avec les quatre portes, un test de rendu éprouvé par mutation, des captures clair et sombre en 1440, 1280 et 390 × 720, puis la recette Codex.

1. **Socle** : A1 logos (à partir de `logos-outils.ts` et `BrandTile` existants), A2 garde du tiret cadratin, A3 modales, puis A4 tokens et thème clair (après la fusion des PR UX V2, qui touchent les mêmes fichiers).
2. **Coquille V5** : rail, pastille de crédits au solde réel, en-tête, pop-up profil avec bascule de thème, ADMIN+ en espace séparé avec rail dédié et retour créatif.
3. **Parcours complet** : Accueil (prochaines itérations sur les données Adsmap réelles), Nouveau projet en étapes, projet en onglets, devis, génération, créations, export.
4. **Canvas de lignée**, Bibliothèque, variantes et reprise des projets.
5. **Résultats, apprentissage, itération** ; ADMIN+ connecté (prompts, connaissances, coûts, incidents, accès).
6. **Interactions secondaires** et recette transversale, puis déploiement OVH et observation.

### Ce qui conditionne le calendrier

Les dix PR UX V2 (#782 à #791) touchent la coquille, l'Accueil, la Veille, les Résultats, ADMIN+ et la barre de projet, c'est-à-dire la base de la V5. Elles sont vertes, sans conflit avec `main` et entre elles (trois résolutions connues : `app/(app)/layout.tsx`, `EditeurCalques.tsx`, `packages/core/src/index.ts`). Les lots 1 (A4) à 5 partent après leur fusion.
