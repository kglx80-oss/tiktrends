# Spatial · l'interface de TikTrends (mandat Kevin du 27/10)

Kevin a remplacé la DA V5 par la maquette **Spatial** de Claude Design. Objectif :
**pixel perfect de la maquette, chaque contrôle réellement branché**. Spatial est
désormais la **seule** interface de l'application authentifiée · ce dossier est la
référence vivante (`docs/ux-v5/` n'est plus que de l'historique).

## Ce qu'il contient

| Quoi | Où |
| --- | --- |
| La maquette d'origine (hors ligne, autonome) | `maquette/TikTrends_Spatial_hors_ligne.html` |
| Un fragment HTML de référence par écran (78), plus la coquille et ses surcouches (`_*.html` · palette, profil, notifications, Jarvis, parcours d'accueil) | `reference/<route>.html`, `reference/_coquille.html` |
| L'index des écrans (route, section, titre) | `reference/_index.json` |
| La table écran → adresse réelle → vue | `MATRICE.md` |

Ouvrir la maquette : la charger dans un navigateur, `#<route>` affiche un écran
(ex. `#veille`). `localStorage["tt-onb-done"]="1"` masque le parcours d'accueil.

Ces fichiers sont lus par des tests · `maquette/` par `spatial-fondation`
(extraction de `spatial.css`), `reference/` par la garde de parité, la ligne
« Formats : … » de `MATRICE.md` par `packages/core/test/spatial-formats.test.ts`.
Ne pas les renommer ni les reformater sans lancer ces tests.

## L'architecture

Chemins relatifs à `product/apps/web/` sauf mention contraire.

- **Routage** · `middleware.ts`, deux étapes, sans lire ni session ni base :
  1. **Adresses retirées** · `redirectionServeur` (`packages/core/src/redirections-serveur.ts`)
     sert en vraie 307 HTTP, avant tout rendu, chaque entrée de
     `REDIRECTIONS_SERVEUR` · les anciennes adresses de création (`/studio`,
     `/studio/ads`, `/studio/image`, `/studio/video`, `/studio/textes`, vers les
     projets Studios, contexte repris par `destinationAncienneAdresse`) et
     `/adsmap/jarvis` (vers `/jarvis`). Leurs pages `redirect()` restent en
     **filet** si le middleware ne tournait pas · `app/studio/…` (hors coquille,
     ni layout ni `loading.tsx`) et la page Spatiale `sp/adsmap/jarvis`. Garde
     `test/middleware-redirections.test.ts` (chaque adresse, sa cible exacte, le
     `matcher` de Next les couvre toutes).
  2. **Écran porté** · `ecranSpatial` (`packages/core/src/spatial/bascule.ts`)
     réécrit toute adresse déclarée vers l'arbre interne `app/(spatial)/sp/…` ·
     l'adresse du navigateur ne change pas. La section d'accent part dans
     l'en-tête `x-tt-section` (lu par le layout racine · `body[data-sec]`), le
     chemin public dans `x-tt-chemin`.

  Une adresse ni retirée ni portée passe inchangée · page publique (connexion,
  inscription, mot de passe, tarifs, mentions, vue client partagée `/c/…`,
  invitation, page d'accueil publique), route (`/analytics` est une 307 de route
  handler, `app/analytics/route.ts`), sinon **404** normale de Next (aucune page
  `not-found` dédiée).
- **Déclarer un écran** · une entrée `{ chemin, section }` dans
  `packages/core/src/spatial/ecrans/<rubrique>.ts` + sa page sous
  `app/(spatial)/sp/<chemin>/page.tsx`. La garde `test/spatial-fondation.test.tsx`
  (« écrans portés ⇔ pages de l'arbre ») refuse un chemin déclaré sans page et une
  page sans déclaration ; « l'ancienne interface (V5) est retirée » refuse le
  retour d'un groupe `(app)`, d'un lien `?ui=` ou d'une lecture du cookie `tt_ui`.
- **Feuilles de style** · l'arbre Spatial (`app/(spatial)/layout.tsx`) charge
  **exactement** trois feuilles, rien d'autre (ni Tailwind, ni `globals.css`, ni
  `@tiktrends/ui`) :
  - `spatial/spatial.css` = les `<style>` de la maquette, **tels quels**, figés à
    l'octet près · la garde « la feuille de style est celle de la maquette, à
    l'octet près » compare la longueur et le contenu à l'extraction du gabarit de
    `maquette/`. On ne réécrit aucun style : on reproduit le **DOM et les classes**
    de la maquette, le CSS fait le reste ;
  - `spatial/spatial-routes.css` = dérivation mécanique des règles à adresse
    `[href="#route"]` vers `[data-route="route"]` (`deriverRoutesCss`, noyau) ;
  - `spatial/spatial-clair.css` = le thème clair (ci-dessous).

  Les pages publiques hors Spatial importent `globals.css` chacune dans leur
  segment (garde « chaque segment public hors Spatial qui REND une page charge
  globals.css ») ; le layout racine n'en charge aucune.
- **Thème clair** · la maquette est sombre de bout en bout. `spatial-clair.css`
  en est **dérivée** par `deriverThemeClairCss(spatial.css)`
  (`packages/core/src/spatial/theme-clair.ts`) · chaque déclaration de couleur
  reprise sous `html[data-theme="clair"]`, neutres inversés le long de l'axe encre
  ↔ papier, couleurs saturées en texte assombries, créas jamais thémées. La
  feuille n'est **jamais éditée à la main** · garde « spatial-clair.css = la
  dérivation EXACTE du thème clair » (régénérer par `deriverThemeClairCss` quand
  le message le demande), plus « aucune règle hors `html[data-theme="clair"]`,
  aucune propriété de mise en page ». Contrastes mesurés ·
  `packages/core/test/spatial-theme-clair.test.ts`. Le choix « Sombre · Clair »
  vit dans la **pop-up profil** (`ChoixTheme`, `spatial/coquille/Surcouches.tsx`,
  à la place de l'« Aperçu du rôle » de la maquette) · cookie `tt_theme` relu au
  rendu serveur par le layout racine (`<html data-theme>` dès le premier octet,
  aucun flash), appliqué tout de suite via `appliquerTheme`
  (`lib/theme-preference.ts`).
- **Coquille** · `spatial/coquille/Coquille.tsx` (rail, `main.win`, bulle et
  tiroir Jarvis, notifications, palette ⌘K, toast, sprite) et
  `Surcouches.tsx`. Données réelles chargées par `lib/spatial/coquille.ts`
  (`chargerCoquille`) · session obligatoire (sinon `/login`), parcours d'accueil
  d'abord pour un propriétaire neuf, accès effectif (rôle + formule), marques de
  l'espace, crédits, notifications non lues.
- **Filet** · `app/(spatial)/sp/error.tsx` · un écran qui échoue propose de
  réessayer ou de revenir à l'accueil, sans emporter la coquille.
- **Briques communes** · `spatial/communs` : `Vue`, `EnTete`, `SousNav`, `Ic`
  (icône du sprite), `Anneau`, `PastilleCredits`, `Lien` (navigation client vers
  un écran porté, rechargement complet vers une page publique, qui a sa propre
  feuille).
- **Vues** · `spatial/vues/<rubrique>/` · composants présentationnels.
- **Règles** · dans `packages/core/src/spatial` (pur, testé), jamais dans le JSX.

## Porter un écran · la méthode (obligatoire)

Vaut pour un écran nouveau comme pour un geste ajouté à un écran existant.

1. **Lire** `docs/spatial/reference/<route>.html` (le DOM à reproduire) et, pour le
   comportement, le code de la vue dans la maquette (`vX` dans le script principal ·
   décoder le bundle : manifeste `__bundler/manifest`, base64). Un écran sans
   fragment de maquette se compose avec les classes EXISTANTES de `spatial.css`
   (`.tile`, `.mtable`, `.seg`, `.field`, `.chip`, `.btn`…), en s'inspirant de
   l'écran de maquette le plus proche · aucune nouvelle feuille.
2. **Inventorier les données** : pour chaque valeur affichée, sa source RÉELLE
   (action serveur, table, règle du noyau). Ce qui n'a pas de source réelle n'est
   **pas inventé** : état vide honnête, ou contrôle absent. Jamais de « Prototype : … »,
   jamais de toast de réussite sans action réelle, jamais les données d'exemple de
   la maquette (Neva, Brasse & Co, « 1 240 »…) en production.
3. **Composant présentationnel** sous `spatial/vues/<rubrique>/`, qui reçoit
   tout en props et rend le balisage de la maquette à l'identique (mêmes balises,
   mêmes classes, mêmes styles en ligne que la maquette quand elle en a). Un module
   `'use client'` n'exporte que des composants, des hooks ou des types (garde).
   Quand la maquette colore un lien par son adresse à dièse (`.qa2[href="#nouveau"]`,
   `.stat2[href="#lots"]`), le lien réel porte `data-route="nouveau"` : la feuille
   `spatial-routes.css` reprend ces règles sur `[data-route]`. Sans cet attribut, la
   couleur disparaît.
4. **Page serveur** `app/(spatial)/sp/<adresse>/page.tsx` : gardes d'accès
   explicites (session via `getSession`, rôle via `roleAtLeast`, formule, capacité),
   lit les données, rend la vue. Les actions passent par les actions serveur
   EXISTANTES (et la barrière de dépense `sousPlafond` pour tout appel payant · prix
   annoncé AVANT le clic).
5. **Déclarer** l'écran dans `packages/core/src/spatial/ecrans/<rubrique>.ts`, et
   l'ajouter à `MATRICE.md` (adresse et vue).
6. **Garde de parité** (`test/spatial/parite.ts`) : rendre la vue avec un jeu de
   props équivalent à la maquette (mêmes nombres d'éléments) et comparer au
   fragment · `expect(p.rendu).toEqual(p.reference)`. Le squelette compare balises,
   classes, propriétés de style en ligne et icônes, jamais les textes. Deux
   équivalences seulement (`a.btn` ⇔ `button.btn`, `ignorer`). Un écart voulu
   (le CSS de la maquette déborde ou rogne au banc) se déclare dans `correctifs` ·
   `{ selecteur, style?, classes?, motif }`, le **`motif` est obligatoire** et dit
   le défaut constaté (ex. `'G13 · raccourcis tronqués à ~100 px à 1280'`) · le
   correctif est ajouté à la RÉFÉRENCE, le rendu doit donc le porter exactement.
   Faire TOMBER la garde une fois (retirer une classe) avant de livrer.
7. **Regarder l'image** : capture de la maquette et de l'écran réel côte à côte,
   mêmes largeurs (1440 et 390), sur un banc local. L'outil de comparaison utilisé
   jusqu'ici (`comparer.mjs`) n'est pas versionné dans le dépôt.

## Ce qui ne bouge pas

0 $ dépensé sans la barrière, aucune donnée de base supprimée, aucun secret, une PR
par changement avec les quatre portes et la CI Linux verte.

## Historique

- **Fondation** (#865) · arbre `app/(spatial)/sp` derrière une bascule (cookie
  `tt_ui`, V5 par défaut). Spatial devient l'interface par défaut avec son filet
  d'erreur (#878) · `?ui=v5` rouvre encore l'ancienne interface.
- **Vagues 2 à 4** · gestes de la V5 sans écran de maquette portés en Spatial, puis
  chaque page V5 couverte déclarée « exclusive » (champ `exclusif`, #879) et
  retirée, rubrique par rubrique (#883 à #922).
- **Vague 5** · fiche projet exclusive (#927, #937), puis retrait complet de
  l'ancienne interface (#941) · groupe `app/(app)`, coquille `AppShell`, bascule
  `?ui=v5` et cookie `tt_ui`, champ `exclusif`. Spatial est depuis la seule
  interface.
