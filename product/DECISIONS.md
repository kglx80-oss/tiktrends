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

### Icônes premium · fondation partagée (piste #2)
- **Le constat** : 593 emojis dans 120 fichiers · impossible (et risqué) de tout
  convertir d'un coup, surtout sans voir le rendu. Le rail avait déjà de vraies
  icônes au trait, mais prisonnières de `AppShell`.
- **Décision** : sortir le jeu dans `components/Icon.tsx` (partageable, `Icon` +
  `iconForAssetKind` + `ICON_PATHS`), le compléter pour les usages courants
  (image, film, music, file, upload, link, sparkles, search), et faire pointer
  `AppShell` dessus (parité, zéro changement visuel du rail · le garde
  `navigation.test` lit désormais `ICON_PATHS`). Première conversion : le repli
  des miniatures d'assets · plus jamais 🖼️🎬🎵📎, une icône au trait selon le type
  (prouvé par rendu · `apercu-asset` + `icon-premium`).
- **Reste à faire (PR suivantes, un écran à la fois)** : boutons d'action (⬆🔗✦),
  états vides (`Empty`), en-têtes de section, AdsStudio (49 emojis), studios,
  Jarvis. La fondation étant posée, chaque conversion est mécanique et sûre.
- **À valider par le proprio** : cohérence visuelle des icônes du rail inchangée,
  et le repli d'asset (rare · média cassé/audio) au trait.

### États vides premium (piste #2, suite)
- **Pourquoi eux d'abord** : un état vide est le PREMIER écran qu'un nouveau
  client voit sur chaque fonction · ils portaient tous un emoji (🗂️🔍📦🔌🏷️🗺️…).
- **Décision** : le composant `Empty` prend désormais un NOM d'icône du jeu
  partagé (plus un emoji) et le rend dans une pastille sobre teintée par le ton
  (todo/wait/good). Les 12 appels convertis vers des noms (`folder`, `search`,
  `plug`, `box`, `tag`, `map`, `users`, `check`, `radar`, `bookmark`). Trois
  icônes ajoutées au jeu (`folder`, `box`, `map`).
- **Garde anti-régression** : un test scanne tous les `<Empty icon="…">` et
  refuse tout nom absent du jeu (sinon repli muet sur `grid`) · éprouvé par
  mutation (nom bidon → rouge). Rendu prouvé : `<svg>`, jamais d'emoji.
- **À valider par le proprio** : lisibilité des pastilles d'états vides.

### Iconographie des studios (piste #2, suite)
- **Le levier** : la barre `Composer` est partagée par Pubs/Image/Vidéo · une
  seule conversion touche les trois. Ses pastilles de réglage portaient un emoji
  (📦👤🎯⧉✦⬚⏱◐), et les gabarits de Pubs IA aussi (⚡🔀⭐✅📱📊🏷️).
- **Décision** : le champ `icon` d'un `ComposerControl` (et la puce Scènes) est
  désormais un NOM du jeu partagé, rendu au trait dans la pastille. Les controls
  des trois studios convertis, plus les 7 gabarits de Pubs IA. Icônes ajoutées :
  `swap`, `star`, `phone`, `target`, `frame`, `contrast`, `clock`.
