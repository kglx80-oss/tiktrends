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

### Connectiques · le catalogue est une feuille de route
- **Les ~50 connecteurs à venir cessent d'être des boutons cassés.** Chacun
  portait un « + Connecter » désactivé · lu comme une panne, pas comme une
  promesse (personne ne survole pour trouver le `title` « bientôt »). Le bouton
  mort devient un statut **« Bientôt »** (composant pur `ConnecteurBientot`), la
  section devient une **feuille de route** avec Meta/TikTok en tête. Les deux
  vraies sources (Shopify, Meta) gardent leur bloc branchable au-dessus. Garde
  `connecteur-bientot` · rendu (nom + statut) ET aucun `<button>` dans la carte,
  validé par mutation.

### Anti-churn · la relance douce au premier palier de valeur
- **On relance quand la première créa traîne.** Le `JourneyPanel` montrait la
  même prochaine étape, du même ton, le 1ᵉʳ comme le 15ᵉ jour · or le moment qui
  décide qu'un compte vit ou meurt est unique · la première génération. Une
  marque posée puis laissée sans une seule créa, c'est le décrochage type.
  - Règle PURE dans `packages/core` (`relance`, `RELANCE_SEUIL_JOURS`) · elle ne
    parle QUE sur l'étape `generate`, et seulement après un délai (2 jours) ·
    une relance le jour même agace. Le seuil est une **cadence produit**
    assumée, pas un seuil technique mesurable.
  - Aucune migration · on réutilise `brands.createdAt` pour dater le décrochage.
  - Le message retire l'excuse (« pas de brief prêt »), il ne répète pas la
    consigne. Gardes : `onboarding` (core, la logique) + `relance-onboarding`
    (web, le RENDU dans le panneau), validés par mutation.
- **Second palier · généré mais jamais testé.** Générer ne dit pas laquelle
  gagne · c'est le test qui tranche, et c'est là que la boucle du produit paie.
  On relance donc aussi au palier `map` (poser la carte / ouvrir un lot) quand la
  dernière génération dort depuis le délai. **Chaque palier a son horloge** ·
  `generate` compte depuis la marque, `map` depuis la dernière génération ·
  pousser à tester quelqu'un qui vient de générer serait aussi faux que le
  relancer le jour de son inscription. Toujours sans migration · on lit
  `max(generations.createdAt)`.

### Délivrabilité · proposer le partage au moment où une créa gagne
- **Le partage marque blanche est rappelé sur le verdict gagnant.** Le bouton
  « Partager au client » ne vivait qu'en haut de la carte · jamais rappelé au
  moment qui compte. On pose l'invitation dans le panneau d'arbitrage, quand une
  créa gagne (`winner`/`baby_winner`/`relative_winner`).
  - Composant pur `PartageGagnante`, découplé du panneau de partage · il lance
    un événement (`tt:ouvrir-partage`), le `ShareButton` l'écoute · pas d'import
    serveur, donc rendable et testable.
  - **Jamais un bouton muet** · l'invite ne s'affiche qu'à qui peut partager
    (`peutPartager` = `peutMesurer`, câblé page → drawer via les trois hôtes).
  - Périmètre du lien inchangé · la carte des gagnantes de la marque, pas une
    créa isolée (un lien par créa demanderait un champ en base · hors lot).
  - Gardes `partage-gagnante` · le RENDU (présent/absent, jamais muet) et le
    nouage des deux bouts, validés par mutation.
- **L'autre moitié de la délivrabilité reste ouverte** · l'export/téléchargement
  groupé des médias exige de tirer les fichiers depuis S3/CloudFront · la session
  n'y a pas accès (proxy), donc impossible à vérifier ici sans rendu · à faire
  quand le proprio peut valider le rendu, ou côté navigateur client.

## Reste à faire (backlog priorisé)
1. ~~Modes d'emploi (`PageInfo`) plus visibles et présents partout.~~ Fait.
2. Parcours client / anti-churn : ~~états d'accueil vendeurs~~ (fait) ·
   ~~relance douce au 1ᵉʳ palier~~ (fait) · ~~relance au 2ᵉ palier · généré mais
   pas testé~~ (fait) · possible suite · relancer au palier verdict quand un
   signal de décrochage s'y mesure sans migration.
3. Connectiques : ~~clarté du catalogue~~ (fait) · délivrabilité ·
   ~~partage marque blanche proposé sur le verdict gagnant~~ (fait) · reste
   l'**export/téléchargement groupé** des médias (angle mort visuel côté session).
4. ~~Aération du rail (densité)~~ Fait.
5. **Pop-up de première fois** · écarté pour l'instant · l'orientation initiale
   est déjà portée par le `OnboardingWizard` (inscription), le `JourneyPanel` et
   l'`AssistantHome` · un modal de plus sur-oriente. À rouvrir si un besoin réel
   apparaît, pas par principe.
