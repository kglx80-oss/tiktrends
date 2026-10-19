# Inventaire V5 et code réel · Veille, Bibliothèque, Marques (lecture seule)

En bref : sur environ 200 contrôles de la V5 dans ce périmètre, 25 environ sont raccordés au code tel quel. Une trentaine sont partiels. Le reste est à créer, et une vingtaine relèvent d'une décision de Kevin. Le fichier `tiktrends-prototype.html` n'a pas été lu directement : j'ai lu `proto5`, ses calques et `LIRE-MOI-V5.txt`. L'équivalence avec le fichier unique n'a pas été vérifiée.

Les trois blocs entièrement absents :
- **Dossiers de bibliothèque** : rien en base.
- **Recherches enregistrées et alertes** : rien en base.
- **Tags de Veille** : la page `/tags` actuelle ne sert pas à ça.

Le reste existe surtout sous une forme plus simple :
- une seule collection par sauvegarde ;
- une colonne `note` sans écran ;
- des personas à 4 champs ;
- un « scan » de marque payant qui ne lit que le site.

## Sources lues et abréviations

- **Prototype** : `proto5/` (`v5-veille.js` puis les calques r2, r7, r8, r12, r13, r15 ; la dernière couche gagne).
- **Code** : `origin/main` (394ed04) et les branches des PR #785, #783, #787, #786 et #791. Les PR #786 (Accueil) et #791 (essais) ne touchent pas ce périmètre, sauf « Cloner en lot de test » pour #791.
- **Chemins** :
  - W = `product/apps/web`
  - P = W/app/(app)
  - A = W/app/actions
  - C = W/components
  - K = `product/packages/core/src`
  - DB = `product/packages/db/src/schema.ts`
  - I = `product/packages/integrations/src/trendtrack.ts`
- **Gardes** :
  - gV = `gardeVeille` (session, rôle membre, offre Core ; A/inspo.ts:23)
  - gS = `gardeEcritureSauvegarde` (rôle seul, l'offre n'est pas vérifiée ; A/inspo.ts:126)
  - adm = `roleAtLeast(admin)`
  - sess = session seule, sans contrôle de rôle
  - gSrc = `gardeSources('studio.propose')` avec la capacité projets
  - Plus = `adsmapGuard` (offre Plus)

**Données de la source Veille.** L'objet `InspoAd` (I:12) contient : plateforme, statut, `daysRunning`, type de média, annonceur, `body`, `callToAction`, domaine et URL, pays, reach, dépense estimée, vues, likes. Il n'a pas de date de première ou dernière vue, de ratio, de durée, de langue, de variantes par créative, d'accroche distincte ni de tags. `liveAdsCount` est le nombre d'annonces actives de l'annonceur, pas les variantes de la créative. La langue, la portée minimale et la diffusion minimale ne sont pas transmises au fournisseur (I:~75). La règle R14 interdit d'afficher un filtre que la source ignore.

**Défaut du prototype.** Dans `tt-v5-r9.css`, la règle `.fbar{position:absolute;bottom:14px…}` du canvas s'applique aussi à la barre de filtres de la Veille. Les menus déroulants n'apparaissent donc pas dans les captures. L'intention reste bien celle de `v5-veille.js`.

## Tableau des contrôles

### Veille · Explorer (#veille)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| V01 | #veille | Onglets « Explorer · Sauvegardes · Ce qui scale · Formats · Radar · Tags » | change de vue | C/OngletsSection.tsx, W/lib/rbac.ts:67-73 | menu filtré par rôle et offre | aucune | raccordé (#781) | Libellés réels : Veille, Ce qui scale, Sauvegardes, Formats, Tagging, Radar créatif. Radar et Tags ne font pas la même chose (voir RD, TG). |
| V02 | #veille | Puces « Recherches enregistrées » (Concurrents Neva · FR 5, Hooks piscine, UGC enfants) | appliquent une recherche | aucune | aucune | aucune table | à créer | Migration : table de recherches enregistrées (espace, marque, nom, critères jsonb, alerte, dernière lecture). |
| V03 | #veille | Champ « Marque, produit, accroche, domaine… » | recherche plein texte | P/veille/page.tsx:290, C/ChampRechercheVeille.tsx | GET /veille vers `ttSearchAds`, `ttSearchTikTok`, `ttSearchGoogle` (I:93,168,239) ; page `canAccess(inspo)` | appel Trendtrack, mis en cache quelques minutes (lib/veille-search-cache) | raccordé | Le réel a en plus un sélecteur de périmètre texte, marque ou domaine (Meta seul) et bascule seul en recherche par domaine. |
| V04 | #veille | Bouton « Recherches enregistrées » (pop-up, « Gérer dans Radar », « Enregistrer la recherche actuelle ») | liste des recherches avec nombre de nouveautés | aucune | aucune | aucune | à créer | Dépend de V02. |
| V05 | #veille | Bouton « Enregistrer la recherche » (Nom, Critères, Alerte Radar Aucune / Quotidienne / Hebdomadaire, Annuler, Enregistrer) | enregistre la recherche et son alerte | aucune | modèle existant : W/app/api/cron/tracker (CRON_SECRET) | appels Trendtrack récurrents | décision Kevin | Une alerte implique une dépense fournisseur récurrente. Migration nécessaire. |
| V06 | #veille | Menu « Plateforme » (Meta, TikTok, Pinterest, Snapchat ; plusieurs choix) | filtre | P/veille/page.tsx:291 (`select p`, PLATFORMS :61) | Trendtrack | appel API | partiel | Une plateforme par requête : Meta, TikTok ou Google. Pinterest et Snapchat : décision Kevin (nouveau connecteur). |
| V07 | #veille | Menu « Format » (Image, Vidéo, Carrousel) | filtre | page.tsx:333 (`media`) | Meta et TikTok | | partiel | Pas de carrousel. Le filtre est replié dans « Filtres ». |
| V08 | #veille | Menu « Pays » (plusieurs choix) | filtre | page.tsx:335 (`country`, 11 pays, :45) | Meta et Google | | partiel | Un seul pays, et rien pour TikTok. |
| V09 | #veille | Menu « Vue depuis » (7 j, 30 j, 90 j, Toute la période) | filtre par date | aucune | aucune | | à créer | Pas de date de première vue dans `InspoAd`. Il faut vérifier si le fournisseur la donne (R14). |
| V10 | #veille | Menu « Diffusion » (≥ 7, 14, 30, 60 j) | filtre | aucun filtre ; tri `longestRunning` | `minDaysRunning` non transmis (I:~77) | | partiel | `daysRunning` est connu par annonce : un filtre local est possible, mais il fausse la pagination. |
| V11 | #veille | Menu « Langue » | filtre | page.tsx:338-341 (message « non disponibles depuis la source ») | aucune | | décision Kevin | Dépend du fournisseur. |
| V12 | #veille | Pop-up d'un filtre (« Réinitialiser », « Appliquer ») | sous-menu par filtre | `DepliableEchap` « Filtres » (page.tsx:323) | formulaire GET | | partiel | Un seul panneau replié, pas de menu par filtre. |
| V13 | #veille | « Tous les filtres » avec compteur | ouvre la pop-up de filtres | même panneau « Filtres · N actifs » | | | partiel | |
| V14 | #veille | Tous les filtres · Ratio (4:5, 9:16, 1:1) | filtre | aucune | aucune | | à créer | Le ratio n'est pas dans la source. |
| V15 | #veille | Tous les filtres · Statut (Actives / Inactives) | filtre | page.tsx:334 (`status` all ou active) | Meta seul | | partiel | Impossible de n'afficher que les inactives. |
| V16 | #veille | Tous les filtres · Vue depuis | filtre | voir V09 | | | à créer | |
| V17 | #veille | Tous les filtres · Diffusion minimale | filtre | voir V10 | | | partiel | |
| V18 | #veille | Tous les filtres · Variantes (1, 2 à 5, 6 et +) | filtre | tri « Plus dupliquées » (page.tsx:38) | | | partiel | Pas de nombre de variantes par créative. |
| V19 | #veille | Tous les filtres · Appel à l'action | filtre | aucune | `callToAction` disponible | | à créer | Filtre local possible, sans migration. |
| V20 | #veille | Tous les filtres · Tags | filtre | aucune | | | à créer | Dépend de TG. |
| V21 | #veille | Tous les filtres · « Masquer déjà sauvegardées » | filtre | `savedSet` déjà calculé (page.tsx:221) | | | à créer | Local, sans migration. |
| V22 | #veille | « Tout effacer », « Annuler », « Afficher 24 créatives » | pied de la pop-up | lien « Réinitialiser » (page.tsx:316) et bouton « Rechercher » | | | partiel | |
| V23 | #veille | Puces de filtres actifs retirables et « Tout effacer » | retire un critère | `filtresActifsVeille` (K) et liens `buildQS` | | | raccordé | |
| V24 | #veille | Compteur « 24 créatives » | décompte | « ≈ N annonce(s) · page x/y » | | | raccordé | |
| V25 | #veille | « Trier » (Diffusion la plus longue, Plus récentes, Plus de variantes) | tri | page.tsx:299 (SORTS :38 : Récentes, Plus anciennes, Scaling 7 j, Reach, Plus dupliquées) | Meta seul | | raccordé | Renommer les options et masquer les tris par reach, que la V5 refuse (ce sont des performances). |
| V26 | #veille | Bascule Grille / Liste | change l'affichage | grille seule | | | à créer | Interface seulement. |
| V27 | #veille | Grille de cartes | | page.tsx:391 `AdCard` | | | raccordé | |
| V28 | #veille | Vue liste (Créative, Plateforme, Format, Diffusion, Variantes, Vue le, Accroche, signet) | tableau | aucune | | | à créer | |
| V29 | #veille | État vide « Aucune créative ne correspond » (« Retirer … », « Tout effacer ») | | page.tsx:404 (`videRechercheVeille`, `Empty`) | | | raccordé | |
| V30 | #veille | « États de démonstration » | démo | | | | ne pas porter | Propre au prototype. |

