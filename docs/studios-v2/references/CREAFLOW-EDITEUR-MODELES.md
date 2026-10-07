# CreaFlow — éditeur et modèles locaux

Analyse statique du 6 octobre 2026. Lecture seule de quatre modules publics déjà téléchargés, sans exécuter leur JavaScript, appeler leurs API ni lancer de génération. Ce rapport distingue le code livré de son fonctionnement effectif, non testé ici.

## Résultat essentiel

Trois modèles sont explicitement référencés et raccordés à des fonctions de l’éditeur : **MI-GAN**, **BiRefNet Lite 512 FP16** et **MobileSAM**. Ils servent aux retouches et sélections ; ils ne révèlent pas les modèles qui créent les vidéos, écrivent les scénarios ou animent les plans. Le code configure leur inférence **dans le navigateur**, dans des Web Workers, avec **ONNX Runtime Web 1.20.1**.

L’éditeur graphique embarque la version **7.4.0** de la bibliothèque Fabric (moteur d’objets graphiques, sélection et transformations). Cela concerne l’éditeur d’image. Il ne faut pas l’attribuer automatiquement au graphe Produit → Style → Scénario du studio vidéo : ce sont deux surfaces distinctes.

## Modèles et fonctionnement prouvés par le code

| Fonction | Fichier modèle explicitement référencé | Exécution configurée | Ce que le code fait |
|---|---|---|---|
| Gomme intelligente / remplissage de zone | `migan_pipeline_v2.onnx` | Worker, ONNX Runtime, WebAssembly, un thread | Reçoit pixels RGBA et masque ; prépare les tenseurs image/mask ; récupère les pixels reconstruits et retourne une image RGBA. |
| Détourage | `birefnet_lite_512_fp16.onnx` | WebGPU si adaptateur compatible shader-f16 ; sinon WASM ; repli WASM aussi après erreur d’inférence GPU | Redimensionne en 512×512, normalise les canaux, calcule un masque alpha, puis le remet à la taille de l’image. |
| Sélection interactive | `mobilesam_encoder.onnx` + `mobilesam_decoder.onnx` | Encodeur WebGPU si disponible, sinon WASM ; décodeur WASM | Encode l’image une fois, conserve les embeddings et une clé d’image ; calcule ensuite les masques depuis points positifs/négatifs et/ou rectangle. |

Les URL sont sous `https://assets.creaflowai.fr/models/`. Chaque worker utilise Cache Storage (`creaflow-eraser`, `creaflow-cutout`, `creaflow-select`), téléchargement avec progression et détection de fichier tronqué, puis messages `loaded`, résultat ou `error`. Les tableaux de pixels sont transférés entre worker et interface. MobileSAM utilise une mise à l’échelle de côté maximal 1024 et conserve les embeddings pour éviter de réencoder à chaque clic.

**Confiance forte sur les références et chemins d’exécution.** Les poids n’ont pas été ouverts ni leur provenance/version scientifique vérifiée : les noms du fournisseur indiquent les familles, pas un hash certifié du modèle original. Présence du code ≠ preuve de qualité, latence ou activation réussie sur tous les appareils. Aucun appel de génération externe n’apparaît dans ces trois chemins de workers ; cela ne signifie pas que toute l’application travaille localement.

## Ce qui rend l’assistant réellement capable d’éditer

Le module appelle la fonction serveur Supabase `canvas-assistant` avec une action `ask`. La requête comprend historique, description structurée de page, message, marque, langue, capture de page et capture de sélection. La description inclut calques sélectionnés, géométrie, couleurs/polices de marque, zones, sources disponibles et contraintes de crédits.

Le serveur renvoie une réponse et des actions structurées. Le client filtre les noms contre une liste explicite : mise à jour/transformation/suppression/duplication/ordre des calques, ajout de texte/élément/image, fond de page, détourage, extraction du texte éditable, modification d’image, effacement de zones et demande à l’utilisateur.

C’est une séparation importante : le modèle propose des opérations, puis le moteur graphique les interprète. Le client contrôle des arguments numériques et limites, la sélection, les produits référencés et les zones. Les opérations d’édition image peuvent produire un plan à confirmer avec coût, progression, erreurs et annulation. Certaines modifications graphiques simples s’appliquent directement. Il ne faut donc pas affirmer que toutes les actions nécessitent confirmation.

