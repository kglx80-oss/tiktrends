# DECISIONS · journal des choix autonomes

Le propriétaire a confié un mandat autonome (2026-09-10) : moderniser l'UI/UX,
prioriser parcours client, délivrabilité, connectiques, modes d'emploi par page,
pop-ups, petites fonctionnalités anti-churn, et une gestion des assets solide.
Travailler seul, sans questions, s'arrêter quand l'outil est solide ou à ~95 %
du forfait. Ce fichier consigne les décisions prises sans le consulter.

**Mandat 2 (2026-09-10)** : porter Image IA, Vidéo IA et Texte IA au même niveau
de profondeur que Pubs IA ; moderniser l'UI/UX en tranchant librement le design ;
et solidifier les assets (voir le VRAI asset, jamais une icône inutile · assets
plus présents dans la logique). La profondeur de Pubs IA se décompose en trois :
(a) un assistant guidé sur un moteur d'étapes PUR en `core`, (b) un catalogue de
directions du domaine en `core`, (c) une boucle relecture → débrief → itération
contrainte. Les trois studios reçoivent ce même socle, un studio à la fois.

**Mandat 3 (2026-09-11)** : élever considérablement l'UI avant l'arrivée des
premiers clients. Pistes du proprio : (1) les assets montrent des icônes
immondes au lieu de la VRAIE miniature du Drive · (2) les petites icônes de tout
l'outil font kitch, viser du premium · (3) mieux organiser, un vrai fil
conducteur entre les bascules · (4) revoir la présentation de Jarvis et le
placement des fonctionnalités éparpillées · (5) suite libre. Contrainte forte :
**0 $ de budget · aucune génération IA, on note les contrôles pour plus tard**,
on ne teste rien en direct. Priorité que j'ai fixée : #1 (le reproche le plus
répété) d'abord, puis icônes premium, fil conducteur, Jarvis.

### Vraie miniature Drive (piste #1)
- **Racine du défaut** : une vidéo Drive (et une image trop lourde pour le
  bucket) n'a pour adresse que le lien `drive.google.com/…/view`, une page HTML
  qu'aucune `<img>` ni `<video>` ne sait afficher · d'où l'icône de repli. Le
  proxy `drive` savait servir les octets, mais pour une vidéo cela veut dire
  télécharger la vidéo ENTIÈRE pour une vignette.
- **Décision** : persister la vraie vignette Google (`thumbnailLink`, dispo pour
  images ET vidéos) sur NOTRE bucket, à la synchro. La `thumbnailLink` est
  éphémère et exige un jeton · on la consomme tout de suite (où elle est fraîche)
  et on garde une copie publique et permanente. Colonne `assets.thumb_url`
  (migration 0047). La miniature l'essaie d'abord (image légère, même pour une
  vidéo), puis retombe sur l'ancien affichage par type, puis sur l'icône · cascade
  increvable prouvée par rendu (`apercu-asset.test.tsx`).
- **Sans bucket** : `storeDriveThumb` rend `null` sans réseau (garde éprouvé,
  `drive-thumb.test.ts`) · dégradation propre, jamais bloquant.
- **À valider par le proprio après déploiement** (proxy sortant bloqué ici) : que
  les vignettes Drive s'affichent bien (image ET vidéo) après une nouvelle
  synchro. Les assets déjà synchronisés n'ont pas de `thumb_url` tant qu'ils ne
  sont pas resynchronisés · leur miniature retombe sur l'ancien comportement.

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
- **On montre le VRAI asset, pas une icône de type** (mandat 2). L'ancienne règle
  ne rendait une vidéo que si elle était téléversée · tout ce qui arrivait par
  lien/Drive (la majorité des vidéos) tombait sur 🎬. Désormais on tente le vrai
  flux dès qu'un `kind` est visuel · l'icône n'est plus qu'un repli sur échec
  réel (`onError`), pas le défaut. Le paramètre `source` d'`apercuAsset` disparaît.