- **Gardes** : Composer se rend en test (il n'importe que React) · on prouve le
  `<svg>` sans emoji (éprouvé par mutation), et un scan des `icon:` de studio
  refuse tout nom inconnu ET tout caractère non-ASCII (un emoji qui reviendrait).
- **À valider par le proprio** : lisibilité des pastilles de réglage et des
  gabarits dans les trois studios.
- **Reste (emoji épars)** : boutons d'action inline (✦✨⬆✎🔗), pastille 🎛️ du
  menu compte (AppShell) · à convertir opportunément. La grammaire est posée.

### Palette ⌘K + rail · dernières surfaces de navigation au trait
- La palette ⌘K et le rail affichaient chaque commande avec un emoji
  (🏠✨🧬🖼️🎬🧠🔎🗺️…) et le cadenas 🔒. `AppShell.emojiFor` mappait nom d'icône
  → emoji · supprimé. `Command.emoji` devient `Command.icon` (nom du jeu). Le
  glyphe de ligne est sorti en composant pur exporté `CommandGlyph`.
- Icônes ajoutées : `plus`, `alert`, `lock`. Le 🔒 du rail (NavLink) et de la
  palette passe à `<Icon name="lock">`.
- **Garde** : la palette renvoie `null` fermée → on rend `CommandGlyph` seul
  (result, `<svg>`, mutation éprouvée) ; scan du câblage AppShell (plus d'`emoji:`
  ni d'`emojiFor`, chaque `icon:` littéral connu du jeu, mutation éprouvée).

### Hub Studio · switchboard du produit phare (piste #2 ∩ #3)
- Le hub `/studio` oriente vers les quatre studios (dont Pubs IA). Ses cartes
  portaient un emoji dans la pastille (✨🖼️🎬✍️) · converties au trait :
  `sparkles`/`image`/`film`/`pen` (icône `pen` ajoutée). `Hub` n'a qu'un usage.
- **Garde** : `Hub` se rend en test · `<svg>` sans emoji (mutation éprouvée), et
  un scan des `icon:` de `studio/page.tsx` refuse tout nom inconnu ou non-ASCII.

### Constat d'exploration · pistes #3 et #4 déjà bâties
- **#3 (fil conducteur)** : la navigation est mature et cohérente — carte unique
  `lib/navigation.ts` (fil d'Ariane, sections, brand-scoping), garde anti-dérive
  qui lit le dossier des pages, rail groupé + repli + tiroir mobile, palette ⌘K,
  écrans récents, `Breadcrumb` posé une fois dans `AppShell`. Les en-têtes de
  page sont déjà quasi-identiques (`fontSize:26, fontWeight:800`). Un `PageHeader`
  partagé (42 fichiers) serait du churn à faible valeur sur du code éprouvé.
- **#4 (Jarvis)** : `jarvis/page.tsx` documente déjà la consolidation « une seule
  maison » (fusion des deux écrans, ordre d'information : couches → attribution →
  mémoire → coût → actions). Le placement des fonctionnalités est fait.
- **Conclusion** : ne pas ouvrir de gros refactor #3/#4 · ils sont traités. À
  soumettre au proprio pour redéfinir les prochaines grosses améliorations.

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

## Retour au cœur · qualité et utilisabilité de Pubs IA (2026-09-11)

Le polish premium (icônes, états vides) est bouclé. Exploration du cœur de
Pubs IA (génération → relecture → itération → mesure) : la **boucle qualité**
(conformité de fabrication → réparation auto → défauts qui règlent moteur / mode /
direction) est fermée et autonome. La **boucle performance** (générer → suivre →
lancer → verdict → l'angle/valeur gagnant revient en défaut ET sur la carte) est
bâtie dans ses morceaux mais **ne revient jamais à la surface de création** : le
signal gagnant vit en base et meurt dans les analyses ADSMAP/admin.

**3 prochaines grosses améliorations proposées au proprio** (par valeur) :

1. **Ramener le verdict marché sur la carte du Studio.** *(livré — voir plus bas)*
   La carte montrait la prédiction (score Jarvis) et la relecture (copie), jamais
   le RÉSULTAT payé. Or « laquelle a gagné » est la seule question qui décide de
   l'itération.
2. **Nourrir la génération avec les angles qui ont GAGNÉ, pas seulement les 👍.**
   *(livré — voir plus bas)* `perfParAngle` relie chaque angle à son verdict réel
   (le marché a payé) mais n'était lu que dans `admin/intelligence`.
3. **Dire la vérité sur « mesuré le meilleur ici ».** *(livré — voir plus bas)*
   Le Studio étiquetait le moteur au plus faible taux de réécriture « mesuré le
   meilleur ici » · un client y lit « le plus performant ».

### Livré · #1 · le verdict marché sur la carte (0 $ · aucune génération)
- Règle pure `etatVerdictCarte` (`packages/core/src/adsmap/verdict-carte.ts`) :
  (suivie ? verdict arbitré ? lequel) → état nommé + libellé + ton. Un verdict
  `computed` non arbitré reste « en mesure » · on n'annonce pas une défaite non
  tranchée (même prudence que l'attribution).
- `listBrandAds` lit le verdict de tout le lot en une requête (`verdicts` par
  `adsmapAdId`), ajoute `verdict` à `AdItem`. Composant `VerdictBadge` · badge en
  surimpression sur la carte (à droite, face au score Jarvis à gauche) et inline
  en tête du détail.
- **Gardes** : règle noyau (chaque verdict → état, `computed` → en mesure,
  non suivie → rien · mutation éprouvée) + rendu `VerdictBadge` (le libellé arrive
  à l'écran, rien quand rien à dire · mutation éprouvée).
- **À valider par le proprio** : lisibilité du badge sur la grille et le détail.

### Livré · #2 · les angles GAGNANTS pilotent la génération (0 $ · aucune génération)
- Règle pure `consigneAnglesMarche` (`packages/core/src/adsmap/perf-par-angle.ts`),
  jumelle objective de `consigneAnglesGagnants` (subjectif) : nomme les angles
  dont le taux de gagnants (verdict ADSMAP) atteint la référence générale, au-delà
  du plancher de conclusifs. Muette sinon · le silence est la réponse fréquente.
- `preferencesMarche(brandId)` (ads.ts) lit le signal **brand-scoped** via le lien
  forward `input.adsmapAdId` → verdict (le même que la carte), sans la jointure
  inverse non vérifiée de l'écran fondateur. Injecté dans `winningPatterns` juste
  après la mémoire mesurée, avant le subjectif (pouce, veille).
- **Gardes** : règle noyau (un angle gagnant remonte, un sous-moyenne non, muet
  sous le plancher · mutation éprouvée) + câblage (le signal entre dans les motifs
  injectés au prompt · mutation éprouvée).
- **Note de prudence** : la jointure ad → angle reste à confirmer sur données
  réelles (déjà signalé à l'écran fondateur). L'effet est ADDITIF et gaté par le
  plancher · au pire, un indice d'angle gagnant légèrement mal attribué, jamais
  destructif, et il se corrige à mesure que les verdicts s'accumulent.

### Livré · #3 · libellé honnête du moteur (0 $ · aucune génération)
- `conseilMoteur` désigne le moteur au plus faible taux de RÉÉCRITURE d'accroche ·
  c'est « tient le mieux ta copie » (fidélité), pas « gagne le marché »
  (performance, mesurée ailleurs par le verdict). Le noyau phrasait déjà juste
  (`resume`) ; seuls deux libellés d'écran promettaient « · mesuré le meilleur
  ici » (AssistantPub, AdsStudio).
- Les deux passent à « · tient le mieux ta copie ici ». Garde source : aucun
  écran ne réintroduit « le meilleur ici » (mutation éprouvée).

Les 3 améliorations proposées le 2026-09-11 sont désormais LIVRÉES.

## 2e tour · boucle d'itération de Pubs IA (2026-09-11)

Nouveau tour d'exploration. La boucle mesure→action a encore des points où le
signal existe mais ne revient pas à l'utilisateur. **3 nouvelles améliorations
proposées** (par valeur × bornée × 0 budget) :

1. **Nommer ET réappliquer la valeur gagnante d'un essai.** *(livré — voir bas)*
   `essaiSuivant` disait « applique ce qui a gagné » sans jamais dire QUOI, alors
   que les cumuls le savent (`ligne.gagne`).
2. **Rééquilibrer « Varier (3) » vs « Décliner » vers l'attribuable.** *(livré —
   voir bas)* La CTA forte était « ✨ Varier (3) » (non-attribuable), placée avant
   « Décliner » (attribuable).
3. **Débrief de lot persistant.** *(livré — voir bas)* `debriefLot` vivait en état
   React · il disparaissait au rechargement, alors que sa matière est persistée.

### Livré · 2e tour #1 · nommer et réappliquer le gagnant d'un essai (0 $)
- Règle pure `gagnantsMesures(cumuls)` + `libelleGagnant(g)` (core, adsmap) :
  extrait la valeur gagnante de chaque dimension conclusive et l'habille du
  libellé du sélecteur (gabarit / direction). `Suggestion.gagnants` porte la liste
  sur tous les chemins d'`essaiSuivant`.
- Studio · le panneau d'hypothèse affiche « GAGNANTS MESURÉS · Mise en page ·
  L'affiche · appliquer » ; un clic pré-sélectionne la valeur dans le composeur
  (`setLayout`/`setUniverse`) et ouvre l'assistant.
- **Gardes** : noyau (quelle valeur gagne, comment elle se nomme, muet sinon ·
  mutation éprouvée) + câblage Studio (les gagnants s'affichent et se
  réappliquent · mutation éprouvée).
- **À valider par le proprio** : lisibilité des puces gagnantes et bon
  pré-remplissage du composeur.

### Livré · 2e tour #2 · l'itération attribuable passe devant (0 $)
- Dans le détail d'une créa, « Décliner » (une seule chose change, le reste tenu ·
  écart attribuable, donc ça apprend) passe PREMIER et primaire (en-tête accent +
  pastille « pour itérer »). « Varier (3) » (tout change à la fois · non
  attribuable) passe en SECOND, en action secondaire (`toolBtn`, plus `toolPrimary`),
  avec la mention explicite « l'écart n'est attribuable à rien ». Varier n'est pas
  supprimé · il garde son usage d'exploration rapide.
- **Garde** : rendu/câblage · Décliner avant Varier, Varier en secondaire jamais
  en CTA forte, Décliner en accent primaire (mutation éprouvée).
- **À valider par le proprio** : la nouvelle hiérarchie se lit bien dans le détail.

### Livré · 2e tour #3 · débrief de lot persistant (0 $)
- Un identifiant de LOT (`crypto.randomUUID`) est consigné une fois par appel de
  génération sur chaque créa (à côté de la recette · ne touche ni le rendu ni la
  clé de cache), relu par `listBrandAds` (`AdItem.lot`). Les essais avaient déjà
  leur `groupe` ; les lots ordinaires n'avaient rien.
- Règles pures (core, debrief-lot) : `relectureDepuisControle` (la sémantique de
  mesure, sortie du JSX du Studio) + `debriefDepuisControles` (reconstruit le
  débrief depuis les contrôles déjà en base). Le Studio les utilise à la
  génération ET pour initialiser l'état au chargement (`debriefDuDernierLot`).
- Résultat : le débrief du dernier lot survit au rechargement. En composée (pas de
  relecture), il reste `null` · le mode garantit déjà le texte, rien à débriefer.
- **Gardes** : noyau (mapping + reconstruction, comptes, tout-bon · mutation
  éprouvée) + câblage (lot consigné/relu, état initialisé depuis la grille ·
  mutation éprouvée).
- **À valider par le proprio** : le débrief du dernier lot réapparaît bien après
  un rechargement de Pubs IA.

**2e tour bouclé.**

## 3e tour · valider les signaux payés (2026-09-11)

### Livré · le Score Jarvis est confronté au marché (GAP5 · 0 $)
- Le Score Jarvis coûte des crédits · c'est un PRONOSTIC, jamais confronté au
  verdict réel. `bilanNotes` les garde séparés À DESSEIN (un avis n'est pas un
  résultat). Mais du coup, personne ne vérifiait si le score PRÉDIT : un client
  payait un score dont on ignorait la valeur.
- Règle pure `calibrationScore(paires)` (core adsmap) : coupe à la MÉDIANE des
  scores (pas de seuil d'instinct · doctrine « mesurer les seuils »), compare le
  taux de gagnantes moitié haute vs basse, ne déclare « prédit » que si la borne
  basse de Wilson de la moitié haute dépasse le taux de la moitié basse. Plancher
  de 5 conclusifs PAR MOITIÉ · muette sinon.
- `calibrationScoreAction` (à part de `bilanNotes`, qui reste sans verdict) relie
  score et verdict par le lien forward `input.adsmapAdId`. Affiché dans la page
  Jarvis, section Score Jarvis · « Ton Score Jarvis prédit le marché » / « ne se
  détache pas encore du hasard », muet tant qu'on n'a pas assez de paires.
- **Gardes** : noyau (médiane, plancher, Wilson · mutation éprouvée) + câblage
  (action relie score/verdict et passe par le noyau ; `bilanNotes` reste sans
  verdict ; la page rend sous condition · mutation éprouvée).
- **À valider par le proprio** : l'affichage de calibration apparaît bien sur la
  page Jarvis dès qu'une marque a assez de créas notées ET mesurées.

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