L’extraction du texte passe par `creative-text-layers`, actions `detect` et `erase`. Quand des textes ne sont pas encore éditables, l’assistant peut demander leur extraction puis reprendre la requête avec `continuation: true`. Les modifications génératives passent par `creative-editor`, actions `aiEditStart` et `aiEdit`, avec suivi de batch, crédits et essais. Les références de produit et logo sont transmises dans ce parcours. **Les fournisseurs et noms de modèles de ces fonctions serveur ne sont pas exposés dans les modules inspectés.**

## Document, historique, versions et export

Le moteur conserve un document structuré avec dimensions, fond, calques, patches et ressources. Il expose des opérations de transformation et de restauration du document. L’historique possède passé/présent/futur, annuler/rétablir, snapshots et limite de taille. Les changements passent par une file d’exécution ; les petites modifications et la saisie de texte sont finalisées avant export ou capture d’historique.

L’annulation d’une intervention de l’assistant vérifie que l’état courant correspond encore à son résultat ; si une autre modification est intervenue, elle marque l’annulation comme périmée. Cela évite d’annuler aveuglément le travail réalisé depuis.

Des versions peuvent être créées, activées, prévisualisées, supprimées, sauvegardées et exportées séparément. Une sauvegarde/restauration récupère document, ressources, historique conversationnel et versions via des fonctions importées de `EditionPage`. La première lecture de ce module ne permettait pas de déterminer le support de persistance. Le complément ci-dessous, fondé sur `EditionPage`, confirme IndexedDB pour le document éditable et distingue ses écritures serveur.

L’export PNG est réalisé côté navigateur depuis les données du document. L’enregistrement convertit l’export et appelle des fonctions de `creativeEditor`, puis conserve l’état éditable associé à l’identifiant de création. Les téléchargements ont des contrôles d’offre/contenu. Ces contrôles visibles ne permettent pas d’auditer les droits côté serveur.

## Implications pour TikTrends — conception indépendante

1. Conserver un document créatif structuré comme source de vérité ; le rendu et la conversation doivent travailler sur le même document.
2. Donner à Jarvis le contexte exact : produit, charte, sélection, zones, version active et références. Éviter de lui demander une nouvelle image entière pour une simple modification de texte ou d’alignement.
3. Définir un ensemble restreint d’opérations d’édition, validées avant exécution ; distinguer retouche déterministe, inférence locale et génération distante.
4. Prévoir snapshots, retour arrière et branches de versions avant de multiplier les générations. Invalider une annulation devenue dangereuse après des changements ultérieurs.
5. Évaluer les retouches locales comme piste : téléchargement initial/cache, compatibilité GPU, repli CPU, mémoire et temps de traitement. Aucune économie précise n’est démontrée sans benchmark sur nos appareils et nos images.
6. Pour l’assemblage vidéo, conserver le graphe de dépendances et les tâches séparées ; Fabric et ces trois modèles ne constituent pas un moteur complet de vidéo.

Ce rapport n’autorise ni n’implémente un nouveau Canvas ou connecteur dans TikTrends. Il donne des mécanismes à confronter aux capacités existantes et au périmètre produit.

## Repères reproductibles

Fichiers lus : `/tmp/creaflow-CanvasEditor-DFI1xmm3.js`, `/tmp/creaflow-eraser.worker-0l5x1KZq.js`, `/tmp/creaflow-cutout.worker-BryuiK9L.js`, `/tmp/creaflow-select.worker-UJ7OvIgS.js`.

Dans CanvasEditor, offsets approximatifs de caractères dans le texte UTF-8 décodé : version 7.4.0 vers 200477 ; actions assistant vers 613966 ; `canvas-assistant` vers 625600 ; construction du contexte vers 643655 ; `creative-editor` vers 633686 ; protection d’annulation vers 647354 ; historique vers 665918 ; export vers 681394 ; restauration vers 718461 ; sauvegarde/export utilisateur vers 740750. Dans les workers, la logique métier se trouve à la fin, après le runtime ONNX embarqué.

Ces repères servent à vérifier les observations. Aucun code propriétaire n’a été copié dans une implémentation.

## Empreintes des ressources analysées

- `CanvasEditor-DFI1xmm3.js` : SHA-256 `cd1e3e1e2a024b46799a4d30d980f23482cdb897f6fcbab0e268eb094d5af776`
- `eraser.worker-0l5x1KZq.js` : SHA-256 `f15cff941eaa2876a622f99da15b38486ae7863096f49f2c9c1e8ef5d6521825`
- `cutout.worker-BryuiK9L.js` : SHA-256 `7b952f8d3f03fda29713a615bccbddbdca7394d77ed09f9e198a3dd6d9f5ea0b`
- `select.worker-UJ7OvIgS.js` : SHA-256 `f84fe80ea44ebb9566d865b72c1f6debf77168376cf82fac1dab4b52117202da`