- **Lien Drive · l'`externalId` est posé à l'import manuel.** Sans lui, un lien
  Drive était servi en « direct » vers une URL Google qui renvoie du HTML, pas le
  fichier · la miniature cassait. Avec l'id, il passe par le proxy `/api/asset`
  (comme la synchro auto) qui télécharge le vrai fichier. Cause racine B éliminée.

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

### Studios · Texte et le picker d'assets (mandat 2)
- **Texte ne reçoit PAS de wizard · décision assumée.** Son brief est un seul
  champ requis (le produit) + cinq facultatifs · un assistant « une décision à la
  fois » sur un formulaire aussi simple serait du cargo-cult du patron de Pubs
  IA, pas une amélioration. On ne force pas un flux inadapté pour cocher une case.
- **Texte · le dernier résultat se recharge.** Son vrai manque n'était pas
  l'écriture (elle existait · `generateAction` consigne déjà un `script`) mais la
  LECTURE · le studio repartait vide alors que la génération d'hier était en
  base. La page charge la dernière sortie `script` de la marque et la passe au
  client, qui l'affiche à défaut d'une nouvelle. Garde `texte-persistance`.
- **Picker d'assets · miniature partagée.** Le sélecteur d'Assets du studio Pubs
  rendait un `<img>` nu sans repli · un lien cassé y montrait l'image cassée du
  navigateur, à rebours de la bibliothèque. Il passe par `MiniatureAsset` (repli
  sur icône de type via `onError`), qui gagne un `cadreStyle` pour tenir dans un
  sélecteur de taille fixe. Une seule miniature d'asset dans tout le produit.
  Gardes `picker-miniature` (rendu du `cadreStyle` + adoption) validés par mutation.
- **Studio Image · choix explicite des références (Assets).** Le studio Image
  n'avait aucun picker · il prenait la bibliothèque automatiquement, sans que la
  personne puisse choisir. Il gagne un sélecteur (même `MiniatureAsset`
  increvable) · les assets choisis priment, à défaut l'auto reste (comportement
  inchangé). L'action `generateImageAction` accepte des `assetIds` explicites
  (via `resolveAssetImageUrls`). « Assets plus présents dans la logique. »
  Garde `image-asset-picker` (page charge + passe, studio rend + transmet,
  action honore l'explicite avec repli auto).
- **Contrôles · débrief d'un lot de visuels (le dernier item, vérifiable).** La
  boucle de relecture de Pubs IA repose sur une relecture AUTOMATIQUE (copie /
  produit) faite à la génération · l'image n'a pas d'équivalent sans un scoring
  IA du visuel (appel vision serveur, non vérifiable de mon côté). On pose donc
  d'abord la moitié vérifiable · agréger le JUGEMENT déjà posé (notes retenu /
  écarté) en un débrief de lot · `debriefVisuels` (core, pur) · « sur N jugés, X
  retenus », vert quand tout est retenu, `null` si rien n'est noté (le silence
  est une réponse). Bande rendue au-dessus de la grille. Gardes `debrief-visuels`
  (core) + `debrief-visuels-rendu` (rendu + câblage), par mutation.
