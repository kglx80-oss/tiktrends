# Architecture du studio visuel CreaFlow — analyse statique approfondie

Date : 6 octobre 2026. Analyse en lecture seule de deux bundles publics déjà téléchargés. Aucun code fournisseur exécuté, aucune requête API, aucune génération et aucune mutation de compte. Cette note décrit des preuves du client web et des implications pour TikTrends ; elle ne reproduit pas l’implémentation fournisseur.

## Conclusion

Le studio observé est un éditeur métier React à étapes prédéfinies. Son graphe visuel est calculé à partir de l’état du projet : ce n’est pas la preuve d’un éditeur universel de workflows où l’utilisateur câble librement des agents. La cohérence résulte surtout d’un schéma de projet structuré, d’un calcul des impacts des modifications et de commandes serveur distinctes. Le montage possède une prévisualisation interactive locale et un rendu final demandé au serveur. Le fournisseur du rendu et les modèles IA restent inconnus dans ces fichiers.

## Sources reproductibles

| Fichier | SHA-256 |
|---|---|
| `/tmp/creaflow-VideoSpace-CqMvBKyR.js` | `734973e642d22f8b4844996e4eed347e0fd3377ffe1cffbd2ad631e2a5f9321e` |
| `/tmp/creaflow-FlowPage-ClGatV98.js` | `aa13a488e1078237710b2d50614ba4e16c9bc589e3eba61fbd1d620e84416d97` |

Les noms de fonctions minifiées et positions en caractères ci-dessous ne valent que pour ces fichiers. Ils servent à retrouver les preuves, pas à nommer une architecture officielle.

## 1. Surface visuelle et graphe

- **Cartes HTML, liens SVG** : `Pp` dans FlowPage (position 179884) construit un SVG contenant un chemin par lien ; les liens menant à un traitement actif reçoivent une animation de tirets. Les cartes sont des composants distincts.
- **Graphe métier déterministe** : `pp` (141843) calcule les positions et relie la séquence produit → style → scénario → personnages/éléments → plans → montage → résultat. Source publicitaire, références de style et de personnages sont connectées à leurs blocs ; voix et musique rejoignent le montage. Présence des blocs et hauteurs dépendent des données et de l’étape atteinte.
- **Plans groupés** : le nombre de plans détermine une grille au sein d’un groupe. Déplacer le groupe déplace ses plans ; les positions personnalisées excluent les identifiants de plans individuels dans cette fonction. Les liens sont reconstruits après déplacement.
- **Pan/zoom maison dans le module observé** : composant `ds` de VideoSpace, repérable par `forwardRef` et les bornes `oo=.2,no=1.5`. Transformations CSS translation + échelle, zoom centré sur pointeur, fit automatique, focus d’un bloc, décalage pour réserver le panneau latéral. Échelle bornée de 20 % à 150 %. ResizeObserver adapte l’ajustement.
- **Interactions** : Pointer Events, capture du pointeur après seuil de déplacement, compensation du zoom lors du déplacement d’un bloc, suppression du clic après drag, zone `data-no-pan` pour préserver les contrôles. La surface utilise `touchAction:none`, ce qui mérite une conception mobile explicite.
- **Disposition personnelle locale** : `Pl`, `vn`, `us` (VideoSpace vers 72147) lisent/écrivent les positions dans localStorage sous une clé par espace/projet. Cela confirme une persistance locale de disposition, pas une synchronisation collaborative inter-utilisateurs. Retour à la disposition automatique prévu.

**Interprétation** : les courbes rendent lisible une chaîne fixe ; leur présence ne prouve pas que le serveur exécute un DAG arbitraire. Aucun besoin établi de React Flow, WebGL ou d’une bibliothèque de graphes externe pour cette surface vidéo. Leur absence dans ces deux modules n’exclut pas leur présence ailleurs.

## 2. Modèle de données visible

FlowPage expose des lectures de `video_projects`, `video_shots`, `video_elements`. Les convertisseurs `Ia`, `Ea`, `Ma` normalisent les données.