### Carte créative (#veille, #saved, #scale)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| C01 | carte | Clic sur le visuel | ouvre la fiche en pop-up | `AdMedia` lit la vidéo dans la carte | | | à créer | Aucune fiche détaillée. |
| C02 | carte | Badge plateforme | | aucun badge | | | partiel | La plateforme est connue mais pas affichée. |
| C03 | carte | Badge format · durée · ratio | | vidéo ou image seulement | | | partiel | Durée et ratio absents de la source. |
| C04 | carte | Bouton Sauvegarder (signet, état affiché) | ouvre la pop-up de sauvegarde | C/AdCard.tsx:68, `SaveButton` (C/InspoButtons.tsx:27) | `saveAd` A/inspo.ts:37 (gV), `unsaveAd` :156 (gS) | `saved_ads` (DB:722), 0 crédit | raccordé | Le réel bascule directement, sans pop-up. |
| C05 | carte | Marque, avatar, pays | | AdCard.tsx:83-91 | | | raccordé | Pays connu pour Meta et Google seulement. |
| C06 | carte | « Active · N j » et jauge | | badge de jours sur `AdMedia`, badge « Piste forte » | | | partiel | Statut et jauge non affichés. |
| C07 | carte | « N variantes · vue le date » | | aucune | | | à créer | Pas de date ni de variantes dans la source. |
| C08 | carte | Accroche « … » | | `body` sur 2 lignes | | | partiel | Pas de champ d'accroche. |
| C09 | carte | Tags | | aucune | | | à créer | Dépend de TG. |
| C10 | carte | Actions rapides au survol : Transcrire, Scripts similaires, Analyser l'accroche | ouvrent le panneau Jarvis | aucune | `ttGetTranscript` (I:332, sans débit) | | à créer | Transcrire peut s'appuyer sur `ttGetTranscript` ; les deux autres sont une nouvelle dépense IA (décision Kevin). |
| C11 | carte | « Cloner » | Jarvis clone la créative | « Préparer une création » ou « Décline cette piste » (AdCard.tsx:136, C/studios/PreparerCreation.tsx) | `creerProjetDepuisSources` A/studios/sources.ts:74 (gSrc, Veille relue) | `studio_projects` v1, 0 crédit | partiel | Crée un projet à partir de la source, sans panneau Jarvis. |
| C12 | carte | « Actions ▾ » | menu Jarvis | aucune | | | à créer | Voir F20 à F26. |

