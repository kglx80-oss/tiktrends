# Spatial · la nouvelle interface (mandat Kevin du 27/10)

Kevin a remplacé la DA V5 par la maquette **Spatial** de Claude Design. Objectif :
**pixel perfect de la maquette, chaque contrôle réellement branché**, l'ancienne
interface supprimée une fois Spatial complet. Ce dossier est la référence.

## Ce qu'il contient

| Quoi | Où |
| --- | --- |
| La maquette d'origine (hors ligne, autonome) | `maquette/TikTrends_Spatial_hors_ligne.html` |
| Un fragment HTML de référence par écran (78) + la coquille | `reference/<route>.html`, `reference/_coquille.html` |
| L'index des écrans (route, section, titre) | `reference/_index.json` |
| La table route maquette → adresse réelle → rubrique | `MATRICE.md` |

Ouvrir la maquette : la charger dans un navigateur, `#<route>` affiche un écran
(ex. `#veille`). `localStorage["tt-onb-done"]="1"` masque le parcours d'accueil.

## L'architecture

- **CSS** · `apps/web/spatial/spatial.css` = les `<style>` de la maquette, **tels
  quels**. Jamais retouché (garde `spatial-fondation`). On ne réécrit aucun style :
  on reproduit le **DOM et les classes** de la maquette, le CSS fait le reste.
- **Arbre isolé** · les écrans Spatial vivent sous `app/(spatial)/sp/<adresse>`,
  avec leur propre layout qui ne charge **que** `spatial.css` (ni Tailwind, ni
  `globals.css`, ni les jetons V5). L'ancienne interface garde ses segments.
- **Bascule** · cookie `tt_ui` (`?ui=spatial` / `?ui=v5`). En mode Spatial, le
  middleware réécrit une adresse PORTÉE vers `/sp/…` · l'adresse du navigateur ne
  change pas. Un écran porté = une entrée dans
  `packages/core/src/spatial/ecrans/<rubrique>.ts` + sa page sous `app/(spatial)/sp`.
  La garde refuse un chemin déclaré sans page, et une page sans déclaration.
- **Coquille** · `apps/web/spatial/coquille/Coquille.tsx` (rail, `main.win`,
  bulle Jarvis, panneaux, palette ⌘K, toast, sprite). Données réelles chargées par
  `apps/web/lib/spatial/coquille.ts` (mêmes gardes que la coquille V5).
- **Briques communes** · `apps/web/spatial/communs` : `Vue`, `EnTete`, `SousNav`,
  `Ic` (icône du sprite), `Anneau`, `PastilleCredits`, `Lien` (navigation client
  vers un écran porté, rechargement sinon · les deux interfaces ne partagent
  jamais une page).
- **Règles** · dans `packages/core/src/spatial` (pur, testé), jamais dans le JSX.

## Porter un écran · la méthode (obligatoire)

1. **Lire** `docs/spatial/reference/<route>.html` (le DOM à reproduire) et, pour le
   comportement, le code de la vue dans la maquette (`vX` dans le script principal ·
   décoder le bundle : manifeste `__bundler/manifest`, base64).
2. **Inventorier les données** : pour chaque valeur affichée, sa source RÉELLE
   (action serveur, table, règle du noyau). Ce qui n'a pas de source réelle n'est
   **pas inventé** : état vide honnête, ou contrôle absent. Jamais de « Prototype : … »,
   jamais de toast de réussite sans action réelle, jamais les données d'exemple de
   la maquette (Neva, Brasse & Co, « 1 240 »…) en production.
3. **Composant présentationnel** sous `apps/web/spatial/vues/<rubrique>/`, qui reçoit
   tout en props et rend le balisage de la maquette à l'identique (mêmes balises,
   mêmes classes, mêmes styles en ligne que la maquette quand elle en a).
   Quand la maquette colore un lien par son adresse à dièse (`.qa2[href="#nouveau"]`,
   `.stat2[href="#lots"]`), le lien réel porte `data-route="nouveau"` : la feuille
   `spatial-routes.css`, dérivée mécaniquement de `spatial.css` (`deriverRoutesCss`),
   reprend ces règles sur `[data-route]`. Sans cet attribut, la couleur disparaît.
4. **Page serveur** `app/(spatial)/sp/<adresse>/page.tsx` : mêmes gardes que la page
   V5 équivalente (session, rôle, formule, capacité), lit les données, rend la vue.
   Les actions passent par les actions serveur EXISTANTES (et la barrière de dépense
   `sousPlafond` pour tout appel payant · prix annoncé AVANT le clic).
5. **Déclarer** l'écran dans `packages/core/src/spatial/ecrans/<rubrique>.ts`.
6. **Garde de parité** (`apps/web/test/spatial/parite.ts`) : rendre la vue avec un jeu
   de props équivalent à la maquette (mêmes nombres d'éléments) et comparer au
   fragment · `expect(p.rendu).toEqual(p.reference)`. La faire TOMBER une fois
   (retirer une classe) avant de livrer.
7. **Regarder l'image** : banc local + `comparer.mjs` (capture maquette et écran réel
   côte à côte, mêmes largeurs 1440 et 390).

## Ce qui ne bouge pas

0 $ dépensé sans la barrière, aucune donnée de base supprimée, aucun secret, une PR
par changement avec les quatre portes et la CI Linux verte.