## Complément — persistance et sauvegardes confirmées

Lecture statique supplémentaire de `/tmp/creaflow-EditionPage-_VE78twf.js` et `/tmp/creaflow-creativeEditor-DwO8MWJh.js`.

### Trois niveaux, pas une sauvegarde unique

1. **Document éditable local.** `EditionPage` ouvre une base IndexedDB par utilisateur authentifié, `creaflow-canvas-editor:<userId>`, version 1, magasin `drafts` indexé par `creativeId` et `updatedAt`. Chaque entrée conserve document, ressources, miniature, indicateur saved, conversation courante, conversations antérieures et versions. Le plafond visible est 40 entrées ; les plus anciennes sont purgées. L’ancien nom non segmenté est supprimé lors de l’initialisation. Cette isolation par nom utilisateur ne constitue pas une preuve de chiffrement local.
2. **Activité/aperçu serveur.** Une table Supabase `canvas_draft_activity` reçoit utilisateur, clé brouillon, éventuel identifiant de création, format, nombre de calques, miniature et aperçu. Le code limite les miniatures à 60 000 caractères et aperçus à 300 000 ; miniature réduite à 160 pixels. Ces écritures ne contiennent pas le document complet, ses calques ou toutes les ressources. Le contrôle de fréquence sans nouvel aperçu tient compte d’une signature et de 10 minutes ; ce n’est pas un intervalle de synchronisation garanti.
3. **Création enregistrée côté serveur.** `creativeEditor` appelle `creative-editor` avec `save` (creativeId, imageDataUri, éventuel aiEdited) ou `saveNew` (imageDataUri, format, brandId, éventuel origin/aiEdited). Le corps visible contient l’image aplatie, pas l’intégralité du document éditable. Le client rattache ensuite l’état complet à l’identifiant retourné dans IndexedDB.

**Conséquence : la reprise interappareils des calques et versions n’est pas démontrée.** Dans ces chemins, on prouve un document local et un rendu/aperçu distant. D’autres mécanismes hors des modules inspectés restent possibles. Ne pas promettre la disparition ou la récupération des brouillons sans essai dédié.

### Autosauvegarde

Dans CanvasEditor, un changement du document, de conversation ou de versions programme la persistance après **600 ms** d’inactivité. Une miniature est préparée séparément après **2,5 s**, avec `requestIdleCallback` et délai de secours **2 s**. Un passage en arrière-plan tente de finaliser la miniature en attente. La fermeture interne de l’éditeur attend aussi une sauvegarde et peut joindre une prévisualisation. Ce n’est pas la preuve d’une sauvegarde garantie lors d’une fermeture brutale du navigateur.

Plusieurs fonctions IndexedDB et d’activité serveur capturent les erreurs sans les remonter. Risque à tester : message de sauvegarde visible et document local absent si stockage indisponible/quota dépassé. Le code seul ne prouve pas que ce défaut se produit réellement.

### Historique réellement transmis à l’IA

- Conversation restaurée limitée aux **30 derniers messages**, chacun à **2 000 caractères**.
- Jusqu’à **5 conversations antérieures** conservées dans cette structure.
- La requête IA prend seulement les **10 derniers messages** non vides et non marqués en erreur, en commençant par un message utilisateur.
- Les plans en attente sont convertis en **expired** lors de la restauration : ils ne deviennent pas automatiquement exécutables après rechargement.
- Jusqu’à **10 versions** de document dans ce mécanisme ; original numéro 0 protégé de la suppression par ce code.

Cela confirme une mémoire conversationnelle bornée, pas un apprentissage du modèle ni une mémoire illimitée.

### Limites des opérations assistant

La demande utilisateur est bornée à 1 000 caractères. Pour les opérations génératives image, le client borne le prompt à 1 500 caractères, le résumé à 120, les références produit à 2 et les éditions à 3. Il résout les identifiants de calques et de zones dans le document courant et normalise des paramètres comme l’opacité ou l’angle.