### Fiche créative en pop-up (#veille)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| F01 | fiche | Pop-up (Échap, voile, ×) | | aucune | données de l'instantané `InspoAd` | | à créer | |
| F02 | fiche | Statut, jours, jauge | | | `status`, `daysRunning` | | à créer | Interface seulement. |
| F03 | fiche | « Sauvegarder » / « Sauvegardée » | | | `saveAd` | `saved_ads` | raccordé | Raccordé côté action. |
| F04 | fiche | Plateforme | | | disponible | | à créer | Interface seulement. |
| F05 | fiche | Format · durée · ratio | | | type seul | | partiel | |
| F06 | fiche | Pays · langue | | | pays seul | | partiel | |
| F07 | fiche | Variantes | | | | | à créer | Pas dans la source. |
| F08 | fiche | Première vue, Dernière vue | | | | | à créer | Pas dans la source. |
| F09 | fiche | Appel à l'action | | | `callToAction` | | à créer | Interface seulement. |
| F10 | fiche | Destination | | lien « Site ↗ » (AdCard.tsx:127) | | | partiel | |
| F11 | fiche | Accroche | | | `body` seul | | partiel | |
| F12 | fiche | Texte principal | | | `body` | | à créer | Interface seulement. |
| F13 | fiche | Transcription, « Transcrire avec Jarvis » | | aucune | `ttGetTranscript` (I:332), seulement si `ttTranscriptSupported` ; utilisé par W/lib/radar.ts:199 et A/market-learn.ts:149 | 0 crédit côté fournisseur | partiel | Une transcription par IA (1 crédit par minute dans le barème, K/credits.ts:8) serait une décision Kevin. |
| F14 | fiche | Analyse Jarvis (Observation, Hypothèse, angle) | | `PreparerCreation` | `proposerHypotheses` A/studios/sources.ts:56 (appel texte sous plafond de dépense, sans crédit) | | partiel | Pas d'analyse automatique à l'ouverture : décision Kevin si on la veut. |
| F15 | fiche | Tags, « + Ajouter » | | aucune | | | à créer | Migration. |
| F16 | fiche | « Précédente », « Suivante » | | aucune | | | à créer | Navigation côté client. |
| F17 | fiche | « Suivre <marque> » | ouvre la pop-up Suivre | `FollowButton` (C/InspoButtons.tsx:67, AdCard.tsx:91) | `followBrand` A/inspo.ts:169 et `unfollowBrand` :181, **session seule** | `followed_brands` (DB:735) | partiel | Sans options d'alerte. Pas de contrôle de rôle Veille sur ces deux actions. |
| F18 | fiche | « Source » | ouvre la source publique | lien Bibliothèque (AdCard.tsx:126, `bibliothequePub` dans K) | | | partiel | Ouvre une recherche par nom d'annonceur, pas l'annonce exacte. |
| F19 | fiche | « Créer un projet » | | `PreparerCreation` | `preparerCreation` :35, `proposerHypotheses` :56, `creerProjetDepuisSources` :74 (gSrc) | projet et brief ; hypothèses : appel texte payant | raccordé | |
| F20 | fiche | « Actions Jarvis ▾ » | menu (raccourcis T, E, S, A, H, C) | aucune | | | à créer | |
| F21 | fiche | Menu · « Transcrire le script » | | | voir F13 | | partiel | |
| F22 | fiche | Menu · « Exporter le script » (Texte, Google Docs, Word, PDF) | | aucune pour une annonce ; l'export de brief existe pour les projets (A/studios/export.ts) | | | à créer | L'export vers Google Docs demande l'écriture sur Drive, alors que l'accès actuel est en lecture seule : décision Kevin. |
| F23 | fiche | Menu · « Scripts similaires » | | aucune | | barème « script » 3 crédits dans K/credits.ts:8 | décision Kevin | Nouvelle dépense IA. |
| F24 | fiche | Menu · « Analyser l'accroche » | | aucune | proche de `proposerHypotheses` | | décision Kevin | |
| F25 | fiche | Menu · « En faire une hypothèse », « Ajouter aux hypothèses », « Préparer un lot » | | `PreparerTest` (P/veille/formats/PreparerTest.tsx) | `trackSavedAdAction` A/adsmap-bridge.ts:34 (offre Plus et marque active) | concept « imitation » en brouillon dans Adsmap | partiel | Ne part que d'une sauvegarde, pas de la Veille directement. |
| F26 | fiche | Menu · « Cloner pour Neva » (Je garde, Je remplace, Format, Variantes, « Créer le projet cloné », « Cloner en lot de test ») | | `PreparerCreation` ; lots d'essai : PR #791 (`PreparerEssai`, K/studios/variantes/essai-lot.ts) | `creerProjetDepuisSources` | génération plus tard, sur devis | partiel | Pas de choix « je garde / je remplace » ; le clone avec choix du moteur a été retiré (#779). |
| F27 | fiche | Panneau Jarvis (« Ouvrir dans Jarvis », ×, suggestions, « Préciser la consigne… ») | | /jarvis et W/app/api/jarvis/chat (`guardedAnthropic`) | | IA de conversation | à créer | Le chat n'accepte aucun contexte de créative. |
| F28 | fiche | Boutons des réponses (« Exporter », « Copier », « Utiliser », « Tester », « Ajouter aux hypothèses », « Préparer un lot ») | réponses simulées | | | | à créer | Selon F22 à F26. |