| Niveau | Données caractéristiques visibles |
|---|---|
| Projet | statut, format, rendu/look, langue, voix et locuteurs, produit, photos choisies, style produit, inspirations, publicité source, musique, sous-titres, options de montage, versions et rendus |
| Plan | index, description visuelle, narration, texte écran, durée, début/fin, personnage parlant, produit visible, image clé, choix d’images, clip, références, ambience, état/essais, problème détecté de clip |
| Élément récurrent | clé, type, apparence, planche de référence, état et nombre d’essais |

Les champs constituent une séparation utile entre intention créative et médias produits. Le schéma de base complet, ses contraintes, ses droits et la validation serveur ne sont pas accessibles ici.

## 3. Calcul des impacts d’une modification

La fonction `Qr` de VideoSpace (à partir de 6890 environ ; repère `recompile:y`) compare ancien et nouveau projet. `qr` (6462) rapproche les plans avec une origine explicite, sinon par correspondance description/narration, sans réutiliser deux fois le même ancien plan.

| Modification détectée | Impact calculé côté client |
|---|---|
| Look ou mode de rendu | Redessiner les images |
| Description visuelle d’un plan ou nouveau plan | Redessiner ce plan |
| Produit/style produit/photos | Redessiner les plans associés où l’ancien plan montrait le produit |
| Narration, ordre/nombre de plans, voix, locuteurs | Refaire la voix si une voix est active |
| Durées/ordre/nombre de plans sans voix | Recalculer les temps |
| Ambiance musicale | Recompilation signalée |

Le résultat contient notamment les plans retirés, nombres d’images à refaire et indicateurs de voix/temps/recompilation. Il alimente un résumé avant action. **C’est une preuve de calcul d’impact dans l’interface ; pas une preuve que le serveur applique exactement les mêmes règles ni qu’aucun média périmé ne peut survivre.** Il faudrait vérifier ce contrat par tests de scénarios avec écritures autorisées pour certifier son efficacité réelle.

## 4. Commandes et états de production

`je` dans FlowPage (109253) construit une requête POST vers le chemin `functions/v1/video`, authentifiée avec la session. Aucun appel effectué pendant cet audit.

Commandes visibles : storyboard, dessin produit, édition du projet, choix d’image clé, nouvelle voix, animation, confirmation des personnages, reprise voix, dessin personnage, casting, clip importé, musique, montage.

L’interface distingue les états de projet : préparation storyboard, personnages prêts, storyboard prêt, animation, rendu, terminé, échec. `pd`/`lp` associent état de projet et étape active, puis marquent les étapes précédentes terminées et les suivantes à venir. Cette présentation réduit l’ambiguïté sur la prochaine action, mais ne constitue pas un journal complet de jobs serveur.

## 5. Temps réel, reprise et erreurs

- `dd` (118102) s’abonne aux changements Postgres des trois tables ; les événements mettent à jour projet/plans/éléments et retirent les éléments supprimés.
- `md` utilise un rechargement initial et recharge lors de reconnexion/statut de projet changé. En traitement actif **et sans abonnement connecté**, repli par interrogation toutes les 30 secondes (`fd=3e4`).
- Images échouées : bouton ciblé envoyant une édition avec reprise du plan ; personnages : redessin ciblé ; voix : commande dédiée de reprise.
- Les états pending/running/failed, compteurs d’essais et problèmes de clips sont distincts. Les commandes de l’interface sont désactivées pendant certaines actions en cours.
- L’enveloppe d’erreur comprend code, texte et éventuellement crédits ; une fonction choisit une erreur traduite connue ou une erreur générique.

**Non démontré** : idempotence serveur, file de tâches, fournisseur de jobs, concurrence multi-onglets, transaction des crédits, backoff, annulation effective, récupération après panne serveur. Un bouton désactivé n’empêche pas à lui seul un double traitement.

## 6. Versions et conservation

