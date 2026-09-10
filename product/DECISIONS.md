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

## Reste à faire (backlog priorisé)
1. Modes d'emploi (`PageInfo`) plus visibles et présents partout.
2. Parcours client / anti-churn : états d'accueil vendeurs, relances douces.
3. Connectiques & délivrabilité : clarté des branchements (Meta, TikTok, Drive).
4. Aération du rail (densité), en gardant l'ordre et les libellés.