### Pop-up Sauvegarder

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| S01 | pop-up | Ouverture au clic sur le signet | | aucune (bascule directe) | `saveAd` | | à créer | Interface seulement. |
| S02 | pop-up | Vignette, marque, accroche | | | instantané | | à créer | Interface seulement. |
| S03 | pop-up | « Collections » (plusieurs cases) | | sélecteur de board dans C/SavedBoards.tsx | `setSavedAdFolder` A/inspo.ts:148 (gS) | `saved_ads.folder` : un seul texte (DB:731) | partiel | Une seule collection par sauvegarde. Plusieurs collections : migration (table de liaison, ou réemploi des tables `boards` et `board_items` (DB:486 et 495), aujourd'hui inutilisées, avec une colonne vers la sauvegarde). |
| S04 | pop-up | « Nouvelle collection » | | champ « Nouveau board… » (SavedBoards.tsx:340) | idem | | raccordé | Seulement depuis /saved. |
| S05 | pop-up | Compteurs par collection | | `countIn` | | | raccordé | |
| S06 | pop-up | « Tags » | | aucune | | | à créer | Migration. |
| S07 | pop-up | « Note (facultatif) » | | **aucun écran** | aucune action | colonne `saved_ads.note` déjà présente (DB:730) | partiel | Sans migration. |
| S08 | pop-up | Mention « La source, les dates et la plateforme sont conservées » | | | instantané jsonb et `created_at` | | partiel | Pas de dates de diffusion. |
| S09 | pop-up | « Retirer des sauvegardes » | | `SaveButton` | `unsaveAd` :156 | | raccordé | |
| S10 | pop-up | « Annuler », « Sauvegarder », « Mettre à jour » | | | aujourd'hui deux appels séparés | | à créer | Prévoir une seule action groupée. |

### Sauvegardes (#saved)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| SV01 | #saved | « Créer un projet avec la sélection » | | aucune sélection multiple | `preparerCreation` accepte une liste de sources (A/studios/sources.ts:35) | | partiel | |
| SV02 | #saved | Onglets de section | | `OngletsSection` | | | raccordé | |
| SV03 | #saved | Colonne Collections (Toutes, …, Non classées) | | barre de boards (SavedBoards.tsx:224-229) | | | raccordé | Présentée en pastilles. |
| SV04 | #saved | « + Nouvelle collection » | | seulement depuis une carte | | `folder` en texte | partiel | Une collection n'existe que si elle contient une créative. Le prototype ouvre la mauvaise pop-up (`saveCreative(1)`). |
| SV05 | #saved | Barre compacte (recherche, filtres, tri) | | recherche locale (SavedBoards.tsx:218) | | | partiel | Pas de filtres ni de tri. |
| SV06 | #saved | Grille / Liste | | grille seule | | | à créer | |
| SV07 | #saved | Carte avec le nom de sa collection | | sélecteur de board sur la carte | | | raccordé | |
| SV08 | #saved | Pied de page « source et dates conservées » | | | | | partiel | |

### Ce qui scale (#scale)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| SC01 | #scale | Bandeau « Signal observé… pas une mesure de performance » | | P/veille/scale/page.tsx | | | raccordé | Raccordé pour le texte. |
| SC02 | #scale | Filtres Plateforme, Pays, Diffusion, « Tous les filtres » | | niche, présélections et pays (page.tsx:179-186) ; `SwipeFile` : recherche dans le texte, annonceur, angle (SwipeFile.tsx:125-135) | `canAccess(inspo)` | Trendtrack (100 annonces) | partiel | Meta seul. |
| SC03 | #scale | Classement numéroté par durée de diffusion | | tri « Durée de diffusion » disponible, mais le défaut est « Croissance reach 30j » (`sortBy reachDelta30d`, page.tsx:~115 ; SwipeFile.tsx:147) | | | partiel | Retirer le reach et la dépense : décision Kevin. |
| SC04 | #scale | Ligne : jours, « N var. », accroche | | cartes `SwipeFile` | | | partiel | |
| SC05 | #scale | Clic sur une ligne | ouvre la fiche | aucune | | | à créer | |
| SC06 | #scale | Sauvegarder | | SwipeFile.tsx:220 | `saveAd` | | raccordé | |

### Formats (#formats et #concepts, version r2)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| FO01 | #formats | Titre « Explorer par format », recherche « Rechercher un format ou une marque… » | | P/veille/formats/VueFormats.tsx | page `canAccess(inspo)` | | partiel | Pas de recherche. Le classement par format ne porte que sur les sauvegardes. |
| FO02 | #formats | Mur de 16 formats (vignette, « N concepts ») | | liste de 25 formats et « Autre », avec le nombre réel d'annonces classées (VueFormats.tsx:137) | `classerFormatSauvegarde` A/inspo.ts:77 (gV) | `snapshot_json.formatCreatif`, sans migration | partiel | Les deux listes de formats diffèrent : décision Kevin pour les aligner. |
| FO03 | #formats | Clic sur un format | ouvre #concepts | lien `?format=` | | | raccordé | Sur les sauvegardes. |
| FO04 | #concepts | « ← Tous les formats » | | VueFormats.tsx:195 | | | raccordé | |
| FO05 | #concepts | « Créer avec ce format » | | aucune | | | à créer | Le format n'est pas transmis à la création du projet. |
| FO06 | #concepts | Pastilles de format | | puces Média et Source, tri (VueFormats.tsx:72-83, 202) | | | partiel | |
| FO07 | #concepts | Barre de filtres (Plateforme, Pays, Diffusion, Marques suivies, Tous les filtres) | | Source seulement | | | partiel | |
| FO08 | #concepts | Cartes de concept (Sauvegarder, jours, accroche) | | `AdCard` sur les sauvegardes classées | | | partiel | Classer les résultats de la Veille demanderait l'IA : décision Kevin. |
| FO09 | #concepts | Fiche concept (Structure, Observation, Hypothèse, « Pour l'adapter », « Voir le format », « Utiliser ce concept ») | | aucune | « Utiliser » pourrait passer par `PreparerCreation` | | à créer | |

### Tags (#tags)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| TG01 | #tags | « + Ajouter un tag » (pop-up Nom, Ajouter) | | P/tags/page.tsx est une démonstration sur données fictives | aucune | | à créer | Migration : table des tags (espace, marque ou commun, nom, couleur) et liaison aux sauvegardes. `creative_tags` (DB:299) contient les tags IA de vos propres créatives, pas un vocabulaire partagé. |
| TG02 | #tags | Tableau Tag, Créatives, Portée | | | | | à créer | |
| TG03 | #tags | « Voir » | ouvre les Sauvegardes filtrées | | | | à créer | |
| TG04 | #tags | « Renommer » (pop-up) | | | | | à créer | |

### Radar (#radar)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| RD01 | #radar | « Suivre une marque » (Marque ou domaine, Plateformes, Alerte : Nouvelle créative, Active ≥ 30 j, Résumé hebdomadaire ; Suivre) | | suivi possible seulement depuis une carte | `followBrand` (session seule) ; nouveautés : `scanAllTracker` (W/app/api/cron/tracker) ; survies : /adsmap/radar, `setRadarAction` A/adsmap-radar.ts:113 (admin, offre Plus) ; résumé hebdo : W/app/api/cron/digest | `followed_brands`, `brand_tracker_events` (DB:750) ; IA nocturne pour les survies | partiel | Pas de saisie libre ni d'alerte par marque (migration de colonnes sur `followed_brands`). |
| RD02 | #radar | Section « Marques suivies » (« N nouvelles ») | | C/MarquesSuivies.tsx et `TrackerFeed` dans /saved (onglets Marques suivies, Nouveautés) | `markTrackerSeenAction` A/tracker.ts:23 | | raccordé | Raccordé sur une autre route. |
| RD03 | #radar | « Voir » | | MarquesSuivies.tsx:118 vers /veille?q=…&searchIn=brand | | | raccordé | |
| RD04 | #radar | « Alertes » | | aucune | | | à créer | |
| RD05 | #radar | Tableau « Recherches enregistrées » (« Ouvrir ») | | aucune | | | décision Kevin | Voir V05. |

### Sources (#sources)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| SR01 | #sources | Tableau Source, Portée, Statut | | P/jarvis/sources/page.tsx (mémoire mesurée, état des couches, « Ce qu'on lui demande », coûts et réglages réservés au fondateur) | mémoire visible avec l'offre Plus, réglages réservés au fondateur | | partiel | Contenu différent et plus riche. Versions et expirations : /admin/connaissances (A/connaissances.ts). |
| SR02 | #sources | « Revenir à Jarvis » | | sources/page.tsx:114 | | | raccordé | |

### Bibliothèque (#library, #assets)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| L01 | #library | « + Nouveau dossier » | | P/assets/AssetsLibrary.tsx | aucune | **aucune table de dossiers** | à créer | Migration : table de dossiers (espace, marque, parent, nom, verrouillé), `assets.folder_id` et son index. |
| L02 | #library | « Importer » | | « Téléverser des fichiers » (AssetsLibrary.tsx:232) | `presignAssetUploadAction` A/assets.ts:294, `registerUploadedAssetAction` :312, `uploadImageAssetsAction` :107, **session seule** (la page exige le rôle membre) | `assets` (DB:173) ; 1 Go maximum (A/assets.ts:19) | raccordé | Sans pop-up. |
| L03 | #library | Onglets racines « Assets de la marque », « Créations », « Anciens studios » | | la page mélange historique, sorties Studios et anciennes créations (page.tsx:26-38) ; filtres Tous, Images, Vidéos, Audio, Autres (AssetsLibrary.tsx:16) | | | partiel | |
| L04 | #library | Arbre de dossiers (déplier, compteurs) | | aucune | | | à créer | Migration. |
| L05 | #library | Dossiers racines verrouillés | | aucune | | | à créer | |
| L06 | #library | Glisser un fichier sur un dossier | | aucune | | | à créer | |
| L07 | #library | Fil d'Ariane de l'emplacement | | aucune | | | à créer | |
| L08 | #library | Recherche « par nom ou tag IA » | | AssetsLibrary.tsx:297 | | | raccordé | |
| L09 | #library | Grille / Liste (Nom, Format, Taille, Droits, Ajouté) | | grille seule | | | à créer | |
| L10 | #library | Bandeau « seuls les droits autorisés… », « Connecter Google Drive » | | case « IA » par asset (AssetsLibrary.tsx:419) ; P/assets/DriveConnect.tsx | `toggleAssetAiAction` :189 | `use_for_ai` | partiel | Pas de notion de droits. |
| L11 | #library | Sélection multiple et barre « N sélectionnés » | | aucune | | | à créer | |
| L12 | #library | Lot · « Déplacer » | | aucune | | | à créer | |
| L13 | #library | Lot · « Télécharger » | | lien « Ouvrir » un par un | | | à créer | |
| L14 | #library | Lot · « Droits » (Photo de la marque, UGC avec accord, Banque d'images, À préciser) | | aucune | | `studio_assets.rights` existe pour les médias de projet (DB:1390) | à créer | Migration `assets.rights`. |
| L15 | #library | Lot · « Supprimer » (corbeille 30 jours) | | AssetsLibrary.tsx:430 | `deleteAssetAction` A/assets.ts:327, suppression **définitive**, un par un, session seule | | partiel | Corbeille : migration (`deleted_at`). |
| L16 | #library | Cartes de dossier (aperçu, compteurs) et « Nouveau sous-dossier » | | aucune | | | à créer | |
| L17 | #library | Carte fichier (durée, score, case, « … », « droits à préciser ») | | carte asset (nom, type, tags, IA, modèle, supprimer, ouvrir) | | | partiel | |
| L18 | #library | Menu « … » (Ouvrir, Déplacer vers…, Utiliser dans un projet, Télécharger, Copier le lien, Supprimer) | | seulement Ouvrir (nouvel onglet) et Supprimer | | | partiel | |
| L19 | #library | Pop-up « Nouveau dossier » (Nom, Emplacement) | | aucune | | | à créer | |
| L20 | #library | Pop-up « Déplacer N éléments » | | aucune | | | à créer | |
| L21 | #library | « Renommer le dossier » | | aucune | | | à créer | |
| L22 | #library | État « Dossier vide » avec zone de dépôt | | état vide « Aucun asset » et bouton Téléverser | | | partiel | |
| L23 | #library | « Sources synchronisées » (Shopify, Google Drive) | | | Shopify : `syncShopifyProductsAction` A/brand-detail.ts:322 range les photos dans `products.image_urls`, pas dans `assets` ; Drive : `getDriveState` A/drive.ts:30 | | partiel | Partiel pour Shopify, raccordé pour Drive. |
| L24 | #library | Fiche asset en pop-up | | lien vers l'URL brute (AssetsLibrary.tsx:368) | | | à créer | |
| L25 | #library | Fond damier, clair ou sombre ; zoom | | aucune | | | à créer | |
| L26 | #library | Précédent / Suivant, « k / n », flèches du clavier | | aucune | | | à créer | |
| L27 | #library | Renommer (crayon) | | aucune | | | à créer | Action à ajouter, sans migration. |
| L28 | #library | Emplacement cliquable, « Déplacer » | | aucune | | | à créer | Migration (dossiers). |
| L29 | #library | Droits, « Modifier » | | aucune | | | à créer | Migration. |
| L30 | #library | Dimensions, Poids, Source, Ajouté | | | taille, source, type, date | | partiel | Pas de dimensions dans `assets`. |
| L31 | #library | Tags IA (× pour retirer, « + Tag ») | | | `tagAssetAction` :215, `tagUntaggedImagesAction` :252 (sess) | 1 crédit par image (barème `tag_image`) | partiel | Pas d'édition manuelle (action à ajouter). |
| L32 | #library | « Utilisé dans » | | seules les sorties Studios renvoient à leur projet | | | à créer | Requête inverse à écrire. |
| L33 | #library | « Avec Jarvis » (Détourer, Décliner en 9:16, Mettre en scène, Transcrire, Couper en 3 accroches, Sous-titrer) | | aucune | | | décision Kevin | Nouvelles dépenses IA ; les sous-titres incrustés sont absents (INVENTAIRE §3). |
| L34 | #library | « Utiliser dans un projet » | | sens inverse seulement | `associerReference` A/studios/produit.ts:54 depuis l'écran Produit du projet (catalogue W/lib/studios/produit/catalogue.ts:128) | | partiel | |
| L35 | #library | Icônes Télécharger, Copier le lien, Remplacer, Supprimer | | Ouvrir et Supprimer seulement | | | partiel | |
| L36 | #library | Import · « Glissez vos fichiers ici · 1 Go max » | | sélecteur de fichiers et barre de progression | `presignAssetUploadAction` | 1 Go si le stockage est actif, sinon environ 4 Mo par image | partiel | |
| L37 | #library | Import · « Google Drive » | | panneau de liens Drive et `DriveConnect` | A/drive.ts (adm, marque active) | | raccordé | |
| L38 | #library | Import · « Dropbox » | | aucune | | | décision Kevin | Nouveau connecteur. |
| L39 | #library | Import · « Shopify » | | | voir L23 | | partiel | |
| L40 | #library | Import · « Lien » (pop-up « Lien public ») | | panneau Lien (AssetsLibrary.tsx:283) | `importAssetAction` :133 | | raccordé | |
| L41 | #library | Analyse automatique « 1 crédit par fichier » | | analyse manuelle | | 1 crédit par image | décision Kevin | Lancer l'analyse automatiquement à l'import est une dépense. |
| L42 | #library | Liste des fichiers envoyés (progression, état) | | une seule barre de progression | | | partiel | |
| L43 | #library | Menu « Droits d'usage » par fichier | | aucune | | | à créer | Migration. |
| L44 | #library | « Coût d'analyse : N crédits », « Ajouter à la Bibliothèque » | | aucune | | | à créer | |
| L45 | #library | Connexion Drive · « Autoriser l'accès » (lecture seule) | | W/app/api/oauth/google et sélecteur Google | adm | | raccordé | Une connexion par marque. |
| L46 | #library | Connexion Drive · choisir plusieurs dossiers | | un seul dossier (`brands.drive_folder_id`, DB:129) | `setDriveFolderAction` :63 | | décision Kevin | Plusieurs dossiers : migration. |
| L47 | #library | Connexion Drive · Fréquence (Automatique, Toutes les heures, Manuelle) | | manuelle seulement | `syncDriveNowAction` :70 ; aucune tâche planifiée Drive | | décision Kevin | |
| L48 | #library | Connexion Drive · « Analyser les nouveaux médias » | | aucune | | | décision Kevin | Dépense. |
| L49 | #library | Connexion Drive · « Droits par défaut » | | aucune | | | à créer | |
| L50 | #library | Gestion de la source (« Synchroniser maintenant », « Choisir les dossiers », « Déconnecter ») | | `DriveConnect` | `syncDriveNowAction`, sélecteur Google, `disconnectDriveAction` :143 | | raccordé | |
| L51 | pop-up photo produit | « Glissez une photo ou parcourez · JPEG, PNG ou WebP · 20 Mo max », « Parcourir… » | | branche PR #783 : C/studios/produit/ImportPhotoProduit.tsx | `importerPhotoProduit` A/studios/produit.ts:62 sur la branche (gSrc et capacité projets) ; règle K/studios/produit/import-photo.ts | `products.image_urls`, compression dans le navigateur, 900 000 caractères au plus, 6 photos par produit, sans migration | raccordé PR #783 | La limite « 20 Mo » du prototype ne correspond pas : la photo est compressée avant envoi. |
| L52 | pop-up photo produit | Ligne fichier (taille, dimensions, progression, « Prêt ») | | états d'écran de la PR #783 | | | raccordé PR #783 | |
| L53 | pop-up photo produit | « Rôle de cette image » (Produit, Style, Logo) | | `associerReference(role, scope)` :54 | | | partiel | La photo importée devient la photo épinglée du produit. |
| L54 | pop-up photo produit | « Provenance et droits » | | aucune | | | à créer | |
| L55 | pop-up photo produit | « Utiliser cette photo », « Annuler » | | | `epinglerProduit` :43 | | raccordé PR #783 | |
| L56 | rail | Entrée « Assets de la marque » sous Marques | | sur main, `placerAssets` place Assets dans le groupe Marque ; la PR #787 le retire : la Bibliothèque redevient un module et la marque active passe dans « Votre espace » | | | raccordé PR #787 | La vue #assets filtrée reste à créer ; /assets suit déjà la marque active. |

### Marques (#brands, #brand, #competitors)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| M01 | #brands | « + Nouvelle marque » | ouvre l'assistant | C/BrandWizard.tsx (Profil, Charte, Audience, Concurrents, Comptes pub) ; P/brands/new pour Shopify | `createBrandAction` A/brands.ts:76, `createBrandFromShopifyAction` :131 (adm) | `brands` (DB:85) | partiel | Étapes différentes. |
| M02 | #brands | Cartes de marque (nombre de projets et de sauvegardes, « % complété ») | | P/brands/page.tsx (adm) | | | partiel | Pas de pourcentage de complétude dans la liste. |
| M03 | assistant de marque | Étape « Scanner » (site 8, Shopify 4, avis 10, réseaux 8, documents 2 crédits ; « Scanner · 34 crédits ») | | assistant | `generateBrandDraftAction` A/brands.ts:42 (adm) | 5 crédits (barème `brief`), lit le site seul | décision Kevin | Nouvelle dépense multi-sources et nouveau prix. |
| M04 | assistant de marque | Étape « Identité & ton » (champs sourcés, couleurs proposées) | | assistant Profil et Charte | `importBrandDAAction` A/brand-detail.ts:301 | | partiel | Pas de source par champ. |
| M05 | assistant de marque | Étape « Produits » (Garder, Ignorer, allégation à justifier) | | | import des produits (IA ou Shopify) | | partiel | Pas d'allégations. |
| M06 | assistant de marque | Étape « Personas » obligatoire (Valider, Écarter, Rétablir, Ajouter) | | assistant Audience, facultatif | | | décision Kevin | Rendre l'étape bloquante est une règle produit. |
| M07 | assistant de marque | Étape « Offres & preuves » (Livraison, Retours, Garantie) | | aucune | | `adsmap_offers` (DB:904 : libellé, prix, remise, garantie) | à créer | Livraison et retours : migration. |
| M08 | assistant de marque | Récapitulatif, « Enregistrer et quitter », « Créer la marque » désactivé sans persona | | création directe, sans brouillon | | | partiel | |
| M09 | #brand | En-tête (logo, nom, site), « N éléments à compléter » | | P/brands/[id]/page.tsx:~95-111 (`RenameMarque`, liens Assets et Connexions) | adm | | raccordé | |
| M10 | #brand | Onglets « Vue d'ensemble, Identité, Offre, Clients & marché, Règles » | | `OngletsFiche` : Aperçu, Audience, Produits, Concurrents (page.tsx:36, NavFiche.tsx) | | | partiel | Découpage différent. |
| M11 | #brand | « Scanner la marque », « Laisser Jarvis remplir la fiche » | | formulaire « Générer tout le profil depuis le site » (page.tsx:203) | `generateFullBrandAction` A/brand-detail.ts:28 (adm) | 5 crédits ; ne remplit que les champs vides ; ne crée des personas que s'il n'y en a aucun | partiel | Un scan multi-sources avec relecture : décision Kevin. |
| M12 | #brand | « À compléter » avec « Compléter » et « Pré-remplir avec Jarvis » | | liste de complétude de l'Aperçu | | | raccordé | |
| M13 | #brand | Cartes de chapitre (faits clés, « Ouvrir ») | | cartes de compteurs | | | partiel | |
| M14 | #brand | « Enregistré automatiquement », « Compléter avec Jarvis », « Suivant » | | `BrandOverviewForm` avec bouton Enregistrer | `updateBrandAction` A/brands.ts:175 | | partiel | Pas d'enregistrement automatique. |
| M15 | #brand | Identité et Ton (curseurs de personnalité, phrases validées) | | `BrandOverviewForm`, `BrandDA`, `PaletteMarque` | `saveBrandDAAction` A/brand-detail.ts:284 ; `extractBrandVisualDaAction` :99 (5 crédits) | | partiel | Curseurs : migration ou `brand_kit` jsonb. |
| M16 | #brand | Règles (mentions obligatoires, interdits, contraintes par plateforme) | | `avoidWords` ; `creativeRules` sur /jarvis | `saveJarvisRulesAction` A/jarvis.ts:27 | | partiel | |
| K01 | #competitors | Cartes concurrents (« N créatives actives ») | | onglet Concurrents (page.tsx:328) | `updateBrandAction` | `brands.competitors` (text[]) | partiel | Sans nombre de créatives. |
| K02 | #competitors | « Voir dans la Veille » | | existe dans `MarquesSuivies` seulement | | | partiel | |
| K03 | #competitors | « Alertes » | | | `followBrand` et le suivi des nouveautés | | partiel | Deux listes séparées : `brands.competitors` et `followed_brands`. |
| K04 | #competitors | « + Ajouter un concurrent · Suivi dans le Radar » | | champ texte, sans suivi | | | partiel | Les relier : migration. |

### Audiences et personas (#brand-audiences, #persona-x)

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| P01 | #brand-audiences | « Proposer avec Jarvis » | lance le scan, volet personas | | `generateFullBrandAction` (ne crée que si la marque n'a aucun persona) | 5 crédits | partiel | Propositions sourcées : décision Kevin. |
| P02 | #brand-audiences | « + Nouveau persona » (Proposé par Jarvis / Manuellement) | | onglet Audience (page.tsx:265) | `addPersonaAction` A/brand-detail.ts:175 (adm) | `personas` (DB:195) | partiel | |
| P03 | #brand-audiences | Alerte « Aucun persona validé, Studios bloqués » | | aucune | | | décision Kevin | Bloquerait un parcours. |
| P04 | #brand-audiences | « Répartition des clients » (barre en %) | | aucune | | | décision Kevin | Nécessite les commandes et une analyse IA. |
| P05 | #brand-audiences | Cartes persona (rang, titre, statut, segment, Veut, Freine, Accroche, « N créa · N lots », « Angle inexploité ») | | liste (nom, description, douleurs, désirs, supprimer ; page.tsx:250) | | `status` existe (DB:205) mais n'est pas affiché | partiel | Rang, segment et accroches : migration. |
| P06 | #brand-audiences | Tableau « Ce que les tests disent » (« Itérer », « Créer une hypothèse », « Lots de test ») | | Adsmap | chaîne désirs, angles, annonces (A/adsmap-attribution.ts:78) | | partiel | Réservé à l'offre Plus. |
| P07 | #persona-x | « ← Audiences » | | aucune route | | | à créer | |
| P08 | #persona-x | « Valider ce persona » | | /adsmap/tri | `validateNodeAction` A/adsmap-curation.ts:229 (Plus, membre) | | partiel | Pas depuis la fiche marque. |
| P09 | #persona-x | « Créer un brief » | | `lienNouveauProjet` ou `PreparerCreation`, sans persona | | | à créer | |
| P10 | #persona-x | « Demander à Jarvis » | | | | | à créer | |
| P11 | #persona-x | Blocs (Qui, Veut, Souffre, Objections, Moments d'achat, Accroches, Verbatims, Canaux, Formats, Mots à utiliser et à éviter, Sources, Dans les tests) | | | colonnes `description`, `pains`, `desires`, `objections`, `sources_json` | | partiel | Démographie, moments, canaux, formats, accroches, mots, verbatims, rang et part : migration. |
| P12 | #persona-x | Crayon « Modifier » par bloc | | aucune édition ; seul le renommage passe par adsmap-curation :352 | | | à créer | |
| P13 | #persona-x | « Tester cette accroche », badge « Mesurée / Non testée » | | aucune | | | à créer | |
| P14 | #persona-x | « Mettre à jour avec Jarvis » | | aucune | | | décision Kevin | |
| P15 | #brand-clients | Mini-liste et « Voir toutes les audiences » | | onglet Audience | | | partiel | |
| P16 | pop-up | Nouveau persona manuel (Prénom, Rôle, En une phrase, Ce qu'elle veut, Objection, « Créer en brouillon », « Laisser Jarvis compléter ») | | | `addPersonaAction` enregistre le statut par défaut « validated » | | partiel | Un brouillon peut utiliser le statut « proposed », sans migration. |
| P17 | pop-up brief | « Pour qui ? » obligatoire (radio, « Gérer ») | | brief Studios sans persona | | | décision Kevin | |
| P18 | pop-up | Scan de marque en 3 étapes (sources avec crédits, « Ajouter une page », ce que Jarvis remplit, devis, « Lancer le scan · N crédits », Accepter / Ignorer / « Tout accepter », « Appliquer à la fiche », « Plus tard ») | | | brique existante `generateFullBrandAction` (site seul, sans relecture) | | décision Kevin | Nouvelle dépense IA et nouveau prix. |

### Produits de la marque

| id | vue V5 (#route) | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel (fichier) | action/service réel (fichier:ligne) et garde serveur | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| PR01 | #brand-offre | Cartes produit (photo, prix, état de la fiche, « Ouvrir ») | | onglet Produits (page.tsx:281) | | `products` (DB:158) | partiel | État de la fiche à calculer, sans migration. |
| PR02 | #brand-offre | « + Ajouter un produit · ou importer depuis Shopify » | | | `addProductAction` A/brand-detail.ts:255 ; `syncShopifyProductsAction` :322 ; `importProductsAction` :355 (5 crédits) ; adm | | raccordé | |
| PR03 | #brand-offre | Fiche produit (Nom commercial, Prix, Tranche d'âge, Caractéristiques validées) | | | aucune action de modification | | partiel | Tranche d'âge : migration. |
| PR04 | #brand-offre | Allégations autorisées et interdites | | aucune | | | à créer | Migration, puis à brancher sur la génération. |
| PR05 | #brand-offre | Photo produit | | pas de dépôt depuis la fiche ; depuis le projet via la PR #783 | | | partiel | |

## Données : ce qui existe et les migrations nécessaires

| Besoin V5 | Ce qui existe | Migration ? |
|---|---|---|
| Dossiers de bibliothèque | Rien. `assets` contient : espace, marque (ou commun), nom, type, source, URL, miniature, `external_id`, type MIME, taille, `tags` (text[]), `use_for_ai`, date. | **Oui** : table de dossiers et `assets.folder_id`. Ajouter aussi `assets.rights`, `deleted_at` et les dimensions. |
| Collections de sauvegarde | `saved_ads.folder` : une seule valeur par sauvegarde. Les tables `boards` et `board_items` (avec `note`, `section`, `order`, `share_token`) existent mais rien ne s'en sert. | **Oui** pour plusieurs collections : table de liaison, ou réemploi de `board_items` avec une colonne vers la sauvegarde. |
| Tags de sauvegarde | Rien. `creative_tags` concerne vos créatives ; `library_ads.tags_json` n'est pas utilisé. | **Oui.** |
| Note de sauvegarde | `saved_ads.note` | Non : il ne manque que l'action et l'écran. |
| Recherches enregistrées et alertes | Rien | **Oui.** |
| Préférences d'alerte par marque suivie | `followed_brands` avec `seen_ad_ids` et `last_checked_at` | Oui, des colonnes à ajouter. |
| Audiences et personas | `personas` : nom, description, douleurs, désirs, objections, sources, statut (proposed, validated, rejected, archived) ; `adsmap_desires` et `adsmap_angles` sont rattachés aux personas. | **Oui** pour les champs V5 (rang, segment, démographie, déclencheurs, canaux, formats, accroches, mots, verbatims, part). Un jsonb unique serait possible, mais il faut choisir. |
| Produits | `products` : nom, description, USP, prix, URL, image, images | Oui pour les allégations et la tranche d'âge. |
| Offres et preuves | `adsmap_offers` ; `reviews_sources` et `reviews` | Non pour les offres et les garanties. Oui pour la livraison et les retours. |
| Concurrents | `brands.competitors` (text[]) et `followed_brands`, sans lien entre les deux | Oui pour les relier. |

**Gardes serveur à revoir avant le portage :**
- `followBrand` et `unfollowBrand` ne vérifient que la session (A/inspo.ts:169, 181).
- Toutes les actions de A/assets.ts ne vérifient que la session, y compris `deleteAssetAction` ; seul le passage en modèle est réservé aux admins. Un lecteur client peut donc les appeler directement.
- `gS` ne vérifie pas l'offre, ce que le code documente comme une dette connue.

## (1) Correspondance routes réelles et vues V5

| Vue V5 | Route réelle |
|---|---|
| #veille | /veille (et /veille?…&rv= pour revenir à une recherche) |
| #saved | /saved (onglets Créations, Marques suivies, Nouveautés, Explorer) |
| #scale | /veille/scale |
| #formats et #concepts | /veille/formats et /veille/formats?format= (sur les sauvegardes seulement) |
| #tags | aucune route équivalente. /tags est « Top Creative Tags », une démonstration. |
| #radar | marques suivies : /saved?onglet=marques et nouveautés ; survies : /adsmap/radar (admin, offre Plus). /radar est la notation de vos propres créatives Meta, qui relève de Résultats. Les recherches enregistrées n'ont pas de route. |
| #sources | /jarvis/sources (et /admin/connaissances pour les versions) |
| #library | /assets |
| #assets | /assets filtré sur la marque active (PR #787 pour le rail) |
| Pop-up photo produit | /studio/projets/[id]/produit (PR #783) |
| #brands | /brands (et /brands/new pour la création depuis Shopify) |
| #brand et ses chapitres | /brands/[id]?tab=overview, audience, products, competitors |
| #competitors | /brands/[id]?tab=competitors, et /brands/[id]/competitors/[name] pour le rapport |
| #brand-audiences, #persona-x | /brands/[id]?tab=audience. Il n'y a pas de route par persona. |

## (2) Capacités de l'outil actuel sans place dans la V5 (à garder ou à trancher)

- **Veille :**
  - périmètre de recherche (texte, marque ou domaine) et bascule automatique sur un domaine ;
  - plateforme Google et ses statistiques ; Reach, Spend estimé, Vues, Likes et Engagement sur les cartes ;
  - tris par reach (« Scaling 7 j », « Reach ») ; badge « Piste forte » ;
  - liens « Ses annonces dans la Veille », « Bibliothèque ↗ » et « Site ↗ » ; « + Suivre » directement sur la carte ;
  - pagination ; suggestions de thèmes ; aide ; bandeau de démonstration ; sélection par défaut selon la catégorie de la marque ;
  - section « Lecture du marché » ; lien « Ouvrir mes tests » ; bandeau de parcours source, analyse, projet (PR #785).
- **Ce qui scale :**
  - analyse par niche avec présélections ;
  - statistiques (créas, vidéos, annonceurs, dépense cumulée, croissance et durée médianes) ;
  - filtre par angle ; « Bonus · 6 requêtes à copier ».
- **Sauvegardes :**
  - « Suivre dans Adsmap » ;
  - onglets Marques suivies, Nouveautés et Explorer (découverte du marché, grammaire de catégorie, analyse vidéo marché, brief de marque depuis une marque suivie).
- **Formats :**
  - classement manuel par format, versionné et signé ;
  - « à classer », « incertaines » ;
  - « Préparer un test » vers Adsmap.
- **Pages sans équivalent V5 :** /tags (performance des tags, démonstration) et /radar (notation Hook, Hold, CTR, Conv de vos créatives Meta).
- **Bibliothèque :**
  - case « Commun à l'espace » ;
  - interrupteur « IA » par asset ;
  - modèles visibles du client (réservé aux admins) ;
  - analyse groupée « Analyser N image(s) » ;
  - import Drive par liens collés.
- **Marques :**
  - suppression d'une marque ;
  - scénarios d'usage avec génération de visuel (crédits) ;
  - rapport concurrent payant (`analyzeCompetitorAction`, 6 crédits, avec media mix, créatives et « Tester cet angle ») ;
  - connexion Shopify et comptes publicitaires depuis la fiche ;
  - fusion de personas (`mergePersonasAction`, admin) ;
  - règles et apprentissages Jarvis (`trainJarvisAction`).

## (3) Les 5 écarts les plus coûteux

1. **Fiche créative et actions Jarvis.** Il faut créer la pop-up, la navigation précédente/suivante, le menu Actions et le panneau Jarvis avec la créative en contexte. Transcrire, exporter le script, scripts similaires, analyser l'accroche et cloner : chacune est une nouvelle surface IA payante ou un nouvel export, et la source ne fournit ni dates, ni variantes, ni ratio, ni langue. Il faut d'abord un arbitrage prix et dépense de Kevin.
2. **Bibliothèque à dossiers.** Migration des dossiers, des droits et de la corbeille ; arbre, glisser-déposer, déplacements groupés, fiche asset ; suivi « Utilisé dans » ; Drive avec plusieurs dossiers et synchronisation automatique. Il faut aussi resserrer les gardes des actions sur les assets.
3. **Recherches enregistrées et Radar avec alertes.** Nouvelle table, tâche planifiée qui appelle Trendtrack de façon récurrente, alertes par marque, saisie libre pour suivre une marque, rapprochement de `brands.competitors` et `followed_brands`. Le coût fournisseur est récurrent : décision Kevin.
4. **Personas riches et scan de marque.** Migration des personas, fiche persona éditable, validation depuis la fiche marque, règle « persona obligatoire » dans le brief, scan multi-sources sourcé avec devis. Le scan est une nouvelle dépense et son prix est à fixer par Kevin.
5. **Sauvegardes : collections multiples et tags.** Migration (liaison des collections, vocabulaire de tags, liaisons), pop-up de sauvegarde groupée avec note (la colonne existe), page Tags réelle à la place de la démonstration, filtres et vue liste communs Veille et Sauvegardes, filtres locaux (masquer les sauvegardées, appel à l'action).
