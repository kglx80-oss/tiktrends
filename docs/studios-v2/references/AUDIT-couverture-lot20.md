# Lot 20 · agent A · audit de couverture au `main` `70200777`

Audit documentaire et de code, en lecture seule. Rien n'a été exécuté : ni serveur, ni capture, ni base, ni build. Aucun fichier suivi par git n'a été modifié.

## 0 · Repères et conventions

**Base auditée.** Worktree `.claude/worktrees/agent-a73593c41e00752d5`, détaché sur `702007774af23c8d23d3fe15ce26e6f208a4d84e`.

**Production.** Le constat transmis par le pilotage (consignes du lot 20) est le suivant : `/console` sert `70200777`, avec 54/54 migrations.
- C'est la **seule** constatation de production en vigueur.
- Elle établit que le code est en ligne. Elle ne valide aucune fonction.
- Ancien constat : Codex a chargé l'Accueil puis la Veille en production le 04/10, à `ad012d31`/`98fd2d64`, « sans validation de fonction » (`lot16/MATRICE-lot16.md` § 6, `lot18/DOSSIER-lot18-formats.md` § 7). Ce constat est antérieur à #721, #722, #725, #726, #723 et #724 : il est **périmé**.
- Conséquence : la colonne « local/production » vaut **local** partout, sauf pour la ligne `/console`.

**Préfixe « prod- » des captures.** Il désigne un **build local de production** (`next start`), jamais la production.

**Chemins.** Les chemins de preuve sont relatifs à `SP = /tmp/claude-0/-home-user-tiktrends/31ee250e-eedd-5d77-94db-d19fb20c5520/scratchpad`. Chaque fichier cité a été vérifié par `ls`.

**Têtes de PR et squash** (lus par `gh api` et `git log`) :

| PR | Lot | Tête recettée | Squash sur main | Fusion |
| --- | --- | --- | --- | --- |
| #718 | intégration lots A, #106, #106b, 6 à 15 | `6737cdda` | `ad012d31` | 04/10 |
| #719 | lot 16 · `router.refresh` | `480b3a81` | `96a7d700` | 04/10 |
| #720 | lot 17 · Adsmap R1/R2/R3 | `f4f44845` | `98fd2d64` | 04/10 |
| #721 | lot 18B · Veille | `0c32453e` | `b24e1f6d` | 05/10 |
| #722 | lot 19 · axe titre/fil | `a68aa681` | `d062513f` | 05/10 |
| #725 | lot 19D · bordures par rôle | `8f26ce58` | `725f7278` | 05/10 |
| #726 | lot 19A · Accueil, Pilotage, Analytics | `f3bace38` | `6441f14f` | 06/10 06:50 |
| #723 | lot 19C · Formats, Sauvegardes, pont Adsmap | `d08987fc` | `ae76fa1e` | 06/10 10:53 |
| #724 | lot 19B · Connaissances, droits Jarvis | `44d14e17` | `70200777` | 06/10 12:09 |

**Validité dans le temps.** Les diffs ont été mesurés par `git diff <sha_preuve> 702007774af2`.