- **Contrôles · relecture IA d'un visuel (le scoring automatique).** Le studio
  Image relit un visuel à la demande · on RÉUTILISE le « score Jarvis »
  (`scoreCreative`, ai · il sait regarder l'image) et on le lit en une note
  affichable via `noteImage` (core, pur) · la note est PLAFONNÉE par les ratés
  rédhibitoires (`plafonner` + `verdictDefauts`, déjà éprouvés) · le modèle
  regarde, le noyau décide, une belle note ne passe pas au-dessus d'un raté
  visible. Bouton « Noter (IA) » par visuel, badge note/100 + verdict + ratés.
  Gardes `note-image` (core · plafond, non-vu → null) + `image-scoring` (câblage)
  par mutation. L'appel vision et le fetch de l'image tournent côté SERVEUR ·
  à valider par le proprio après déploiement (mon angle mort). Le mandat 2 est
  alors complet, contrôles compris.

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

### Studios · vers la parité Pubs IA (mandat 2)
- **Image · direction artistique réutilisée, pas dupliquée.** Le studio Image
  générait sur une phrase libre · le même défaut « toujours le même résultat »
  que le catalogue de directions a corrigé pour la pub. Plutôt qu'un second
  catalogue à maintenir, on RÉUTILISE `ad-directions` · un visuel est une SCÈNE
  (scène + lumière + finition via `directionScenePrompt`), et quand on écrit un
  texte dessus, la direction complète entre (typo + disposition). Helper pur
  `promptImage` (core, gardé par mutation) · la direction se compose dans le
  prompt FINAL seulement, jamais dans la légende affichée/stockée. Câblage
  studio + action gardé en source (fichiers non rendables · serveur/gros client).
- **Image · moteur d'étapes pur, branché au bouton d'abord.** Deuxième
  ingrédient de profondeur · `assistant-image` (core, sur le modèle
  d'`assistant-pub`) ordonne les décisions (produit → scène → style → volume) et
  dit ce qui MANQUE. On le branche d'abord là où ça compte le plus · le bouton
  du studio dit ce qui manque AVANT le clic (via `blocage` du composeur), fini le
  refus découvert au clic. Le composant assistant guidé (modal) consommera le
  même moteur ensuite · le moteur n'est pas du code mort, il vit dès ce PR.
- **Image · l'assistant guidé (modal), additif.** Le composant `AssistantImage`
  consomme le moteur `assistant-image` · une décision à la fois (produit → scène
  → style → volume), fil d'étapes rouvrable, récap avant de payer, ce qui manque
  écrit sous le bouton. Choix d'intégration · il s'AJOUTE (bouton « Assistant
  guidé ») au lieu de remplacer la barre à plat · zéro restructuration d'un
  studio qui marche, donc zéro risque de régression, et les deux écrivent le même
  état. Le bloc photo est défini une fois et servi aux deux. Render-gardé
  (`assistant-image-rendu`, comme `assistant-rendu`) · le composant ne tire
  aucune action serveur, donc rendable. Reste à Image · la boucle relecture →
  débrief.
- **Vidéo · moteur d'étapes pur, branché au bouton.** Comme Image, on commence
  par le socle vérifiable · `assistant-video` (core · départ → mouvement →
  format) branché sur le `blocage` du composeur · le refus « ajoute une image de
  départ » n'apparaît plus seulement au clic.
- **Vidéo · assistant guidé (modal), additif.** `AssistantVideo` consomme
  `assistant-video` · une décision à la fois (départ → mouvement → format), fil
  rouvrable, récap, ce qui manque sous le bouton. Même intégration additive
  qu'Image (bouton « Assistant guidé », zéro restructuration), galerie d'images
  de départ définie une fois et servie aux deux. Render-gardé
  (`assistant-video-rendu`).
- **Vidéo · directions de MOUVEMENT.** Ce qu'une image n'a pas · le geste. Un
  catalogue propre à la vidéo (`video-directions`, 8 directions · caméra +
  rythme + énergie) plutôt que réutiliser les directions d'image (qui décrivent
  une scène fixe). Helper pur `promptVideo` · composé dans le prompt FINAL des
  deux chemins (t2v et i2v), jamais dans la légende. Contrôle « Type de
  mouvement » dans le composeur et dans l'étape mouvement de l'assistant.
  Gardes `video-directions` (core) + `video-directions-wiring` (câblage), par
  mutation. Vidéo a maintenant les trois ingrédients, comme Image. Reste · Texte
  (persistance), boucle de relecture (contrôles · en dernier), 2e phase assets.

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