- `keyframeOptions` et la commande de choix d’image permettent de revenir à une image alternative.
- `nd` (114482) lit une liste de rendus avec version, vidéo, poster, version propre, durée, date et raison : premier rendu, montage ou reprise.
- Le montage compare les réglages locaux à ceux du projet, compte les modifications en attente, propose appliquer ou revenir aux réglages enregistrés, puis détecte l’ajout d’un nouveau rendu.
- Les champs `version`, `renders`, `voiceTakes` et compteurs de reprises rendent une histoire partielle visible.

**Limite** : cela ne prouve pas un historique immuable complet ni une restauration transactionnelle du projet entier. Le bouton de retour des réglages est une annulation locale, pas nécessairement un rollback serveur.

## 7. Montage : pourquoi la prévisualisation paraît rapide

Le composant `fl` dans VideoSpace compose la prévisualisation avec vidéo/image, pistes audio, textes et images superposés en HTML/CSS. Il synchronise musique et ambiance avec l’horloge de lecture ; requestAnimationFrame pilote les mises à jour, limitées autour d’une mise à jour par 50 ms. Les écarts de temps des pistes sont corrigés.

Des réglages de sous-titres, couleurs, polices, position/taille, surimpressions, sons de transition, filtres et zoom de coupe apparaissent dans le client. Les polices possèdent des métriques CSS et des métadonnées nommées ASS. **ASS est un indice compatible avec un pipeline de sous-titres serveur ; il ne confirme pas FFmpeg.** Aucun nom FFmpeg ou Remotion retrouvé dans ces deux fichiers.

Le montage final est envoyé à la commande serveur `montage` avec réglages et textes modifiés. Ainsi, ajuster un texte peut être prévisualisé localement avant un nouveau rendu. **La parité exacte entre aperçu et fichier exporté reste à tester.**

Un élément HTML canvas existe également pour extraire une image d’une vidéo importée (`Vl`). Il ne faut donc pas dire « aucun canvas dans l’application » : la surface de nœuds est DOM/SVG, tandis qu’un canvas technique sert à cette extraction.

## 8. Implications concrètes pour nos studios

1. Commencer par un dossier créatif canonique : produit, références, style, scénario, plans, médias, versions, droits et provenance. Le graphe ne doit pas devenir une seconde source de vérité.
2. Définir des commandes métier bornées : préparer scénario, générer une image de plan, choisir une variante, générer voix, animer, assembler. Chaque commande doit avoir entrées validées, estimation de coût, résultat versionné et état observable.
3. Construire un calcul d’impact partagé ou contractuellement testé entre interface et serveur. Avant exécution, afficher précisément les plans/médias conservés ou à refaire et le coût attendu.
4. Donner à Jarvis une cible explicite : projet/version/bloc/plan sélectionné. Une demande doit produire une proposition structurée et revue avant les actions payantes ; la connaissance produit et les instructions doivent conserver leur provenance.
5. Préserver les versions acceptées et bloquer l’usage silencieux d’un média devenu périmé. Comparaison avant/après et reprise d’une étape constituent une priorité supérieure aux animations du graphe.
6. Séparer aperçu et rendu ; adopter un contrat commun de chronologie, dimensions, polices et surimpressions, vérifié sur des exports de référence.
7. Prévoir jobs idempotents, reconnexion et rattrapage, budgets, reprises ciblées et restauration. Ces garanties sont nécessaires chez nous même si l’audit ne prouve pas leur présence chez CreaFlow.
8. Offrir une vue liste guidée/clavier/mobile utilisant les mêmes données. Le canvas peut être une représentation additionnelle après décision de périmètre ; cette recherche n’autorise pas son développement si l’interdiction antérieure reste active.

## 9. Vérifications d’acceptation à préparer

- Modifier une narration conserve les images compatibles et renouvelle uniquement les sorties dépendantes.
- Remplacer le produit invalide tous les médias qui montrent ce produit, y compris les nouveaux plans.
- Réordonner les plans maintient les bons identifiants et resynchronise audio, textes et durée.
- Une reprise réseau ne double ni job ni facturation.
- Un job échoué conserve les derniers médias validés et expose une reprise ciblée.
- Un changement de version pendant un job empêche une sortie ancienne d’écraser la version courante.
- Un export correspond à l’aperçu pour police, cadrage, sous-titres, transitions et durée.
- Toutes les étapes restent utilisables sans déplacement à la souris et sur petit écran.

