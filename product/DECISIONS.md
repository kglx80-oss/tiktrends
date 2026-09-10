# DECISIONS · journal des choix autonomes

Le propriétaire a confié un mandat autonome (2026-09-10) : moderniser l'UI/UX,
prioriser parcours client, délivrabilité, connectiques, modes d'emploi par page,
pop-ups, petites fonctionnalités anti-churn, et une gestion des assets solide.
Travailler seul, sans questions, s'arrêter quand l'outil est solide ou à ~95 %
du forfait. Ce fichier consigne les décisions prises sans le consulter.

## Cadre respecté

- Chaque changement = une PR créée ET mergée (squash), garde validé en le faisant
  tomber, quatre portes vertes (typecheck · lint · test · build).
- FR, « · » jamais « — », styles inline, marque blanche, règles dans
  `packages/core`. Rien qui contredise un garde « never » du dépôt.
- Changements visuels signalés : je ne vois pas le rendu en ligne (proxy) · le
  proprio vérifie mobile + desktop après déploiement.

## Décisions tranchées seul

### Rail de navigation
- **On garde la doctrine de la boucle** (Observer · Créer · Tester · Piloter, le
  tableau de bord délibérément en dernier). La maquette proposait « Accueil en
  tête » · j'y renonce car (a) c'est l'inverse d'un principe codé et gardé
  (`rail-boucle.test.ts`), (b) l'accueil est déjà atteignable par le logo, ⌘K et
  le fil d'Ariane. On modernise DANS la boucle.
- **État actif = liséré** accent + teinte légère au lieu du pavé plein (#336) ·
  répond au « DA trop lourde » sans toucher structure ni libellés.

### Assets
- **Suppression confirmée** (`window.confirm`) · elle ne l'était pas, à rebours
  de la doctrine #305. Garde `confirm-suppression` étendu aux assets.
- **Miniatures increvables** · un asset dont l'URL ne charge plus bascule sur son
  icône de type au lieu de l'image cassée du navigateur (`apercuAsset`, pur).

### Rail · aération
- **Le rail respire** · plus d'espace entre sections et items, lignes plus
  hautes, sans toucher à l'ordre ni aux libellés (la boucle reste). Répond au
  « rail trop dense » sans rouvrir la structure. Garde `rail-air`.

### États vides · le parcours client
- **La queue d'états vides gris migre vers `Empty`/`EmptyLine`.** Le dépôt avait
  déjà le composant (le type IMPOSE une sortie sur `todo`) et la plupart des
  écrans l'adoptaient · restait une poignée de phrases grises sans issue. Les
  plus coûteuses d'abord :
  - **Connexions sans marque** · c'était l'étape d'activation (brancher Shopify /
    Meta) réduite à un pavé gris sans bouton · devient un `todo` qui pousse à
    choisir une marque. Le plus fort risque de churn du lot.
  - **Crédits · historique vide** · devient une invitation à générer, comme sa
    page sœur Consommation · pas une phrase grise sur une page d'argent.
  - **Liens de partage** (marque blanche) · `EmptyLine` qui vend le partage sans
    donner accès à l'outil · le geste « créer » est déjà au-dessus.
  - **Support** · une liste de tickets vide est une BONNE nouvelle · ton `good`
    (vert), pas le gris d'un manque.
  - Garde `empty-adoption` étendu (source + rendu du ton `good`), validé par
    mutation. `DriveConnect` laissé tel quel · fragment de statut en ligne, pas
    un écran vide.

## Reste à faire (backlog priorisé)
1. ~~Modes d'emploi (`PageInfo`) plus visibles et présents partout.~~ Fait.
2. Parcours client / anti-churn : ~~états d'accueil vendeurs~~ (fait, queue
   d'états vides migrée) · reste les relances douces (relances d'onboarding,
   nudge quand une étape traîne).
3. Connectiques & délivrabilité : clarté des branchements (Meta, TikTok, Drive).
4. ~~Aération du rail (densité)~~ Fait.