| Tête | Ce qui a changé depuis, sur main |
| --- | --- |
| `44d14e17` (#724) | **diff vide** : son arbre est identique à `main`. Toute preuve de #724 prise à `44d14e17` vaut pour l'arbre publié. |
| `d08987fc` (#723) | Contient déjà #726. Depuis, seuls les fichiers de #724 changent : Jarvis, `/admin/connaissances` et `/admin`, `AppShell` (+2 lignes ADMIN+/palette), `navigation.ts` (+1). Aucun fichier de `/saved` ni de `/veille/formats`. |
| `f3bace38` (#726) | Aucun fichier propre à `/dashboard` ni à la vue Analytics. Ont changé : la coquille, à savoir `AppShell` (+2), `navigation.ts` (+2) et `rbac.ts` (+4 : entrée de rail « Formats » sous Veille) ; `Toast.tsx` (+42, pile qui passe en haut quand on lui donne une ancre) ; `InspoButtons`, `SavedBoards`. |
| `8f26ce58` (#725) | `studio`, `adsmap`, `brands`, `assets`, `radar`, `tags`, `team`, `billing`, `usage`, `credits`, `support`, `settings`, `connections`, `profile`, `console` et `admin/equipe` : **aucun changement**. `admin/` : +623 lignes (Connaissances, carte `/admin`). |

**Règle appliquée.** Une ligne est « validé » seulement si trois conditions sont réunies :
- son parcours principal a une preuve fichier, avec son SHA ;
- les fichiers **propres à la route** (page, composants de l'écran, action) sont identiques entre ce SHA et `70200777` ;
- les changements de coquille listés ci-dessus restent **hors de l'état capturé**. Exemple : la branche Veille repliée dans le rail, vérifiée sur `prod-f3bace38-rail-tiroir-ouvert-rempli-390.png`.

Une ligne est « partiel » dans trois cas :
- la preuve est antérieure à un changement de ces fichiers ;
- la preuve ne couvre que les cadres (#725), pas le parcours ;
- seul un sous-ensemble des rôles ou des états est prouvé.

Une ligne est « non testé » quand aucune preuve fichier datée n'a été retrouvée.

**Captures regardées pour cet audit** (outil de lecture d'image) :
- `lot19/b/m63/prod-44d14e17-jarvis-autorise-fondateur-1280.png` et `-390.png` ;
- `lot19/a/prod-f3bace38-sans-droit-accueil-rempli-390.png` ;
- `lot19/a/prod-f3bace38-rail-tiroir-ouvert-rempli-390.png` ;
- `lot19/c/m60/prod-d08987fc-sauvegardes-ranger-rejet-390.png`.

---

## 1 · Les huit demandes du 29/09, une par une

Sources :
- `lot13/MATRICE-GLOBALE-lot13.md` § 2 ;
- `lot16/MATRICE-lot16.md` § 6 (état à `ad012d31`) ;
- `lot18/DOSSIER-lot18-formats.md` § 7 (état à `98fd2d64`) ;
- le code et les captures à `70200777`.

Aucune des huit n'a de recette dédiée constatée en production. Les huit sont « servies » (en ligne à `70200777`), ce qui n'est pas une validation de fonction.

### 1.1 · A1 · icône « Réduire » en tête du rail, logo = Accueil
- **Livré** : #704, squash `460cd73`.
- **Gardes présentes à `70200777`** : `apps/web/test/logo-accueil.test.tsx`, `apps/web/test/menu-compact-rail.test.ts`.
- **Modifié depuis** :
  - #707 : Accueil autonome en tête ;
  - #726 : Analytics devient une sous-entrée d'Accueil ;
  - #723 et #724 : entrées de rail ajoutées.
- **Preuve** : fortuite, aucune n'est dédiée.
  - `lot19/b/m63/prod-44d14e17-jarvis-autorise-fondateur-1280.png`, à `44d14e17`, arbre identique à main. Le logo et l'icône « Réduire » sont visibles en tête du rail.
  - `lot19/a/prod-f3bace38-rail-tiroir-ouvert-rempli-390.png`, à `f3bace38`.
- **Local ou production** : local. Production : servi, non constaté.
- **État** : **partiel**. L'affichage est vu ; le geste ne l'est pas (clic sur le logo vers `/dashboard`, Réduire, puis rechargement).
- **Réserve** : aucune recette visuelle dédiée n'a jamais été citée (lots 13, 16 et 18).
- **Prochain test** :
  - depuis `/jarvis`, un clic sur le logo mène à `/dashboard` ;
  - « Réduire » passe le rail à 64 px, et l'état survit au rechargement ;
  - 1440, 1280 et 390, au clavier et à la souris, au SHA main.

### 1.2 · A2 · recherche globale dans la barre commune, et ⌘K
- **Livré** :
  - #704 `460cd73` ;
  - palette filtrée par rôle `9ca6b5e`, via #718 `ad012d31` ;
  - entrée « Connaissances » ajoutée à la palette Plateforme par #724 (`AppShell.tsx`, +1 ligne).
- **Gardes** :
  - `palette-focus-retour.test.tsx` ;
  - `palette-roles-rendu.test.tsx` ;
  - #724 M26/M28 : palette Plateforme fermée sans `isStaff`.
- **Preuve** :
  - `lot12/l12-palette-client-{1280x720,390x844}.png` et `lot12/l12-palette-membre-{1280x720,390x844}.png`, à `db53467` ;
  - barre « Rechercher ⌘K » visible sur `lot19/b/m63/prod-44d14e17-jarvis-autorise-fondateur-1280.png`.
- **Local ou production** : local.
- **État** : **partiel**. La palette ouverte n'est prouvée qu'à `db53467`, avant les modifications d'`AppShell` faites par #718 à #724.
- **Réserve** : aucune.
- **Prochain test** : au SHA main, ⌘K s'ouvre, se ferme par Échap et rend le focus à l'élément d'origine. Contenu par rôle : client lecture, membre, owner, fondateur avec la section Plateforme.

### 1.3 · A3 · support ancré dans Analytics
- **Livré** : `39a5525` dans #704.
- **Règle au noyau** : `packages/core/src/lanceur-support.ts:30` (`ROUTES_LANCEUR_SUPPORT_ANCRE`), qui contient `/analytics` **et** `/dashboard`. Depuis #726, Analytics vit à `/dashboard?vue=analytics` ; le placement dépend du chemin seul, donc le lanceur y est ancré.
- **Garde** : `lanceur-support-shell.test.ts`.
- **Preuve** :
  - `lot19/a/prod-5c69eb71-vue-analytics-bas-rempli-{1440,1280,390}.png`, à `5c69eb71`. C'est un SHA intermédiaire de #726, qui ne vaut pas preuve du SHA final (`lot19/a/m57/corps-726-final.md`) ;
  - aucune capture du bas de la vue à `f3bace38`.
- **Local ou production** : local.
- **État** : **partiel**.
- **Réserve** : le registre m57 note « support mobile et focus partiellement masqué à 390 ».
- **Prochain test** : bas de `/dashboard?vue=analytics` au SHA main, aux trois largeurs. Vérifier que le lanceur est en pied de contenu et ne recouvre rien, et que le focus clavier jusqu'au lanceur n'est pas masqué à 390.

### 1.4 · B1 · largeurs, marges, bordures, cadre commun
- **Livré** :
  - #714 `a40feb7` : cadre de 1200, gouttières ;
  - #722 `d062513` : axe du titre et du fil ;
  - #725 `725f727` : bordures par rôle ;
  - #726, #723 et #724 : écrans entrés dans `PERIMETRE`.
- **Preuves** :
  - `lot19/d/apres-8f26ce58/` (`mesure.json` + 111 captures) : **0 cadre hors rôle sur 37 routes**, aux trois largeurs, à `8f26ce58`. Les fichiers de ces routes n'ont pas changé depuis, sauf `/admin` ;
  - `lot19/cadre/captures-722/build-local-prod-a68aa681/` (axe, `a68aa681`) ;
  - `lot19/a/delta/preuves-1bbdfbc4/`, puis gardes de rendu de #726 (`lot19a-accueil-cadres-rendu`) ;
  - #723 : `lot19c-formats-cadres-rendu` ;
  - #724 : `lot19b-m55-cadres-rendu`.
- **Local ou production** : local.
- **État** : **partiel**.
- **Réserves** :
  - Routes jamais mesurées par le script de familles : `/veille`, `/veille/formats`, `/saved`, `/jarvis`, `/jarvis/sources`, `/admin`, `/admin/equipe`, `/admin/connaissances`, `/support/[id]` (aucun ticket en base de démo), `/onboarding`, `/c/[token]`, `/invite/[token]`, ainsi que les pages publiques. Certaines sont couvertes par une garde de rendu, sans mesure au navigateur.
  - Angle mort de la garde source #725, à `apps/web/test/lot19d-cadres-source.test.ts:130` : une déclaration qui porte `CIBLE_TACTILE_MIN` est classée « contrôle ».
  - Hauteurs des commandes entre cartes.
- **Prochain test** : lancer la mesure de familles (`mesure-roles`) sur ces routes seulement, au SHA main. Ne pas refaire les 37 routes déjà probantes.

### 1.5 · B2 · plafond Jarvis de 760 retiré (cadre et composeur)
- **Livré** : #705 `448ba4c`.
- **Modifié depuis** : #724, avec `JarvisChat.tsx` (+35) et `JarvisContexte.tsx` (+41).
- **Preuve** : `lot19/b/m63/prod-44d14e17-jarvis-autorise-fondateur-{1440,1280,390}.png`, à `44d14e17`, arbre identique à main.
  - La lecture et le composeur occupent toute la largeur du cadre à 1280 : il n'y a plus de colonne de 760.
  - À 1280×720, un bord de bulle passe sous « Effacer le fil ». C'est une observation sur capture, non mesurée.
- **Local ou production** : local.
- **État** : **partiel**. Le retrait du plafond est vu ; la densité ne l'est pas.
- **Réserve** : registre n° 14 (lot 13), densité de Jarvis à 720 px de haut. Le menu « Ajouter du contexte » défile, et le lien de personnalisation passe sous le pli. Non remesuré depuis #724.
- **Prochain test** : 1280×720 et 390×720, menu « Ajouter du contexte » ouvert et fil de plus de 6 tours. Mesurer ce qui reste au-dessus du pli et ce qui passe sous l'en-tête de la conversation.

### 1.6 · C · filtres et raccourcis desktop de la Veille
- **Livré** :
  - #702 `2d56eb2` ;
  - #721 `b24e1f6` : Scale dans l'URL, « Ses annonces dans la Veille », retour contextualisé ;
  - #722 : lien « Veille » de Scale à 44 px.
- **Preuves** :
  - `lot18/recette-0c32453e/`, à `0c32453e`. Pagination et retours en **serveur de développement**, sur une source simulée (`dev-loopback-0c32453e-V1…V7`) ; vides et retour Studio en build local de production (`prod-0c32453e-E1…E4`, `P1`, `S1…S3`) ;
  - `lot19/cadre/captures-722/build-local-prod-a68aa681/build-local-prod-a68aa681-scale-{clavier,filtres}-*.png`, à `a68aa681`.
  - `veille/page.tsx` est inchangé depuis `b24e1f6` ; `veille/scale/page.tsx` depuis `d062513`.
  - En revanche, `components/InspoButtons.tsx`, l'étoile « Sauvegarder » des cartes, a changé dans #723 (échec honnête).
- **Local ou production** : local. L'examen Codex en production du 04/10 est périmé.
- **État** : **partiel**.
- **Réserves** :
  - Recherche en direct sur la source réelle jamais testée (pagination seulement en développement).
  - Rôles autres qu'owner, autre marque ou autre espace : non rejoués.
  - Exigence de Kevin du 04/10, « recherche par formats créatifs obligatoire » : seule la v1 manuelle existe (`/veille/formats`, #723), sur les **sauvegardes classées**. Aucune annonce de la Veille ne porte de format (dossier du lot 18, § 1).
- **Prochain test** : en production, lecture seule par le propriétaire. Attention : une requête de Veille interroge le fournisseur, ce qui peut consommer des crédits du connecteur, à annoncer avant. Le parcours : une recherche, la page 2, une carte, « Ses annonces dans la Veille », puis Revenir.

### 1.7 · D1 · palette en cercles, HEX au clic
- **Livré** : #703 `0f73030`.
- **Modifié depuis** :
  - #709 (H3) : identité visuelle en deux sections ;
  - #710 (H4) ;
  - #722 et #725 : styles.
- **Garde** : `palette-marque-rendu.test.tsx`.
- **Preuves** :
  - `lot19/d/preuves-8f26ce58/prod-8f26ce58-fiche-marque-nom-long-{1440,1280,390}.png` : fiche de marque, cadres seulement ;
  - `lot19/cadre/captures-722/build-local-prod-a68aa681/build-local-prod-a68aa681-fiche-marque-nom-long-*.png`.
  - Les captures H3/H4 à la racine de `SP` (`h3-*`, `h4-*`) ne portent pas de SHA dans leur nom : elles ne sont pas retenues comme preuves.
- **Local ou production** : local.
- **État** : **partiel**. Aucune capture du HEX révélé au clic sur un SHA postérieur à #725 ; `brands/` est inchangé depuis `8f26ce58`.
- **Réserve** : aucune.
- **Prochain test** : fiche marque, section Couleurs. Clic, puis Entrée au clavier sur un cercle : le HEX s'affiche et la copie est annoncée. Aux trois largeurs.

### 1.8 · D2 · logos officiels et miniatures réelles
- **Livré** :
  - #703 `0f73030` ;
  - lot A `d403d3b` et `576d80c`, via #718 `ad012d31`.
- **Gardes** : `logos-outils.test.tsx`, `logos-outils-etats.test.tsx`, `logos-pages-proprietaire-rendu.test.tsx`.
- **Preuves** :
  - `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-connections-*.png` : cadres ;
  - les captures `b2-va-*` de la racine n'ont pas de SHA dans leur nom.
- **Local ou production** : local.
- **État** : **partiel**.
- **Réserve** : tâche #120, couverture des logos d'outils et des assets incomplète. Inchangé depuis le lot 13.
- **Prochain test** : inventaire de chaque connecteur affiché dans `/connections` et `/brands/new`, avec logo officiel ou repli, aux états « à connecter » et « connecté ».

**Bilan § 1** : 0 validée, 8 partielles, 0 non testée.

---

## 2 · Routes et parcours au `main` `70200777`

Légende :
- `V` validé ;
- `P` partiel ;
- `N` non testé.

« local » se lit : build local de production, données synthétiques ; en production, le code est servi et la fonction n'est pas constatée.

| # | route/parcours | rôles | preuve (fichier) + SHA | local/production | validé/partiel/non testé | réserve exacte | prochain test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `/dashboard` · Accueil rempli (bandeau, marques, assistant, prochaine étape, nom long) | owner fondateur | `lot19/a/prod-f3bace38-accueil-defaut-rempli-{1440,1280,390}.png` ; `lot19/a/m55/preuves-f3bace38/prod-f3bace38-accueil-{bandeau,marques,assistant,prochaine-etape,nom-long}-*.png` · `f3bace38` | local | V | registre m57 : hauteur du héros et de l'introduction sur mobile ; provenance du tag dans l'état zéro créa ; P1 (`askAssistant` sans contrôle de rôle, `actions/assistant.ts:17`) | production, lecture seule (propriétaire) |
| 2 | `/dashboard` · Accueil d'un rôle restreint (équipe `membre`, en attente) | équipe membre, membre en attente | `lot19/a/prod-f3bace38-sans-droit-accueil-rempli-*.png` ; `m55/…/prod-f3bace38-accueil-membre-en-attente-*.png` · `f3bace38` | local | V | copie « Analyse tes résultats » sur un Accueil restreint, **vue sur la capture de 390** ; P1 : un `client_viewer` peut appeler `askAssistant` et débiter | aucun avant décision sur la copie |
| 3 | `/dashboard?vue=analytics` · autorisé (KPI, top créas Meta, diversité, top ROAS, nom long) | owner ; équipe `lecture` | `m55/preuves-f3bace38/prod-f3bace38-analytics-{key-metrics,top-creas-meta,diversite,top-roas,equipe-lecture-autorise,nom-long}-*.png` · `f3bace38` | local | V | données synthétiques, Meta réel jamais branché en recette ; lecteur client Starter prouvé par la garde (`lot19a-analytics-droits`) et non capturé | production avec une marque Meta réelle (item 3, § 4) |
| 4 | `/dashboard?vue=analytics` · refus serveur | équipe `membre`, `freelance` | `m55/…/prod-f3bace38-analytics-refus-{membre,freelance}-*.png` ; journal SQL (0 requête KPI) dans `lot19/a/section-m55.md` · `f3bace38` | local | V | `dev` et `moderateur` couverts par la règle et non capturés | aucun |
| 5 | `/dashboard?vue=analytics` · vide | owner | `lot19/a/prod-f3bace38-vue-analytics-vide-*.png` ; `m55/…/prod-f3bace38-analytics-vide-encart-*.png` · `f3bace38` | local | V | · | aucun |
| 6 | `/analytics` → 307 vers la vue (paramètres et `#attribution`), refus par l'ancien lien | owner ; équipe `membre` | `lot19/a/prod-f3bace38-ancien-lien-ancre-rempli-*.png` ; `m55/…/prod-f3bace38-analytics-refus-ancien-lien-membre-*.png` · `f3bace38` | local | V | registre m57 : la conservation du fragment est prouvée, **pas le défilement réel jusqu'à `#attribution`** | mesurer `scrollY` contre la position de `#attribution` après la 307, aux trois largeurs |
| 7 | Navigation de l'Accueil · rail (sous-entrée Analytics), tiroir 390, fil d'Ariane, Retour, focus clavier | owner | `lot19/a/prod-f3bace38-{focus-rail-clavier,focus-selecteur-clavier,fil-accueil-clic-rempli,fil-accueil-retour-rempli,vue-analytics-par-rail-rempli}-*.png`, `prod-f3bace38-rail-tiroir-ouvert-rempli-390.png` · `f3bace38` | local | P · preuve antérieure à #723 (entrée « Formats ») et #724 (entrée ADMIN+ « Connaissances ») | registre m57 : rail avec nom long, accès sous le pli (« Aperçu » coupé sous « Illimité » dans le tiroir à 390, vu sur capture) ; onglet non restauré après rollback | rail et tiroir au SHA main, Veille dépliée, section ADMIN+ atteinte au clavier |
| 8 | `/admin/connaissances` · liste, titre long, aperçu saturé | fondateur (adminplus) | `lot19/b/m63/prod-44d14e17-connaissances-{liste,titre-long,apercu-sature}-*.png` · `44d14e17` (= arbre main) | local | V | libellé « Portée plateforme » qui agrège aussi les connaissances d'espace et de marque (`EcranConnaissances.tsx:108`) ; confidentialité laissée à la décision du pilotage | aucun |
| 9 | `/admin/connaissances` · publication en portée plateforme (avertissement, refus sans confirmation, publiée après confirmation, case au clavier) | fondateur | `lot19/b/m63/prod-44d14e17-connaissances-{avertissement-plateforme,refus-sans-confirmation,publiee-apres-confirmation,focus-clavier-case}-*.png` · `44d14e17` | local | V | libellé « élargit » pour marque A → espace B (`packages/core/src/connaissances.ts:709`, `changementPortee`) | aucun |
| 10 | `/admin/connaissances` · cycle complet (saisir, coller, importer .md, v2, retirer, rail actif) | fondateur | `lot19/b/admin/prodlocale-f3e5e2b0-connaissances-{vide,import-md,v2-historique,noms-longs}-*.png`, `lot19/b/rail/prodlocale-f3e5e2b0-rail-connaissances-active-{1440,1280}.png` · `f3e5e2b0` | local | P · preuve antérieure à `c48d401`…`44d14e1` (m55 à m63, même PR) | · | rejouer importer, v2 et retirer au SHA main (3 états × 3 largeurs) |
| 11 | `/admin/connaissances` · refus owner et admin d'espace ; admin plateforme non fondateur | owner, admin d'espace, admin plateforme | `lot19/b/admin/prodlocale-f3e5e2b0-garde-owner-espace-renvoye-*.png` · `f3e5e2b0` ; gardes M9/M10/M11 vertes à `44d14e17` | local | P · preuve antérieure à m55 | admin plateforme non fondateur : page rendue mais **aucune entrée de rail** (`isStaff` = fondateur), même incohérence que E1 ; « React error #310 » au refus (préexistant, aussi sur `/admin/equipe`, `/admin`, `/admin/finance`) | refus au SHA main pour 3 rôles |
| 12 | `/jarvis` · autorisé, question, consigne reçue, « Cité » | fondateur | `lot19/b/m63/prod-44d14e17-jarvis-autorise-fondateur-*.png` ; `lot19/b/m63/recette-http.out`, `journal-403-route.json` · `44d14e17` | local (faux fournisseur) | V | aucun vrai modèle (comportement face à la source hostile non mesuré) ; densité à 720 (n° 14) | une question réelle en production, prix annoncé avant (item 5, § 4) |
| 13 | `/jarvis` · refus | membre Starter, `freelance`, `client_viewer` | `lot19/b/m63/prod-44d14e17-jarvis-refus-{starter,freelance,client-viewer}-*.png` · `44d14e17` | local | V | · | aucun |
| 14 | `/jarvis/sources` · refus | admin Starter, owner `freelance` | `lot19/b/m63/prod-44d14e17-sources-refus-{admin-starter,freelance-owner}-*.png` · `44d14e17` | local | V | · | aucun |
| 15 | `/jarvis/sources` · autorisé (Règles, Entraînement, Décrire, mémoire) | owner | `lot15-6737/l15-n-jarvis-sources-390x844.png` · `6737cdda` | local | P · preuve antérieure à #725 et #724 (`sources/page.tsx` +31/−24) | boutons d'IA à 37/40 px (lot N préparé, non lancé) | capture au SHA main, aux trois largeurs, sans clic sur un bouton d'IA |
| 16 | `POST /api/jarvis/chat` · 403 et 200 | Starter, `freelance`, `client_viewer`, fondateur | `lot19/b/m63/journal-403-route.json`, `recette-http.out` · `44d14e17` | local (HTTP) | V | concurrence : plusieurs appels simultanés passent la barrière (n° 18) | aucun |
| 17 | Règles et Entraînement de Jarvis (4 actions) · refus sans effet | admin et owner Starter, owner `freelance`, `client_viewer`, membre Core | `lot19/b/m63/recette-refus.out` · `44d14e17` (20 refus, 0 mutation, 0 appel au fournisseur) ; autorisé : `lot19/b/m56/journal-actions-http.json` · `edd6343a` | local (HTTP) | P (le chemin autorisé est prouvé à `edd6343a`, `actions/jarvis.ts` modifié depuis par la fusion) | dépense Jarvis sans `workspace_id` (`actions/jarvis.ts:57` et `:109` à `70200777`) | chemin autorisé rejoué au SHA main avec le faux fournisseur |
| 18 | `/veille/formats` · liste, compteurs, accord au singulier | fondateur Core | `lot19/c/m57/prod-ba703860-formats-{rempli,accord-classer-ma-sauvegarde,accord-une-a-classer}-*.png` · `ba703860` | local | P · preuve antérieure à `44c5278`/`d08987f` (même PR : `VueFormats` +11, `page` +7) | périmètre « tes sauvegardes classées » seulement | recapture de l'état rempli au SHA main |
| 19 | `/veille/formats` · grille par format, filtres, tri, vignette expirée, nom long, vide | fondateur | `lot19/c/m55/prod-f4f60887-formats-{filtres-ouverts,nom-long,vide}-*.png` · `f4f60887` ; `lot19/c/sha-282d3fb7/prod-282d3fb7-formats-grille-packshot-{rempli,vignette-expiree,vide-filtre}-*.png` · `282d3fb7` | local | P · preuve antérieure à #726 (fusionnée), m56 et m60 | · | grille et filtres au SHA main |
| 20 | `/veille/formats` · refus | `client_viewer`, membre Starter | `lot19/c/m57/prod-ba703860-formats-{refus-lecteur,verrou-starter}-*.png` · `ba703860` | local | P · preuve antérieure à m60 | · | inclus dans l'item 19 |
| 21 | Pont Adsmap depuis Formats · autorisé, refus offre, rôle, marque | fondateur ; Core ; équipe `membre` ; sans marque | `lot19/c/m60/prod-d08987fc-pont-adsmap-{autorise,refus-offre,refus-role,refus-marque}-*.png` · `d08987fc` | local | V | l'explication est en bas de page, et n'est visible qu'en défilant au maximum | aucun |
| 22 | Préparer un test (brouillon « imitation ») | fondateur ; Core refusé | `lot19/c/m57/prod-ba703860-preparer-test-{autorise,cree,refuse-core}-*.png` · `ba703860` | local | P · preuve antérieure à m60 (`VueFormats`) | le brouillon reste « incomplet » : hypothèse, offre et page ne se saisissent pas (rupture n° 1) | inclus dans l'item 1, § 4 |
| 23 | `/saved` · choix « Format » sur la carte | fondateur Core ; membre Starter | `lot19/c/m57/prod-ba703860-saved-format-{autorise,indisponible}-*.png` · `ba703860` | local | P · preuve antérieure à `44c5278` (`SavedBoards` +17) | `/saved` s'ouvre au Starter malgré le cadenas du rail (`saved/page.tsx:26`, rôle seul) | recapture au SHA main |
| 24 | `/saved` · ranger dans un board, échec réseau | fondateur | `lot19/c/m60/prod-d08987fc-sauvegardes-ranger-rejet-*.png` · `d08987fc` | local | V | Starter peut ranger et retirer (`actions/inspo.ts:126-129`, seul le refus « rôle » ; `:148`, `:156`) ; pont Adsmap muet dans Sauvegardes (`SavedBoards.tsx:177`, bouton simplement absent) ; toast à 390 sur l'en-tête collant (`Toast.tsx`, `top: 24` quand la pile passe en haut) | aucun avant décision |
| 25 | ★ Sauvegarder · échec honnête, étoile visible à 390 | Starter ; autre marque | `lot19/c/m57/prod-ba703860-sauvegarde-echec-{etoile-visible,starter-etoile-visible}-*.png` · `ba703860` (`InspoButtons` et `Toast` inchangés depuis) | local | V | · | aucun |
| 26 | Ranger ou retirer par appel direct · refus lecteur client et autre marque | `client_viewer` ; autre marque | `lot19/c/m56/journal-recette-c56-apres.json` · `102ed4c6` (`inspo.ts` inchangé depuis) | local (HTTP) | V | Starter non fermé (dette assumée) | aucun |
| 27 | `/saved` · lot 16 : retirer un concurrent, « Tout marquer vu », focus après vidage | fondateur | `lot16/captures-480b/l16-c1-{rempli,apres-retrait,echec,totalement-vide}-*.png`, `l16-clavier-c1-totalement-vide-1280x720.png` · `480b3a81` | local | P · preuve antérieure à #723 (`saved/` +144, `SavedBoards` +35) ; `MarquesSuivies` et `TrackerFeed` inchangés | scan des nouveautés (service externe) non mesuré | rejouer C1 et C2 au SHA main, 12 répétitions à 1280 |
| 28 | `/saved` · lecteur client redirigé | `client_viewer` | `lot19/c/prod-c3a0a2f7-lecteur-client-saved-redirige-*.png` · `c3a0a2f7` | local | P · preuve antérieure à m55 à m60 (garde de page inchangée, `saved/page.tsx:26`) | · | aucun (la garde est inchangée) |
| 29 | `/veille` · recherche, page 2, carte, « Ses annonces », retour Studio, vide | owner | `lot18/recette-0c32453e/dev-loopback-0c32453e-V1…V7-*.png` (serveur de dev), `prod-0c32453e-{E1,E2,P1}-*.png` · `0c32453e` | local (dev pour la pagination) | P · preuve antérieure à #723 (★) ; pagination prouvée en dev seulement | source réelle jamais testée ; un seul rôle ; recherche par formats absente de la Veille | demande C, § 1.6 |
| 30 | `/veille/scale` · filtres dans l'URL, rechargement, Retour, fil à 44 px au clavier | owner | `lot19/cadre/captures-722/build-local-prod-a68aa681/build-local-prod-a68aa681-scale-{clavier,filtres}-*.png` · `a68aa681` ; `lot18/recette-0c32453e/prod-0c32453e-S1…S3-*.png` | local | P · preuve antérieure à #723 (★ du swipe file) ; page inchangée | · | aucun prioritaire |
| 31 | `/radar` (Radar créatif) | owner | `lot19/d/preuves-8f26ce58/prod-8f26ce58-radar-bandeau-court-*.png` ; `lot19/cadre/captures-722/…/build-local-prod-a68aa681-radar-nom-long-*.png` · `8f26ce58`, `a68aa681` | local | P (cadres seulement ; parcours vu au lot 7) | comptage par espace, doublon d'un `externalId` dans un même passage (`lib/radar.ts`, COMPLEMENTS § 3) | · |
| 32 | `/tags` (échantillon fixe) | membre et plus | `lot19/d/preuves-8f26ce58/prod-8f26ce58-tagging-bandeau-court-*.png` · `8f26ce58` (page inchangée) | local | V | page de démonstration (`fixtures.tagged`) | aucun |
| 33 | `/studio` (hub) | owner | `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-studio-*.png` · `8f26ce58` | local | P (cadres seulement) | Studio exclu de toute recette en production (#125) | · |
| 34 | `/studio/image` · galerie paginée, « Suivre dans Adsmap » (R3), composeur | owner | `lot17/final/r3-*`, `lot17/compl/r3-*` · `f4f44845` ; `lot13/l13-image-page1-*.png` · `d820645` ; `lot19/d/preuves-8f26ce58/prod-8f26ce58-image-ia-composer-tuile-*.png` · `8f26ce58` | local | P · preuve antérieure à #722/#725 (`studio/image` +10/−8) | une seule fiche par génération (frontière du lot 17) ; photo réelle jamais téléversée ; #125 | R3 rejoué au SHA main (item 1, § 4) |
| 35 | `/studio/video` | owner | `lot13/l13-video-page1-*.png` · `d820645` ; `lot19/d/preuves-8f26ce58/prod-8f26ce58-video-ia-composer-tuile-*.png` · `8f26ce58` | local | P | délai Vidéo 15 ou 20 min (n° 5) ; `<video>` sans nom au Tab (n° 8) ; lecture réelle jamais validée | · |
| 36 | `/studio/textes` | owner | `lot12/l12-textes-ticket-*.png` · `db53467` ; `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-studio_textes-*.png` · `8f26ce58` | local | P | génération inactive (clé absente, configuration) | · |
| 37 | `/studio/ads` (Pubs IA) · assistant, reprise du brief d'itération (R2) | owner | `lot17/final/r2-*`, `lot17/compl/r2-*` · `f4f44845` ; `lot19/d/preuves-8f26ce58/prod-8f26ce58-pubs-ia-filtres-ouverts-*.png` · `8f26ce58` | local | P · preuve antérieure à #722/#725 (`studio/ads` +38/−25) | #125 ; filiation non écrite (rupture n° 2) ; couverture st-avant/st-final 1–8 et 25–49 non relue (n° 13) | item 1, § 4 |
| 38 | `/adsmap` · fiche (ad incomplète, complète), tiroir, lien profond | owner | `lot17/final/r1-fiche-v32-*`, `lot17/compl/r1-fiche-complete-*` · `f4f44845` ; `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-adsmap-*.png` · `8f26ce58` | local | P · preuve antérieure à #722/#725 (`adsmap/page.tsx` +5/−5, `AdDrawer` +3/−2) | ad jamais « prête » par l'écran (n° 1) ; tirets cadratins dans le tiroir (n° 7) | item 1, § 4 |
| 39 | `/adsmap/lots` · vivier, lot planifié | owner | `lot17/final/r1-lots-*`, `lot17/compl/r1-vivier-complete-*` · `f4f44845` ; `lot19/cadre/captures-722/…/build-local-prod-a68aa681-lots-rempli-*.png` | local | P · preuve antérieure à #725 (`lots` +14/−10) | lancement sans confirmation (`Lots.tsx:115-123`) | item 1, § 4 |
| 40 | `/adsmap/suites`, `/tri`, `/protocole`, `/radar`, `/import` | owner | `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-adsmap_{suites,tri,protocole,radar,import}-*.png` · `8f26ce58` ; parcours aux lots 7 à 9 (`l7-*`, `l8-*`, `l9-*` à la racine de `SP`) | local | P (cadres à jour ; parcours antérieurs à #718) | parent de suite perdant reproposé ; Suites `limit(400)` (`adsmap-iterate.ts:100`) ; import non transactionnel ; arêtes non comparables ; Tri sans nom de ligne | · |
| 41 | `/adsmap/jarvis` → `/jarvis` | owner | `lot15-6737/l15-n-redirection-adsmap-jarvis-1280x720.png` · `6737cdda` (dossier inchangé) | local | V | la destination refuse désormais Starter, `freelance` et `client_viewer` (voulu, #724) | aucun |
| 42 | `/brands` · liste, focus clavier | owner, admin | `lot19/d/preuves-8f26ce58/prod-8f26ce58-marques-focus-clavier-*.png` · `8f26ce58` | local | P (cadres et focus ; noms longs vus au lot 6) | · | · |
| 43 | `/brands/[id]` · fiche, palette, logos, Styles et Brand kits | owner, admin | `lot19/d/preuves-8f26ce58/prod-8f26ce58-fiche-marque-nom-long-*.png` · `8f26ce58` ; `…/build-local-prod-a68aa681-fiche-marque-nom-long-*.png` · `a68aa681` | local | P | D1 et D2 (§ 1.7, 1.8) ; ScenarioCard « Générer » en succès non mesuré (payant) | demande D1 |
| 44 | `/brands/new` | owner, admin | `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-brands_new-*.png` · `8f26ce58` | local | P (cadres seulement) | · | · |
| 45 | `/brands/[id]/competitors/[name]` | owner, admin | `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-brands_neva_competitors_Exemple-*.png` · `8f26ce58` | local | P (cadres seulement) | · | · |
| 46 | `/assets` | membre et plus | `lot19/d/preuves-8f26ce58/prod-8f26ce58-assets-vide-nom-long-*.png` · `8f26ce58` | local | P (vide seulement ; rempli au lot 11) | Drive inactif (configuration) | · |
| 47 | `/team` · **déjà corrigé** (garde admin avant toute lecture) | owner, admin, member, `client_viewer` | `SP/l9-team-{owner,admin,member,client_viewer}-1280x720.png` · `68d19a3` (lot 9, accepté) ; `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-team-*.png` · `8f26ce58` (owner) ; garde `apps/web/test/team-acces-garde.test.tsx` | local | P · visuel des 4 rôles antérieur à #722/#725 (styles) ; garde présente à `team/page.tsx:38` | P3 historique distinct (§ 3.1) ; rôles et retrait de membre absents ; invitations en doublon | 4 rôles au SHA main (un seul format suffit) |
| 48 | `/billing` | owner, admin | `lot19/cadre/captures-722/…/build-local-prod-a68aa681-facturation-rempli-*.png` · `a68aa681` ; `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-billing-*.png` · `8f26ce58` | local | P (owner seulement) | l'illimité est par utilisateur, le solde par espace (n° 11) ; P3 (`billing/page.tsx:35`, rôle seul) | · |
| 49 | `/usage` | owner, admin | `SP/l9-usage-{1280x720,limite-1280,limite-390}.png` (lot 9) ; `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-usage-*.png` · `8f26ce58` | local | P | P3 (`usage/page.tsx:23`) | · |
| 50 | `/credits` (coûts et marges) | fondateur | `lot19/d/preuves-8f26ce58/prod-8f26ce58-credits-focus-clavier-*.png` · `8f26ce58` | local | P (focus ; historique au lot 11) | journal et solde non atomiques (`lib/credits.ts:46-51`) | · |
| 51 | `/settings` + réglages rapides (C4) | owner, admin | `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-settings-*.png` · `8f26ce58` ; C4 dans `lot16/captures-480b/` · `480b3a81` | local | P (C4 : `QuickSettingsModal` inchangé, `AppShell` modifié) | P3 (`settings/page.tsx:22`) | · |
| 52 | `/connections` | owner, admin | `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-connections-*.png` · `8f26ce58` | local | P | Meta, Shopify et Google réels jamais connectés en recette ; D2 #120 | · |
| 53 | `/profile` + fenêtre profil (C5) | tous | `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-profile-*.png` · `8f26ce58` ; C5 · `480b3a81` | local | P | · | · |
| 54 | `/support` | tous | `lot19/d/preuves-8f26ce58/prod-8f26ce58-support-vide-*.png` · `8f26ce58` | local | P (vide seulement ; liste au lot 8) | pas de réouverture, pas de pagination ; support non routé vers la plateforme | · |
| 55 | `/support/[id]` | auteur, admin | `SP/l9-ticket-1280x720.png`, `l9-ticket-bas-1280x720.png` (lot 9) | local | P (antérieur à #718 et #725 ; non mesuré par #725, faute de ticket) | · | · |
| 56 | `/onboarding` | nouvel owner | aucune capture datée retrouvée (« R, sujet 3, `da56c73` » selon le lot 13, sans fichier) | · | N | · | 4 écrans aux trois largeurs, Retour et Passer |
| 57 | `/invite/[token]` | invité | aucune capture de la page (le lot 9 n'a capturé que la fenêtre d'invitation de `/team`) | · | N | délai de 21 s intermittent (n° 10) ; lien de repli vers la production si `APP_URL` manque (`lib/mailer.ts:22`) | jeton valide, expiré et faux, sans envoi |
| 58 | `/c/[token]` (partage client) | anonyme | aucune capture datée retrouvée (« R, `8206e21` » selon le lot 13, sans fichier) | · | N | · | jeton valide et faux |
| 59 | `/console` | fondateur | `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-console-*.png` · `8f26ce58` (page inchangée) | local **et production (SHA servi `70200777` constaté)** | V | cibles sous 44 px (lot N préparé) | aucun |
| 60 | `/admin` (tableau des coulisses) | fondateur | aucune mesure de cadres ; garde de rendu `lot19b-m55-cadres-rendu` (carte `/admin`) à `44d14e17` | local (test) | P (`admin/page.tsx` +11 dans #724, jamais capturé) | « React error #310 » au refus | capture au SHA main |
| 61 | `/admin/{depenses,finance,incidents,intelligence,paiement,plans,signups}` · rendu | fondateur | `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-admin_{depenses,finance,incidents,intelligence,paiement,plans,signups}-*.png` · `8f26ce58` (pages inchangées) | local | V (rendu en lecture) | cibles sous 44 px (filtres d'incidents, liens d'intelligence, bouton de paiement) ; plafond 50 $ contre 10 $ (n° 19) | · |
| 62 | Coulisses · refus d'un admin non fondateur | admin d'espace non fondateur | `lot15-6737/l15-n-coulisses-refus-admin-1280x720.png` · `6737cdda` | local | P · preuve antérieure à #722/#725 (`admin/finance` +6/−6) | · | · |
| 63 | `/admin/equipe` | accès total (adminplus, admin) | aucune capture de recette datée ; audit du code seulement (`lot15/ADMIN-EQUIPE-matrice.md`, `f967cf1`) | · | N (fichier inchangé depuis `a40feb7`, hors de toute recette par consigne) | E1 à E8, **E5** ; 122 cibles sur 136 sous 44 px | aucun (interdit sans décision) |
| 64 | `/login`, `/signup`, `/forgot` | anonyme | `lot15-6737/l15-n-{login-oublie-focus-390x844,signup-1440x900,forgot-retour-focus-390x844,forgot-envoye-retour-390x844}.png` · `6737cdda` (dossiers inchangés depuis) | local | V (cibles et focus mesurés) | **E5** : inscription sans vérification d'e-mail (`actions/auth.ts:24-54`) ; aucun envoi de courriel testé | · |
| 65 | `/reset/[token]` | anonyme | `lot15-6737/l15-n-reset-faux-390x844.png` · `6737cdda` | local | P (jeton faux seulement) | jetons valide et expiré non joués | jeton synthétique valide et expiré |
| 66 | `/legal/*` | anonyme | `lot15-6737/l15-n-legal-1440x900.png`, `l15-n-legal-cgv-entete-390x844.png` · `6737cdda` | local | V | les CGV promettent encore un report partiel des crédits (`legal/cgv/page.tsx:22`), jamais appliqué | · |
| 67 | `/tarifs` | anonyme, connecté | `lot15-6737/l15-n-tarifs-focus-bascule-1280x720.png` · `6737cdda` | local | P (focus seulement ; prix contre catalogue jamais comparés) | · | comparer les prix affichés à `PLAN_PRICE`, sans achat |
| 68 | Sélecteur de marque · confirmation avant d'effacer une saisie, échec, attente | owner | `lot15-6737/l15-{attente,echec}-bascule-*.png`, `l15-jarvis-{confirmation,apres-garder}-*.png` · `6737cdda` | local | P · preuve antérieure à #722-#726 (`AppShell` +43/−14) | registre m57 : rail avec nom long | bascule au SHA main, depuis `/dashboard?vue=analytics` |
| 69 | Boucle de bout en bout · Veille → sauvegarde → Format → test → Studio (itération) → Adsmap | owner | morceaux seulement : items 22, 34, 37 et 38 (`ba703860`, `f4f44845`) | local | P (jamais jouée d'un seul tenant) | ad « prête » impossible par l'écran (n° 1) ; enfant non rattaché à son parent (n° 2, dit à l'écran depuis le lot 17) | item 1, § 4 |

**Décompte des 69 lignes** (recompté par script sur la colonne de statut) : **22 validées**, **43 partielles**, **4 non testées**.
- V : 1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 14, 16, 21, 24, 25, 26, 32, 41, 59, 61, 64, 66 ;
- N : 56 (`/onboarding`), 57 (`/invite/[token]`), 58 (`/c/[token]`), 63 (`/admin/equipe`) ;
- P : les 43 autres, dont la boucle de bout en bout (69), jouée seulement par morceaux.

Une seule ligne est constatée en production : `/console`, pour le SHA servi. Les 22 validées le sont en **local**.

---

## 3 · Registre conservé (rien n'est fermé sans preuve)

### 3.1 · `/team` déjà corrigé, à distinguer de P3 historique

| | `/team` déjà corrigé | P3 historique |
| --- | --- | --- |
| Définition | `/team` exposait les e-mails des membres et les liens d'invitation aux rôles non admin | lot 12, `MATRICE-GLOBALE-lot12.md` : « pour un membre de l'équipe plateforme admin de son espace, la matrice de l'équipe masque des rubriques mais les pages et actions ne vérifient que `s.role` ; il y accède par l'URL » (`billing:35`, `team:38`, `jarvis:31`, `actions/admin.ts:76`) |
| Correction | `68d19a3`, lot 9, autorisée par Kevin : `if (!roleAtLeast(s.role,'admin')) redirect('/dashboard')` **avant** toute lecture | aucune décision « la matrice protège, ou masque seulement » |
| Sur main | via #718, squash `ad012d31` (fusion 04/10), présent à `70200777`, `team/page.tsx:38` | sans objet |
| Preuve | `SP/l9-team-{owner,admin,member,client_viewer}-1280x720.png` à `68d19a3`, acceptés au lot 9 ; garde `team-acces-garde.test.tsx` ; cadres `lot19/d/apres-8f26ce58/prod-apres-8f26ce58-team-*` | sans objet |
| Ce qui a bougé depuis | styles seulement (#722, #725) | **fermé par morceaux, sans décision d'ensemble.** Ces chemins appliquent désormais `canAccess` : Jarvis (`/jarvis`, `/jarvis/sources`, la route du chat, `chatThreadAction`, les 4 actions Règles et Entraînement, via #724 `70200777`), la vue Analytics (#726 `6441f14`), `/veille/formats` et le choix de format (#723 `ae76fa1`) ; Veille, Scale, Radar, Studio et Adsmap l'appliquaient déjà |
| Ce qui reste exactement | rien sur la fuite. Le visuel des 4 rôles est antérieur aux styles de #725 | **pages au rôle d'espace seul**, alors que la matrice porte une rubrique : `billing/page.tsx:35` (facturation), `team/page.tsx:38` (equipe), `usage/page.tsx:23` (usage), `settings/page.tsx:22` (reglages), `connections/page.tsx:103` (connexions), `brands/page.tsx:32` et `brands/[id]/page.tsx:57` (marques), `assets/page.tsx:19` (assets), `saved/page.tsx:26` (saved). Côté **actions** : `actions/admin.ts:66` (`updateWorkspaceAction`) et `:76` (`saveWorkspaceNameAction`), au rôle seul. Lien avec E7 : la rubrique `equipe` ouvre `/team`, pas `/admin/equipe`. Statut **ouvert, sans relance** (consigne du lot 20) |

### 3.2 · E5, P1, P2, #125 · définitions et dernière preuve

| Entrée | Définition exacte (source) | Dernière preuve, SHA | État à `70200777` |
| --- | --- | --- | --- |
| **E5** | « Rôle accordé à un e-mail non inscrit + inscription sans vérification d'e-mail » : un accès total ajoute `x@…` en `admin`, et un tiers qui s'inscrit le premier avec cette adresse obtient l'accès total, les crédits illimités et la formule business (`lot15/ADMIN-EQUIPE-matrice.md`) | lecture du code à `f967cf1` (lot 15) ; aucune preuve d'exécution | **inchangé** : `actions/auth.ts` (signup, l. 24-54, aucune vérification d'e-mail) n'a pas changé depuis `c98d1c6` ; `actions/equipe.ts` depuis `885c61a` ; `admin/equipe/page.tsx` depuis `a40feb7`. Recommandation prioritaire n° 5 du lot 15, sans décision. Avec E1 à E4, E6 à E8 |
| **P1** | « `askAssistant` ne vérifie aucun rôle ; un `client_viewer` débite 1 crédit et lance un appel IA payant » (`lot12/MATRICE-GLOBALE-lot12.md`) | lecture du code à `db53467` (lot 12) ; soumis à Kevin, pas de réponse | **inchangé** : `apps/web/app/actions/assistant.ts:17-48`, fichier intact depuis `8866056`. Session vérifiée, aucun `roleAtLeast` ni `canAccess` avant `reserveCredits` |
| **P2** | « `history` vient du client et n'est pas validé ; plusieurs appels simultanés passent le contrôle avant la première inscription » | lecture du code à `db53467` | **inchangé** : `assistant.ts:43` passe `[...history, …]` tel quel ; `packages/ai/src/chat.ts` intact depuis `8866056` |
| **#125** | « `/api/ad/[id]` écrit à la consultation » (registre du lot 13, n° 12) | lecture du code (lot 13) ; Studio exclu de toute recette en production depuis | **inchangé** : `apps/web/app/api/ad/[id]/route.tsx:94` met à jour `generations.input` lors d'un GET ; `rangerRendu` écrit le rendu (l. 161). Dernier commit sur le fichier : `fc24093`. La tâche « #125 » n'est pas la PR GitHub #125 (une ancienne PR fermée, sans rapport) |
| R (lot 12) | `ai_spend` inscrit sans `workspace_id` | lecture du code à `db53467` | **ouvert** : `assistant.ts:23`, `actions/jarvis.ts:57` et `:109` (le registre du lot 20 citait 51 et 103, numéros d'avant #724), `ads.ts:1051`, `:1355`, `:1455`, `:1768`, `:1954`, `brand-detail.ts`, `brands.ts`, `competitor.ts`, `assets.ts`, `adsmap-analyze.ts`, `adsmap-propose.ts`. La route du chat de Jarvis passe `workspaceId` (`route.ts:56`) |

### 3.3 · Dettes ouvertes du registre du lot 20, conservées intégralement

| Dette | Où, à `70200777` | Origine |
| --- | --- | --- |
| Support mobile et focus partiellement masqué à 390 | lanceur ancré, focus clavier | registre m57 |
| Hauteurs des commandes entre cartes | cartes à commandes de hauteurs inégales | registre |
| Onglet non restauré après rollback | restauration après un refus ou un retour arrière | registre |
| Libellé « portée plateforme » qui agrège aussi les connaissances d'espace et de marque | `admin/connaissances/EcranConnaissances.tsx:108` | #724 |
| Libellé « élargit » pour marque A → espace B | `packages/core/src/connaissances.ts:709` (`changementPortee` → `elargie`) | #724 |
| UX m57 · hauteur du héros et de l'introduction sur mobile | Accueil 390 | #726 |
| UX m57 · rail avec nom long, accès sous le pli | tiroir 390 : « Aperçu » sous « Illimité », vu sur `prod-f3bace38-rail-tiroir-ouvert-rempli-390.png` | #726 |
| UX m57 · copie « Analyse tes résultats » sur un Accueil restreint | vue sur `prod-f3bace38-sans-droit-accueil-rempli-390.png` | #726 |
| UX m57 · préservation du fragment distincte du défilement réel vers `#attribution` | `/analytics` → 307 | #726 |
| UX m57 · provenance du tag dans l'état zéro créa | Accueil | #726 |
| Angle mort de la garde #725 (carte-lien avec `CIBLE_TACTILE_MIN`) | `apps/web/test/lot19d-cadres-source.test.ts:130` | #725 |
| Dépense Jarvis sans `workspace_id` | `actions/jarvis.ts:57`, `:109` (ex-51, 103) | lot 12 R |
| Starter peut sauvegarder et retirer | `actions/inspo.ts:126-129` (refus « rôle » seul), `setSavedAdFolder` `:148`, `unsaveAd` `:156` ; `/saved` ouvert au Starter (`saved/page.tsx:26`) | #723 |
| Pont Adsmap muet dans Sauvegardes | `components/SavedBoards.tsx:177` (bouton absent sans droit, aucune raison) | #723 |
| Toast à 390 sur l'en-tête collant | `components/Toast.tsx` (`top: 24` quand la pile passe en haut) ; l'en-tête finit vers 65 px | #723 |
| E5, P1, P2, P3, #125 | § 3.1 et § 3.2 | lots 12, 13 et 15 |

### 3.4 · Registre historique (lots 12, 13, 16 et 17) · ouvert, ou traité avec sa preuve

| n° (lot 13) | Entrée | État à `70200777` |
| --- | --- | --- |
| 1 | Ad « prête » : aucune écriture d'hypothèse, de variable, d'offre ni de page sur une ad existante | **ouvert, rupture**. Les manques sont dits à l'écran depuis #720 (`98fd2d6`) ; la saisie reste impossible |
| 2 | Filiation `?iter` non transmise | **ouvert, rupture**. L'absence est dite dans le panneau (#720), 0 arête écrite |
| 3 | Identifiant composite dans « Suivre dans Adsmap » | **traité** par #720 (R3, `f4f44845`), preuves `lot17/final/r3-*` ; reste : une fiche par génération |
| 4 | « Noter 2 cr. » jamais débité | ouvert, décision de prix |
| 5 | Délai Vidéo de 15 ou 20 min | ouvert |
| 6 | Offres et pages de destination absentes | ouvert, dépend du n° 1 |
| 7 | Tirets cadratins dans le tiroir Adsmap | ouvert |
| 8 | `<video>` sans nom au Tab | ouvert |
| 9 | Branche « crédits limités » | capturée au lot 9 (`SP/l9-usage-limite-{1280,390}.png`), antérieure à #718 · partiel |
| 10 | Invitation, délai de 21 s | ouvert |
| 11 | Illimité par utilisateur, solde par espace | ouvert, décision produit |
| 12 | #125 | § 3.2 |
| 13 | Couverture Studio st-avant/st-final non relue | ouvert |
| 14 | Densité de Jarvis à 720 | ouvert (§ 1.5) |
| 15 | P1 | § 3.2 |
| 16 | P2 | § 3.2 |
| 17 | P3 | § 3.1 |
| 18 | Concurrence : plusieurs appels passent la barrière | ouvert |
| 19 | Plafond de 50 $ observé contre 10 $ dans la règle | ouvert, arbitrage du propriétaire (`.env.deploy`) |
| 20 | R · `ai_spend` sans `workspace_id` | § 3.2 |
| 21 | #716 publication bloquée | **clos** : #715, #716 et #717 fermées le 04/10, remplacées par #718 fusionnée (`ad012d31`) |
| 22 | Lien Coulisses sans garde de rendu | ouvert (non revérifié) |
| 23 | Nom de marque tronqué au rail | traité au lot 14 (`3a8aeb6`), via #718 ; registre m57 : nom long au rail |
| 24 | Textes inactif | configuration |
| 25 | Drive inactif | configuration |
| 26, 27 | Galeries Image et Vidéo limitées à 24 | traité `7feafce`, via #718 |
| 28 | Nom long de l'Accueil par `title` | traité `d820645`, via #718 |
| 29 | Sélecteur de marque qui n'applique pas | traité au lot 14 (`3f8c133`), via #718 ; preuve `lot14/l14-*` |

Entrées du registre historique (`lot13/COMPLEMENTS-lot13.md` § 3, et `lot16` § 7), toutes **inchangées** :
- support non routé vers la plateforme ;
- fuite possible de « Trendtrack » par une erreur amont (`integrations/src/trendtrack.ts:118`) ;
- prix de Jarvis non débité ;
- parent de suite perdant reproposé ;
- brouillon Jarvis perdu ;
- import non transactionnel ;
- arêtes non comparables ;
- Radar compté par espace ;
- Suites `limit(400)` ;
- `APP_URL` de repli (`lib/mailer.ts:22`) ;
- crédits non atomiques ;
- report de 25 % promis dans les CGV ;
- Lots sans confirmation ;
- Tri sans nom de ligne ;
- rôles et retrait de membre absents ;
- invitations en doublon ;
- support sans réouverture ni pagination.

Autres entrées conservées :
- les 10 autres appels `router.refresh()` dans 8 fichiers (inventaire du lot 16, non remesuré ; le texte `router.refresh()` apparaît 22 fois dans 17 fichiers à `70200777`, commentaires compris) ;
- lot N préparé : cibles sous 44 px en coulisses, boutons d'IA de `/jarvis/sources`, titres d'onglet ;
- fil « Veille » de Scale à 20 px : corrigé par #722 (44 px), preuve `scale-clavier` à `a68aa681` ;
- frontières du lot 17 : filiation, complétude, une fiche par image ;
- recette globale **non close**.

---

## 4 · Prochain lot de recette à impact réel (5 items, classés par impact sur le cap produit)

Le cap produit : « créer des créatives winneuses… faire et gérer les hypothèses, les itérations ».

Sont exclus, et le restent :
- Studio en production (#125) ;
- relance de E5, P1, P2 et P3 ;
- toute dépense non annoncée.

### 1 · La boucle d'itération jouée d'un seul tenant, au SHA main (local)
**Parcours** :
1. Une sauvegarde est classée (`/saved`).
2. Format, puis « Préparer un test » (`/veille/formats`).
3. Fiche Adsmap : ce qui manque.
4. Gagnante, puis « Préparer l'itération ».
5. `/studio/ads?iter`, aller-retour vers Image, puis reprise du brief.
6. « Suivre dans Adsmap » depuis Image.
7. Retour sur la fiche.

**Couverture** : lignes 22, 34, 37, 38, 39 et 69, aujourd'hui partielles parce que leurs preuves précèdent #722, #725 et #723.

**Rôles** : owner Plus (Adsmap), membre Core (pont refusé), autre marque.

**But** : mesurer **où** la boucle casse sur l'arbre publié (ruptures n° 1 et n° 2) et le produire en un seul journal. C'est la base du lot de code suivant : saisie de l'hypothèse et de la variable, filiation.

**Coût** :
- un agent, une session ;
- environ 10 états × 3 largeurs, soit 30 captures ;
- fixtures des lots 17 et 19C réunies ;
- 0 € : « Générer » n'est jamais cliqué, `FAL_KEY` est factice.

**Risques** :
- le chemin Studio est payant : s'arrêter avant tout bouton de génération ;
- `/api/ad/[id]` écrit en GET (#125), dans la base locale seulement ;
- le brouillon d'itération vit dans le stockage du navigateur : le vider entre largeurs.

### 2 · Formats v1 · essai sur un lot réel de sauvegardes (production, propriétaire)
**Décision visée** : n° 2 du dossier du lot 18, § 6.

**Ce que fait le propriétaire** : il classe 20 à 30 de ses vraies sauvegardes, puis ouvre `/veille/formats` et la grille d'un format.

**Ce qu'on mesure** :
- le temps passé par annonce ;
- le taux de `autre` et d'`incertain` ;
- l'accord entre deux personnes sur 10 annonces (double annotation).

**Impact** : c'est la source d'hypothèses par format que Kevin a exigée le 04/10. Sans usage réel, la v2 IA ne peut pas atteindre son seuil de Wilson (16/16 par classe).

**Coût** : 30 à 45 minutes du propriétaire, 0 € (aucune IA).

**Risques** :
- écritures réelles dans `saved_ads.snapshot_json`, voulues : ce sont ses propres données ;
- dette Starter (`/saved` ouvert) ;
- ne pas cliquer « Préparer un test » sur une marque cliente sans le vouloir : cela crée un brouillon Adsmap.

### 3 · Analytics avec une marque Meta réelle (production, lecture seule, propriétaire)
**Couverture** : lignes 3 et 6, plus deux dettes m57 (fragment contre défilement réel, copie restreinte).

**Ce que fait le propriétaire**, sur une marque branchée à Meta :
- `/dashboard?vue=analytics` : KPI, top créas, `#attribution` ;
- l'ancien lien `/analytics#attribution` : arrive-t-on **visiblement** à l'attribution ?

**Impact** : c'est l'étape « résultats → apprentissage » de la boucle. Elle n'a jamais été vue avec de vraies données.

**Coût** : environ 15 minutes, 0 €.

**Risques** :
- données client réelles à l'écran : ne rien coller dans le fil, ou flouter ;
- la session ne peut pas joindre `app.tiktrends.co`, donc tout passe par le propriétaire.

### 4 · Constat de production des trois lots publiés (lecture seule, propriétaire)
**Liste courte**, avec le compte du propriétaire :
- Accueil et sélecteur « Accueil · Analytics » ;
- `/veille/formats` (liste, puis vide si aucune sauvegarde classée) ;
- `/admin/connaissances`, avec l'avertissement « portée plateforme » visible, **sans rien publier** ;
- `/jarvis` affiché, **sans question** ;
- `/console` : `70200777`.

S'il existe déjà un compte réel de rôle restreint (équipe `membre` ou espace Starter), vérifier aussi le refus de la vue Analytics et de Jarvis. N'en **créer aucun** (E5).

**Impact** : faire passer de « local » à « production constatée » les lignes 1, 3, 8, 12 et 18. C'est faible pour la création, mais c'est ce qui lève le doute sur l'arbre servi.

**Coût** : environ 15 minutes, 0 €.

**Risques** :
- une publication accidentelle d'une connaissance en portée plateforme serait lue par tous les clients : ne cocher aucune case ;
- ne pas ouvrir le Studio.

### 5 · Jarvis + Connaissances en réel · une question, prix annoncé avant (production, propriétaire)
**Parcours** :
1. Publier une connaissance **anodine**, de type méthode d'itération, en portée **marque**, puis poser une question qui l'utilise.
2. Lire « Cité », puis retirer la connaissance.

**Ce qu'on mesure** : le comportement réel du modèle face au bloc délimité, et la citation déclarée. Ce n'est jamais mesuré, puisque la recette repose sur un faux fournisseur.

**Impact** : la qualité des conseils d'itération de Jarvis.

**Coût** :
- une réponse Jarvis, sous `sousPlafond` ;
- le prix en dollars est à **annoncer avant le clic** : l'estimer depuis la dépense réelle affichée dans `/admin/depenses`, ne pas le poser de tête ;
- environ 10 minutes.

**Risques** :
- la portée marque évite la diffusion à tous les clients ;
- le texte doit être non confidentiel ;
- retirer la connaissance immédiatement après.

**Exclus de ce lot, mais à arbitrer par le propriétaire** :
- P3, à savoir protéger ou seulement masquer (§ 3.1) ;
- E5 ;
- la dette Starter de `/saved` ;
- les dettes mobiles 390 (m57, toast sur l'en-tête collant) : impact visuel, faible sur le cap.

---

## 5 · Limites de cet audit
- Aucune exécution : les états « V » reposent sur les dossiers, les journaux et les diffs, pas sur un rejeu.
- La règle « fichiers propres à la route » demande un jugement. Les changements de coquille (rail +Formats, entrée ADMIN+ Connaissances, `Toast` à ancre) sont listés au § 0. Ils sont classés hors de l'état capturé seulement quand une capture le montre : Veille repliée dans le tiroir à 390. Confiance moyenne sur ce point pour les lignes 1 à 6.
- Les captures sans SHA dans leur nom (`h3-*`, `h4-*`, `b2-*`) n'ont pas été retenues. Celles des lots 8, 9, 11, 12, 13 et 17 tiennent leur SHA du dossier du lot et du nom de répertoire, pas du nom de fichier.
- Les lignes du code citées le sont à `70200777`. Les numéros du registre d'origine peuvent différer : par exemple `jarvis.ts` 51 et 103 sont devenus 57 et 109.