Ces points sont des recommandations originales pour TikTrends. Aucune performance de génération, qualité de modèle ou fiabilité serveur CreaFlow n’a été mesurée par cette analyse statique.

## Complément coordonné : ne pas confondre les deux éditeurs

L’agent intégrateur signale une preuve distincte dans le bundle public `CanvasEditor-DFI1xmm3.js` : Fabric.js 7.4.0 pour l’éditeur d’image, et des modèles ONNX de retouche/détourage/sélection. Cette preuve est rapportée par l’autre piste d’audit et n’a pas été vérifiée dans cette analyse à deux fichiers. Elle ne change pas le constat VideoSpace : le graphe de production vidéo étudié est HTML/SVG. Fabric dans l’éditeur d’image ne prouve pas Fabric dans le graphe vidéo, et des modèles de retouche locale ne permettent pas de nommer les fournisseurs de génération vidéo.

## 10. Seconde passe — contexte IA ciblé et continuité des références

Cette passe approfondit uniquement les deux fichiers précédents, sans exécuter les chemins découverts.

### La sélection devient une pièce de contexte explicite

Dans VideoSpace, `Jl` calcule une cible comme plan numéroté, montage, type/clé de personnage, photo produit ou référence d’inspiration. L’interface remonte un objet composé de **référence, libellé, URL d’image** (`ref`, `label`, `imageUrl`). L’image associée varie réellement selon la cible : image clé du plan, planche personnage, photo produit, inspiration, poster final.

FlowPage construit ensuite le contexte attaché au message avec produits et concurrents sélectionnés, références à adapter, focus courant et identifiant du message vidéo. Le message normal peut joindre séparément images et vidéos. Les raccourcis de demande scénario/style attachent l’identifiant vidéo ou la clé de style.

**Preuve et limite** : ce n’est plus seulement un placeholder contextuel ; le client prépare un objet structuré envoyé à sa couche de conversation. Cela ne révèle ni le prompt système, ni les outils du modèle serveur, ni la façon exacte dont celui-ci utilise les images.

### Sauvegarder avant de demander la suite

`du` (FlowPage 190610) sérialise la sauvegarde des propositions : une modification en attente remplace la précédente encore non envoyée, les envois se succèdent ; une fonction flush attend la fin. Le bouton de préparation du scénario attend cette vidange avant d’appeler la conversation. C’est un mécanisme concret pour éviter que l’IA lise un ancien produit/style après une modification rapide.

**Limite** : les erreurs de sauvegarde sont interceptées et journalisées ; flush terminé ne constitue donc pas, à lui seul, une preuve de sauvegarde réussie. Pour TikTrends, le lancement dépendant devrait exiger un accusé de réception/version serveur plutôt que la seule fin de la promesse.

### Références typées et personnages réutilisables

- Les inspirations sont séparées par rôles de style, lieu et personnage ; certaines possèdent une cible. Les plans portent des références avec URL, rôle et note optionnelle, ainsi que leurs éléments récurrents.
- Les personnages et lieux ne sont pas seulement du texte libre : leurs éléments possèdent clé, apparence et planche d’images. Le bouton de casting associe un acteur à une clé d’élément.
- Une banque prédéfinie de **10 acteurs** est présente dans ce bundle : description d’apparence, portrait, planche et entier nommé seed. Cela démontre une base d’acteurs préparée. **Le champ seed ne prouve pas un modèle particulier ni que le serveur le transmet à un générateur.**
- Les photos produit choisies, style produit et inspirations sont conservés dans la proposition reconstruite par `dn` ; une réorganisation de plans peut préserver leur origine avec `from`.

**Implication** : la continuité visuelle semble recherchée par réutilisation de références explicites, pas seulement par un prompt général. La fidélité effective du produit/personnage entre images ne peut pas être certifiée sans examiner des générations comparables.