Le déclencheur de confirmation observé est précis : **au moins une édition image générative, ou au moins deux actions autres que ask_user/make_texts_editable**. Des actions graphiques isolées peuvent s’appliquer sans cette confirmation. Les grandes zones à effacer peuvent être dirigées vers le parcours de remplacement d’image plutôt que la gomme locale ; le contrôle utilise une proportion de surface de 12 %. Ces choix prouvent une répartition du travail entre outils et non l’emploi d’un seul modèle universel.

Aucun identifiant supplémentaire de modèle génératif, LLM ou fournisseur n’apparaît dans les deux dépendances nouvellement inspectées.

### Implications supplémentaires pour TikTrends

La partie à dépasser plutôt qu’à reproduire aveuglément est la sauvegarde : distinguer explicitement **brouillon sur cet appareil**, **document synchronisé**, **rendu publié**, et afficher les échecs. Conserver une source de vérité du document indépendante du PNG ; vérifier la reprise sur un autre appareil et la restauration après perte réseau. La mémoire Jarvis doit exposer ses limites et conserver une synthèse structurée du brief, au lieu de dépendre uniquement des derniers messages.

Repères : EditionPage vers 28 000 (activité serveur), 29 100 (versions), 31 200–33 000 (conversation), 33 200–36 200 (IndexedDB) ; CanvasEditor vers 724 011–725 800 (autosave), 616 681 (normalisation éditions), 619 074 (confirmation) ; creativeEditor complet 1,1 Ko (save/saveNew/decline).


## Complément — pistes fournisseur et langage source, audit élargi

Recherche statique étendue aux **22 fichiers `/tmp/creaflow-*` présents lors de cette passe** (21 JavaScript et 1 CSS), incluant FlowPage, VideoSpace, StudioPage, index public, pages légales et aide. Aucun fichier tiers exécuté, aucune URL dérivée/devinée, aucun appel API ou génération.

### Nouvel indice fournisseur : filtre d’erreurs

Dans `creaflow-public-index.js`, vers le caractère 176 797, un filtre d’erreurs utilisateur énumère explicitement **openrouter, anthropic et claude**, parmi network, timeout, JSON, noms de fonctions métier, permissions et RLS. Quand une erreur contient ces termes, le client affiche une erreur générique plutôt que le détail brut.

C’est **un indice concret d’une intégration anticipant ces noms dans ses erreurs**, mais pas une preuve de fournisseur actuellement utilisé : cette liste peut couvrir d’anciens services, plusieurs fournisseurs ou des cas défensifs. Aucun appel direct à OpenRouter/Anthropic, identifiant de modèle ou réponse fournisseur n’accompagne cet indice dans le corpus. Ne pas transformer cet indice en « Flow utilise Claude via OpenRouter ».

Les fichiers inspectés pointent aussi vers `https://api.creaflowai.fr`, leur propre façade API. Son nom ne permet pas de connaître le langage serveur ni le fournisseur utilisé derrière.

### Sourcemaps et TypeScript

Aucun commentaire **sourceMappingURL** ou **sourceURL**, aucun **sourcesContent**, aucune référence explicite à tsconfig/TypeScript, ni URL webpack:// ou vite:// retrouvée dans ces 22 fichiers. Aucun fichier sourcemap n’est donc annoncé par ce corpus. Nous n’avons pas essayé d’ajouter `.map` à une URL compilée ni exploré des chemins supposés.

Cette absence n’exclut ni TypeScript avant compilation, ni des sourcemaps privées téléversées chez Sentry. Les identifiants Sentry et la date de release ne donnent pas accès au code source et n’identifient pas son langage. **JavaScript distribué reste confirmé ; TypeScript source reste indéterminé.**

### Faux positifs éliminés

- `Sora` dans CanvasEditor est une **famille de police**, pas une preuve du modèle vidéo OpenAI.
- Les occurrences textuelles courtes `veo` correspondent notamment à des identifiants graphiques tels que moveObject/controlsAboveOverlay ou activeOnly : aucune preuve de Google Veo.
- Les entrées `model`/`provider` des workers appartiennent à ONNX Runtime et à ses execution providers ; elles ne désignent pas des fournisseurs de génération commerciale.
- Aucun champ littéral modelId, model_id ou modelName retrouvé dans le corpus.

**Piste restante légitime :** demander une documentation fournisseur à l’éditeur, ou examiner une réponse déjà existante accessible normalement et révélant un identifiant de modèle. Les fichiers actuels ne permettent pas de nommer avec certitude les modèles de rédaction, génération d’image, animation ou voix. Une génération payante n’est ni nécessairement probante ni réalisée ici.
