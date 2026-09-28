# Pubs IA · composition premium & responsive · contrat de lot

Consigné par Codex (reprise du 28/09/2026), sur les bases Jarvis validées
(#687/#688). Ce document **complète** `docs/CAP-PRODUIT-ET-CHARTE-UI.md`
et `packages/ui/tokens.css` ; il ne les remplace pas. Périmètre : l'écran
`/studio/ads` (Pubs IA), shell partagé conservé.

## Cap produit rappelé

TikTrends sert d'abord **l'analyse pour l'itération**. Boucle : observer
(concurrents ou KPI) → hypothèse → test → **création** → mesure. La création
concrétise le test ; **pas de promesse de performance ni de résultats
inventés**. Les observations de marché ne prouvent pas la rentabilité. Le
studio ne fabrique pas de moteur de test ni de fausse liaison : il n'affiche
un contexte d'hypothèse/test **que s'il existe**, mesuré (aucun modèle appelé).

## Contrat visuel

- Fond uni `#120810` ; rail `#0d070c`, 184/64 inchangé ; surfaces `#1c121b` ;
  texte `#f6eef4` ; secondaire `#cbbcc7` ; accent mesuré `#ff5c8a`.
- Aucun quadrillage, halo global ni **gros bandeau marketing**.
- Titres graisse 500 ; titre de page 32 desktop / 28 mobile.
- Contrôles interactifs effectifs **44 × 44**.
- En-tête court **« Pubs IA »**, explication **« Crée les variantes de ton
  prochain test. »**
- **Une action dominante de création** conserve le flux existant (l'assistant) ;
  **cloner** devient secondaire.
- Contexte d'hypothèse/test **compact et modifiable s'il existe** ; jamais
  inventé.
- **Réglages avancés** derrière une ouverture explicite.
- La **galerie apparaît dans le premier écran 1280 × 800**, sans empilement de
  cartes introductives.
- **Une seule barre recherche/tri** ; **filtres à la demande** (panneau) ·
  **tous les filtres conservés** (format, qualité, performance).
- Aperçus dominants, cartes sobres, titres lisibles, **ratio média préservé** ;
  actions essentielles accessibles **au clavier et au toucher, jamais
  uniquement au survol**.

## Responsive

- Contenu principal **max 1200**, centré ; padding **32 desktop / 16 mobile** ;
  rythme vertical **16 / 24 / 32**.
- Grille fluide, adaptée à la taille réelle des cartes : typiquement
  **4 colonnes @1440**, **3 @1280** (rail ouvert), **2 en tablette**,
  **1 @390**. Réalisé par `repeat(auto-fill, minmax(min(270px, 100%), 1fr))`
  dans une colonne bornée à 1200 (borne `min(…, 100%)` : aucune piste ne
  dépasse la largeur dispo).
- **Aucun défilement horizontal de page.**
- Mobile : commande principale et barre de recherche **s'empilent** proprement ;
  filtres dans un **panneau accessible** (bouton « Filtres », `aria-expanded`,
  focus correct).
- États tenus utilisables : noms longs, galerie vide/remplie, **zéro résultat**,
  chargement, erreur, **droits limités**.

## Ce qui n'est PAS touché

Fonctions, droits, données. Pas de migration métier, de nouveau connecteur,
de Canvas ni de changement d'offre. Le shell validé (rail, recherche globale,
support) reste intact. La carte créative partagée (`CarteCreative`) est déjà
premium (ratio `contain`, actions boutons 44 px non-survol) · réutilisée telle
quelle.

## Vérification (rappel de méthode)

Captures RÉELLES avant/après à 1280×800 et 390×844, plus 1440×900 et
hauteur 720 ; états vide/rempli avec **données locales étiquetées** (fixtures
locales protégées, jamais en production) ; panneau filtres ouvert ; noms longs.
`typecheck · lint · test · build · CI` — ces tests ne remplacent pas la recette
visuelle. Pas de génération payante.

## Suite (documentaire · hors périmètre de cette PR)

Routes restantes à harmoniser sur la même grammaire et leur place dans la
boucle d'itération — relevé en fin de PR, sans les modifier ici :
Dashboard (point d'entrée / prochaine action), Veille (observer), Adsmap
(mesurer / arbitrer), Analytics (mesurer / attribuer), Studio Image/Vidéo/Textes
(créer), utilitaires (Assets, Sources, réglages).