## 11. Seconde passe — voix, synchronisation et estimation économique

- Le plan distingue narration, texte écran, voix du locuteur, personnage parlant et indicateur de synchronisation labiale précise. Les identifiants de voix ne révèlent pas ici leur fournisseur.
- La durée d’un plan avec voix peut être laissée à null dans l’ajout de plan ; sans voix, une durée est saisie ou estimée. Le projet reçoit ensuite des timestamps de début/fin et des mots avec leurs temps. Cela permet sous-titres et montage alignés sur un résultat audio, plutôt qu’une simple estimation textuelle.
- L’apparente forme d’onde de la carte voix (`ho`) est calculée à partir des mots et de leur longueur. **Ce dessin n’est pas la preuve d’une analyse d’amplitude audio.**
- Le calcul d’estimation d’animation prend en compte mode de rendu, présence de voix, nombre de reprises, secondes, parole, option précise et clip fourni par l’utilisateur. Un dépôt de crédits est aussi transmis au calcul du reste affiché. Les formules importées ne sont pas établies dans cette note.
- Le gestionnaire `Id` empêche deux actions concurrentes dans son instance, vérifie un solde côté client avant action, puis rafraîchit le solde pour une action estimée payante. Il gère les refus crédits/abonnement et certains retours demandant une confirmation payante avec montant fourni par le serveur.
- La commande de montage depuis VideoSpace est appelée avec estimation locale zéro. **Cela ne démontre ni gratuité universelle ni absence de limite**, car les codes incluent notamment des limites montage et des variantes payantes d’autres opérations.

Pour TikTrends : estimation par opération, devis serveur lié à une version du projet, crédits réservés puis régularisés, reprise identifiée et absence de double facturation doivent former un contrat explicite. Le front seul ne garantit aucun de ces points.

## 12. Point de vigilance pour la poursuite de l’audit en lecture seule

La fonction `yd` de FlowPage peut préparer automatiquement un dessin produit lorsque le brouillon vidéo comporte produit et style produit, sous conditions d’état et de quota. Déclenchement différé de 1,2 seconde ; pendant l’état running, répétition toutes les 4 secondes via la commande de dessin. Le code ne permet pas de distinguer ici traitement nouveau et récupération serveur d’un traitement existant.

**Conséquence pratique** : ouvrir un nouveau brouillon stylisé peut provoquer une commande sans clic sur « générer ». Cette piste a été découverte uniquement par lecture statique ; elle n’a pas été déclenchée par cet agent. La poursuite sans mutation doit privilégier les bundles et les projets terminés déjà inspectés, sans supposer que toute navigation est purement passive.

## 13. Priorités affinées pour TikTrends

Les nouvelles preuves renforcent trois priorités :

1. **Contexte sélectionné vérifiable** : montrer à Jarvis et à l’utilisateur la cible exacte, la version et les références jointes ; ne pas dépendre d’un titre de carte ou du dernier message seul.
2. **Barrière de sauvegarde fiable** : garantir que produit/style/scénario utilisés par une action sont bien la version confirmée côté serveur ; afficher un échec de sauvegarde avant toute génération dépendante.
3. **Références de continuité** : produit réel, identité visuelle et personnages sous forme d’actifs réutilisables versionnés, avec règles de propagation et tests de fidélité. Les prompts complets, modèles et seeds éventuels restent des détails remplaçables derrière ce contrat.

La proposition est une architecture originale inspirée de mécanismes observables. Aucun prompt propriétaire ni description d’acteur n’est reproduit ici.

## 14. Troisième passe — imports publics et nouvelles preuves techniques

Les ressources suivantes, référencées par les imports publics, ont été lues comme texte, jamais exécutées. Le téléchargement initial de cet agent a échoué en résolution DNS ; l’intégrateur a fourni les quatre modules supplémentaires via sa voie autorisée.

| Ressource locale | SHA-256 |
|---|---|
| `public-index.js` | `517ecd768b59326a762692a449deb4a7f36e53b7fb957548550598c862653bd9` |
| `FlowChatContext-DMSWDiNh.js` | `0699ca5ce30c120499c721927a128df42ecc4934dd0092712eacc4b8c31e29cd` |
| `proposal-dZBX0yTQ.js` | `ebb465d6e3c7279b418ac8869408bd14deca5924f67a052264c4490fce167193` |
| `videoHandoff-CTl6UdkI.js` | `2173e4e0cefe10c6d39a0fdac7e6a20ff04c8251c7b913ffe12624d8ceac8332` |
| `batchSettings-CTSSGXsc.js` | `a0e796c2c2a3731de9c6e8558dd2386d0f0e05da3a7e13558f65521f8653ca64` |

### 14.1 Le moteur de conversation est derrière une frontière serveur confirmée

`FlowChatContext-DMSWDiNh.js` envoie au service `brand-assistant` une commande de message avec marque, conversation, texte, sélection de références, images, vidéos, langue, contexte mobile/desktop, logos et contexte attaché. Le flux retour est lu par un lecteur de réponse et découpé en messages JSON préfixés `data:` ; la fin normale attend un événement done ou error. AbortController permet au client d’interrompre la lecture/requête.

**Certitude élevée** : les choix du modèle et le prompt système ne sont pas paramétrés explicitement dans cette requête visible. Aucun nom de modèle trouvé dans ce module. **Inconnu** : interrompre la requête garantit-il l’annulation du travail serveur et des coûts ? Le client ne le prouve pas. La présence d’un flux structuré ne prouve ni LangChain, ni un SDK d’agents, ni un fournisseur LLM donné.

### 14.2 Une piste concrète pour identifier le modèle de dessin produit

Le normaliseur `je` de `proposal-dZBX0yTQ.js` conserve des champs facultatifs **model** et **requestId** au sein de l’objet de dessin produit. Il vérifie sa correspondance produit/style, son statut, une date, une URL HTTPS lorsqu’il est terminé et, si fourni, un identifiant de base correspondant.

**Confirmé** : le schéma client accepte une provenance de modèle pour cette opération. **Non confirmé** : qu’une proposition existante fournisse réellement ce champ, ni sa valeur. Une réponse déjà obtenue légitimement ou un export de projet déjà existant pourrait apporter la preuve sans lancer une nouvelle génération. Il ne faut pas invoquer l’API de dessin pour le découvrir, car elle peut générer ou consommer des crédits. Cette piste ne concerne pas automatiquement les modèles scénario, animation ou voix.

### 14.3 Catalogue de voix exploitable pour une recherche primaire

Le bundle principal contient **136 entrées de voix**, dont 41 marquées français et 95 anglais, avec clé, identifiant fournisseur de type voiceId, libellé, accent, âge, timbre descriptif et vitesse estimée en mots/seconde. Exemples de recherche : Austin `Bj9UqZbhQsanLzgalpEG`, Priyanka `BpjGufoPiobT79j2vtj4`.

**Confirmé** : le catalogue et les identifiants existent dans ce build. **Pas encore confirmé dans cette note** : fournisseur auquel ces identifiants correspondent, modèle TTS sélectionné et usage actuel côté serveur. Une correspondance d’identifiant dans une documentation ou bibliothèque officielle du fournisseur serait plus probante qu’une ressemblance de noms commerciaux. Les noms de modèles de génération restent inconnus ici.

### 14.4 Le scénario passe par une validation structurée stricte

`proposal-dZBX0yTQ.js` contient un validateur de proposition : langue, format, rendu, longueurs de texte, nombre de plans, voix reconnue, cohérence langue/voix. Pour plusieurs locuteurs, il refuse les noms doublonnés et les voix identiques attribuées à deux personnes. Il groupe des plans successifs par locuteur et estime la durée depuis les mots/seconde, avec un délai de changement de locuteur ; le dépassement peut être exprimé en mots à retirer.

Le bundle principal expose des bornes de ce build : 24 plans vidéo maximum, 12 slides, 60 secondes, trois photos produit, six inspirations, trois références personnages et quatre locuteurs. Ces valeurs sont des limites client observées, pas une déclaration universelle des offres ni une preuve des limites serveur.

**Implication pour TikTrends** : faire produire à Jarvis une proposition typée, la valider et expliquer les incohérences avant génération. Une interface spectaculaire ne remplace pas ces règles de cohérence.

### 14.5 Précision importante : l’aperçu montage part d’une vidéo propre

Dans le composant `fl` de VideoSpace, la vidéo principale est **cleanUrl**, puis le navigateur superpose les réglages de montage. Si cette URL n’est pas disponible, il existe un repli visuel sur une image et une piste voix. L’aperçu n’est donc pas démontré comme réassemblant tous les clips indépendants dans le navigateur : il exploite un média de base préparé, complété par une composition locale.

**Confirmé** : édition instantanée de surimpressions et audio autour d’une base propre, puis demande de rendu au serveur. **Inconnu** : qui produit cleanUrl, quel encodeur crée finalUrl, et si le serveur emploie FFmpeg, Remotion, MoviePy ou un autre moteur. Les références ASS restent un indice compatible avec du sous-titrage, pas une attribution moteur. Aucun encodeur navigateur/WASM ou MediaRecorder identifié dans les deux modules vidéo examinés.

### 14.6 Ce que nous savons des coûts et temps affichés

Le bundle principal expose des calculs différents selon rendu animé/réaliste, durée, plans parlés, précision labiale et médias utilisateur. Les clips propres fournis par l’utilisateur sont exclus de certaines estimations de génération. Des paliers de durée et un dépôt déjà crédité interviennent dans le reste estimé. Les constantes de temps affichées prévoient séparément animation, montage et synchronisation labiale.

**Limite décisive** : un tarif ou une durée estimée n’identifie pas un modèle. On ne peut pas conclure « Kling » ou « Veo » parce qu’un palier dure quinze secondes, ni « ElevenLabs » parce qu’un prix varie selon caractères. Il s’agit de logique produit locale ; les coûts fournisseur réels restent invisibles.

### 14.7 Raccordement studio/conversation

`videoHandoff-CTl6UdkI.js` conserve l’identifiant de conversation, l’identifiant du message et un indicateur d’ouverture de l’espace, puis navigue vers l’application après validation de leur forme UUID. Cela explique un retour direct depuis une création vers son contexte conversationnel. Ce module ne transporte ni vidéo entière ni prompt caché.

`batchSettings-CTSSGXsc.js` contient principalement des bornes et la langue de formulaire ; aucune piste fournisseur supplémentaire trouvée. L’inventaire des imports ne doit donc pas être confondu avec une preuve d’un moteur de génération.

## 15. Matrice des pièces encore manquantes après cette passe

| Pièce | Preuve accessible maintenant | Recherche suivante non générative | Statut |
|---|---|---|---|
| Modèle dessin produit | Champ optionnel model/requestId dans proposition | Export ou réponse déjà existante autorisée | Nom inconnu |
| Fournisseur voix | 136 voiceId et métadonnées | Correspondance officielle exacte d’identifiants | À confirmer |
| Modèle TTS précis | Aucun champ de modèle repéré | Déclaration fournisseur/éditeur ou métadonnée existante | Inconnu |
| Modèle scénario/chat | Transport brand-assistant sans modèle | Déclaration technique publique ou métadonnée existante | Inconnu |
| Modèle animation/lipsync | Commandes et facturation distinctes | Provenance d’un rendu existant ou déclaration éditeur | Inconnu |
| Encodeur montage final | cleanUrl/finalUrl, réglages, indice ASS | Métadonnées d’un export autorisé déjà disponible | Inconnu ; métadonnées parfois insuffisantes |
| Prompt système | Schémas et références, pas prompt | Publication volontaire de l’éditeur | Inconnu |

Aucune action de génération ni lecture d’une API métier n’a été effectuée par cet agent. Les recommandations restent originales : contrat de projet versionné, validation, propagation ciblée, rendu reproductible et observabilité des fournisseurs. Le choix exact des modèles peut évoluer sans modifier l’atelier si ces contrats sont stables.
