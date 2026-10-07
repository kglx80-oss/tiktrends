# TikTrends Studios et Jarvis

## Cahier des charges fonctionnel et technique

Version 1.0 — 7 octobre 2026. Commanditaire : Kevin Guilbaux. Destinataire : Claude, développeur et intégrateur TikTrends. Rédaction : Codex, à partir des mandats Kevin, de la documentation TikTrends et de l’audit CreaFlow des 6–7 octobre.

**Décision produit : transformer les studios existants en un atelier créatif unifié, guidé par Jarvis, alimenté par la marque, les produits, la Veille et les apprentissages, avec des prompts administrables réellement exécutés et un historique fiable.** L’expérience doit approcher la fluidité observée chez CreaFlow, conserver l’identité TikTrends et corriger les défauts de fidélité, de propagation et de contrôle constatés pendant l’audit.

Ce dossier spécifie le système à construire. Il ne déclare aucun développement réalisé, aucune qualité de génération démontrée et aucun prompt privé CreaFlow récupéré. Les prompts livrés sont originaux, versionnés et à évaluer. Le score historique 75/100 mesurait la préparation de l’audit ; il ne limite pas le périmètre spécifié et ne certifie pas la parité du futur produit.

## 1. Mandat et règles de lecture

### 1.1 Autorité et moment de l’exécution

Le mandat présent autorise la conception complète des nouveaux studios, du canvas métier, du registre de prompts et des évolutions ciblées nécessaires. Il remplace, pour ce périmètre documentaire, les anciennes exclusions de conception Canvas et moteur. **Il ne relance pas Claude pendant la pause décidée le 7 octobre et ne déclenche ni migration ni publication par la rédaction de ce dossier.** À la reprise autorisée, Claude peut exécuter les lots définis et leurs décisions par défaut sans solliciter Kevin pour les choix techniques ordinaires.

Conserver les règles existantes : aucun changement d’offre, de prix, de droits acquis ou de protections CI ; aucune suppression de fonction ou perte de données ; aucun nouveau connecteur publicitaire sans mandat ; aucune fixture métier en production. Les fournisseurs existants sont réutilisés. Une clé, un abonnement, une dépense hors plafond ou une migration destructrice manquants constituent un blocage ciblé, pas une permission implicite.

L’autonomie demandée signifie continuer les lots indépendants, documenter les blocages et reprendre au checkpoint. Elle ne permet pas d’inventer une preuve, de contourner une protection ni de déclarer « 100 % » avec des exigences non vérifiées.

### 1.2 Fichiers normatifs du dossier

1. `00-LIRE-EN-PREMIER.md` : ordre de lecture et consigne de démarrage autonome.
2. Ce cahier : produit, parcours, architecture, contraintes et lots.
3. `02-PROMPTS.json` : instructions originales, variables, schémas et règles de chaque tâche ; état initial draft.
4. `03-CONTRATS.schema.json` : schémas JSON des résultats IA et contrats centraux ; ils doivent être complétés par les contrôles sémantiques définis ici.
5. `04-RECETTE.csv` : exigences identifiées et preuves d’acceptation, initialement non exécutées.
6. `05-PREUVES-ET-DECISIONS.md` : faits observés, sources et décisions originales.
7. `06-PLAN-EXECUTION.md` : dépendances, propriété des fichiers, checkpoint et livraison.
8. `07-PROMPTS-LISIBLES.md` : vue de lecture générée de `02-PROMPTS.json`, sans autorité concurrente.

En cas de conflit : dernier mandat humain > ce dossier v1.0 > anciennes propositions v0.8 > rapports historiques. Dans le dossier, le cahier fixe les règles métier, le JSON les instructions et formats précis, la recette leur preuve. Claude corrige toute contradiction avant d’exécuter l’étape concernée et consigne sa décision. Ne pas appliquer deux machines d’états différentes de l’ancien contrat.

## 2. Résultat métier et couverture

### 2.1 Boucle complète

Sources autorisées → observations → hypothèse → plan de test → brief → concepts → médias → montage → export → mesure → apprentissage → nouvelle itération.

Un utilisateur peut s’arrêter au brief ou exporter le plan pour produire ailleurs. Jarvis ne force pas la génération payante. La quantité de créations ne remplace ni la pertinence de l’hypothèse ni la mesure.

### 2.2 Studios concernés

| Surface actuelle | Cible obligatoire | Conservation |
|---|---|---|
| Pubs IA | Campagne avec concepts, angles, formats, variantes, lots bornés et provenance | Historique, quotas et liens existants |
| Image IA | Génération, composition fidèle produit, édition par calques, retouche masquée et déclinaisons | Images et téléchargements historiques |
| Vidéo IA | Scénario, personnages, storyboard, voix, animation/import, montage et versions | Vidéos déjà générées et fournisseur existant |
| Textes IA | Hooks, scripts, ad copy, CTA et variations liés au même brief | Copier/exporter sans lancer de média |
| Assets et Marque | Ressources typées, produits, styles, brand kits et références versionnées | Portées espace/marque et droits existants |
| Veille et Formats créatifs | Sources choisies → analyse → format → adaptation originale → test | Filtres, sauvegardes, concurrence, routes historiques |
| Jarvis | Assistant transversal, proposition ciblée et explication des dépendances | Chat et connaissances existantes |
| ADMIN | Prompts, connaissances, recettes de style, évaluations, routage et traces | Pas d’octroi de droits plateforme à un admin d’espace |
| Adsmap et Analytics | Chaque variante sélectionnée reliée au test puis à l’apprentissage | Données et protocoles existants |

L’entrée « Studios » regroupe les modes sans multiplier les moteurs. Les anciennes routes continuent de fonctionner et ouvrent le bon mode/contexte. Ne pas créer une seconde bibliothèque ou une seconde notion de marque. Les noms de routes nouveaux sont des propositions à mapper, pas des chemins prétendument présents.

### 2.3 Hors périmètre

Publication automatique d’annonces sur Meta/TikTok/Google, nouveaux connecteurs de collecte, refonte commerciale, clonage de code/visuels privés CreaFlow, entraînement d’un modèle propriétaire, collaboration temps réel CRDT complète et éditeur vidéo professionnel généraliste. Le montage demandé reste publicitaire : plans, coupes, transitions simples, textes, logos, voix, musique, sous-titres. L’absence de ces fonctions hors périmètre n’est pas un échec ; l’absence d’une fonction ci-dessus en est un.

## 3. État de départ à réconcilier

Le dossier local est documentaire : aucun dépôt applicatif, package.json ou lockfile TikTrends n’a été inspecté ici. Claude doit auditer son checkout courant avant modification.

Dernier état consigné : production observée `bc33cec8`, D/PR730 `612e95215dd31dd5509c92208f6dc86584c04af5`, E/PR729 `64780a08d39b5111376b9e201c6275b6d5d898a4`, intégration locale rapportée `2273ab32`, non assimilée à une publication. Ces valeurs sont un point de reprise historique ; vérifier les SHA actuels, ne pas les déployer aveuglément.

Les connaissances #724 sont publiées et raccordées au chat Jarvis selon les preuves consignées ; leur consommation par tous les studios n’est pas établie. Les anciennes ruptures incluent hypothèse/variable affichées mais non transmises, filiation serveur absente, reprise partielle des briefs et une fiche Adsmap par génération plutôt que par image. Certains lots récents peuvent les corriger : mapper avant de réécrire.

**Précondition bloquante de recette production Studio : #125, GET `/api/ad` avec écritures rapportées.** Auditer et rendre les lectures sans mutation métier, en déplaçant le travail nécessaire vers une commande explicite idempotente. La journalisation technique ordinaire n’est pas une création métier. Tant que ce point n’est pas prouvé résolu, aucune visite Studio production ne vaut recette autorisée en lecture seule.

Livrable initial de Claude : tableau capacité → route/fichier → producteur → consommateur → stockage → droits → fournisseur → coût → état réel/mock → delta requis, au SHA de départ. Reprendre Next/React/TypeScript, monorepo `product/apps/web` et packages core/db/ai/integrations, Drizzle/Postgres et adaptateurs IA **s’ils sont confirmés dans le dépôt**. Ne pas changer de stack pour imiter le tutoriel CreaFlow.

## 4. Parcours clients détaillés

### 4.1 Arrivée et reprise

Accueil affiche reprendre un projet, prochaine action d’un test et créer depuis une source. Chaque carte indique marque, type, aperçu, étape, disponibilité et date. Un traitement en cours se retrouve après fermeture du navigateur ; aucun nouveau job au rechargement. Un projet incomplet indique ce qui manque, sans bloquer la consultation.

Le choix de marque est visible avant toute écriture. Changer d’espace/marque annule les propositions non appliquées et vide le contexte de sélection ; conserver un brouillon dans sa portée d’origine. Une réponse IA tardive ne peut jamais remplir le formulaire de la nouvelle marque.

### 4.2 Démarrer depuis Veille

1. Sélectionner une ou plusieurs publicités accessibles, ou un format sauvegardé.
2. « Préparer une création » ouvre un panneau avec source, date, marque cible et ressources réellement disponibles : image, vidéo, transcription, texte, lien.
3. Jarvis décrit les éléments observables : hook, structure, démonstration, rythme, texte, CTA. Il distingue observation, mesure et hypothèse. Une durée de diffusion ne prouve pas la rentabilité.
4. Proposer au plus trois hypothèses avec changement isolé, preuve/source et mesure possible. L’utilisateur choisit ou rédige la sienne.
5. Créer un projet lié aux identifiants source/hypothèse/format. Importer la structure utile et les contraintes, pas le produit, la marque ou les allégations du concurrent.
6. Choisir un produit de la marque cible ; montrer les faits connus et les manques avant scénario. Si source supprimée plus tard, conserver un tombstone et les observations autorisées ; ne pas contourner la révocation d’accès.
7. Retour dans Veille conserve recherche, filtres et sélection. Le projet propose un lien vers la source et un lien vers le test.

### 4.3 Démarrer depuis Jarvis ou un brief libre

Jarvis reçoit l’intention, affiche le contexte marque/projet utilisé et distingue « proposer » de « produire ». Il pose uniquement les questions qui changent le résultat : produit absent, format requis, contradiction d’identité ou usage d’une image non autorisé. Préremplir le reste depuis les valeurs validées ; marquer les hypothèses comme à confirmer. Envoyer une demande conversationnelle ne vaut jamais approbation de génération.

La réponse devient une proposition structurée : objectif, sources, produit/photo, audience, hypothèse, variable testée, invariants, style, formats, texte, exclusions et prochain geste. « Ouvrir dans le studio » transporte des identifiants/version côté serveur, pas un gros prompt dans l’URL ni seulement sessionStorage.

### 4.4 Image et publicité statique

1. Produit : choisir la variante catalogue et **une photo précise**, visible avec ses composants obligatoires. Ajouter d’autres vues avec un rôle explicite.
2. Références : chaque fichier porte Produit, Identité personnage, Style, Composition, Logo ou Élément à intégrer. Un même fichier avec deux rôles crée deux associations explicites ; aucun rôle déduit silencieusement.
3. Style : recette originale versionnée et portée Produit/Décor/Global. Par défaut, le décor peut changer de matière ; le produit reste photographique.
4. Concept : prévisualisation du brief, angle, hook, placements, format et exclusions ; modifier sans génération. Textes séparés des pixels.
5. Mode « Produit fidèle » par défaut pour packshot : produit détouré non régénéré, décor généré séparément, assemblage déterministe. Mode « Mise en scène générée » disponible avec contrôle visuel obligatoire de l’identité.
6. Devis : montrer nombre d’images, taille, opération, crédits/quotas et plafond, ressources réutilisées et ressources refaites. Aucune case de paiement implicite.
7. Après approbation : cartes d’état par sortie, résultats utilisables indépendamment, échecs ciblés. Statut technique et statut qualité distincts.
8. Éditer : sélection, calques, recadrage, texte, logo, alignement, détourage, masque, retouche ciblée. Les actions géométriques sont gratuites côté IA et déterministes, sans promettre absence de coût d’infrastructure.
9. Décliner : 1:1, 4:5, 9:16 et formats déjà présents. Recomposer textes/positions avant de proposer une nouvelle génération. Respecter zones sûres par profil de canal versionné.
10. Choisir une variante, comparer à son parent, exporter et rattacher cette variante précise au test. Une génération de quatre images peut fournir quatre variantes distinctes.

### 4.5 Vidéo guidée et canvas

Entrées : produit, identité de marque, source/inspiration, intention, format, durée cible, mode voix off/parole synchronisée/sans voix, ressources importées.

Étapes visibles : Brief → Style et identités → Scénario → Storyboard → Voix et temps → Animation ou clips → Montage → Contrôle et export.

- Le scénario contient des plans identifiés de façon stable : fonction narrative, sujet, action, cadrage, caméra, lumière, environnement, présence produit, narration, texte écran et durée estimée.
- Les personnages récurrents possèdent une fiche identité versionnée : traits, cheveux, tenue, accessoires, vues nécessaires. Une planche 4 vues est optionnelle si la vidéo ne l’exige pas ; elle a son devis propre.
- Validation scénario puis références avant les images de plans. L’utilisateur peut modifier le texte sans perdre les médias déjà acceptés.
- Chaque plan a sa keyframe, ses variantes, un état qualité et les références utilisées. Choisir une keyframe ne détruit pas les alternatives.
- La voix utilise seulement la narration validée. Préécoute depuis une prise existante si possible ; nouvelle prise avec devis. Afficher la durée réelle, recalculer les temps, signaler le dépassement de durée cible.
- Voix off et lipsync sont des modes distincts. Un fournisseur sans lipsync ne peut pas être présenté comme synchronisation labiale ; proposer voix off/import ou blocage explicite.
- Animer seulement les plans approuvés. Importer un clip autorisé peut remplacer une animation ; il conserve durée, droits et origine. Aucun fournisseur appelé pour un clip déjà importé.
- Montage : ordre, trim, hold/loop explicite, transitions bornées, audio, gains, sous-titres, surimpressions, logos et zones sûres. Modifier l’ordre ne régénère pas les images ou la voix par défaut ; recaler les segments.
- Export : aperçu puis fichier complet, version, dimensions, durée, taille et contrôle lisibilité/audio. Garder ancienne version et accès au projet éditable.

Canvas : cartes métier reliées, pas éditeur universel de workflow. Liens = dépendances réelles ; déplacer une carte ne change ni chronologie ni dépendances. Fit, zoom centré pointeur, pan, focus sélection, réinitialisation de disposition ; positions persistées séparément. Éviter les lignes traversant les cartes et le panneau Jarvis. Vue liste guidée équivalente sur mobile et au clavier. Le détail du plan sélectionné cible explicitement Jarvis.

### 4.6 Modification ciblée

Exemple : « Change la veste jaune en vert sur tous les plans, garde les lunettes ». Jarvis propose un patch identité et l’ensemble exact des sorties touchées. Un panneau avant/après montre les plans à refaire, la voix conservée et le coût. Si le texte d’un plan reste jaune, le serveur bloque avant exécution. Après validation, les anciens médias restent consultables et deviennent obsolètes pour la nouvelle version. Une boîte à la place des lunettes est un échec qualité, même si le job fournisseur réussit.

Exemple : « Corrige seulement le CTA ». Modifier le calque texte, recomposer/exporter ; aucun appel image, animation ou voix. « Présente sans générer » crée une proposition uniquement, y compris lorsqu’une retouche est annoncée gratuite ou incluse dans un quota.

### 4.7 Textes et lots

Textes IA partage brief, faits et hypothèse avec les studios. Résultats : hook, corps, CTA, script, langue et sources des allégations. Édition manuelle, comparaison, copie/export et injection explicite dans le plan ou calque choisi.

Pubs IA permet une matrice bornée Angle × Format × Variation. Afficher le nombre combinatoire avant devis ; défaut maximum 12 sorties par lot, plafond configurable sous quotas existants. Un lot peut préparer des concepts sans images. Un échec n’annule pas les sorties acquises ; retry uniquement ciblé et approuvé. Aucun test commercial ne prétend isoler une variable si plusieurs champs créatifs ont changé.

### 4.8 Mesure et apprentissage

Depuis une variante choisie : compléter hypothèse, variable, offre/destination lorsque nécessaires, objectif, protocole, période et métrique. Réutiliser les objets Adsmap existants. Le média, promptRelease, briefVersion, sources et parentVariant restent liés au test.

Résultats importés via les capacités existantes ou saisis explicitement comme manuels. Conserver devise, fenêtre d’attribution, période, portée marque/campagne et fraîcheur. Jarvis retourne « inconclusif » si données insuffisantes ou non comparables. Une corrélation avant/après ne devient pas un effet causal certain. L’apprentissage approuvé propose la prochaine variable et revient au brief avec filiation serveur durable.

## 5. Interface et accessibilité

Préserver la charte Jarvis : fond #120810, rail #0d070c, surfaces #1c121b, texte #f6eef4, accent #ff5c8a ; tokens existants comme source commune. Rail desktop 184/64, mobile indépendant, recherche globale conservée. Cadre extérieur/marges/bordures alignés avec les pages déjà corrigées ; largeur de lecture interne possible sans rétrécir tout le studio.

Trois zones desktop : navigation commune, surface visuelle principale, panneau contextuel/Jarvis repliable. Une action primaire par étape. Projet, marque, état de sauvegarde et prochaine action restent lisibles. Les diagnostics fournisseur, JSON et traces vont dans ADMIN ou détails techniques, pas dans le parcours normal.

À 390×720 : vue liste par défaut, panneau plein écran refermable, contrôles essentiels accessibles sans survol, barre d’action n’occultant pas le clavier. Cibles44px, champs16px, labels persistants, focus visible, dialogues piégeant puis restaurant le focus, raccourcis avec alternative, reduced-motion. Contraste vérifié pour texte/contrôles et statut non porté seulement par couleur.

États obligatoires sur chaque écran : vide, premier usage, données partielles, rempli, filtres sans résultat, chargement, hors ligne, erreur récupérable, accès refusé, quota insuffisant, génération active, résultat périmé, conflit de version, succès et échec qualité. Les valeurs saisies survivent aux erreurs ; message avec action utile et identifiant support sans secrets.

Formats visuels : vignettes non déformées, noms longs tronqués seulement avec accès complet, zones de sécurité visibles à la demande, checkerboard uniquement pour transparence dans l’éditeur et non décor global. Pas d’animation ou de diagramme gratuit.

## 6. Architecture cible et dépendances

### 6.1 Principes de construction

Un dossier créatif canonique côté serveur ; plusieurs vues. Jarvis propose des commandes typées ; une couche métier vérifie droits, versions, capacité, budget et état. Aucun texte IA ne peut lancer du code, débiter ou choisir une portée de compte. Les workers exécutent des snapshots immuables, stockent les médias puis publient des événements. Le navigateur peut disparaître sans perdre le job.

Chaîne : UI/Jarvis → ContextResolver → PromptResolver → sortie structurée → validation → Proposal → ImpactPlan → Quote → Approval → Job/Worker → Asset → QA → Version → Export/Test.

### 6.2 Installer les outils nécessaires, pas tous les langages

Claude relève d’abord `engines`, lockfile, gestionnaire de paquets, Dockerfiles, versions CI et déploiement. Installer les dépendances avec le gestionnaire existant et versions verrouillées. Ne pas installer globalement ni exécuter un script distant arbitraire ; privilégier les registres et distributions officiels, contrôler licences et provenance, documenter les commandes exactes dans SETUP.md et un inventaire de dépendances.

| Besoin | Décision par défaut | Condition de remplacement |
|---|---|---|
| Application et métier | TypeScript/JavaScript, React et framework actuel ; Node compatible dépôt | Aucun changement de framework pour ce chantier |
| Base | PostgreSQL et ORM/migrations existants | Pas de migration vers Supabase simplement parce que CreaFlow l’utilise |
| Éditeur 2D | Réutiliser éditeur actuel s’il satisfait la recette ; sinon Fabric.js derrière un adaptateur | Document canonique indépendant de son JSON interne ; licence/version verrouillées |
| Graphe métier | Cartes React + liens SVG et disposition calculée | Bibliothèque de graphe seulement si gain prouvé, accessible et compatible, pas React Flow présumé chez CreaFlow |
| Jobs | File durable déjà présente ; sinon worker avec table jobs/outbox et leases PostgreSQL | Redis/queue additionnelle seulement si nécessaire et hébergement prévu |
| Export vidéo/audio | Réutiliser rendu existant ; sinon FFmpeg/ffprobe dans worker isolé | Vérifier codecs, licences, polices, ressources et sécurité des arguments |
| Aperçu vidéo | Composants existants avec contrat timeline partagé | Remotion optionnel après comparaison/licence ; ne pas l’ajouter en plus d’un moteur satisfaisant |
| Validation | Validateur JSON Schema existant compatible draft choisi ou schémas TS équivalents | Même source pour validation serveur et génération types |
| Détourage/segmentation | Service existant ou algorithme local derrière interface | ONNX/WebGPU optionnel, fallback obligatoire ; aucun téléchargement automatique massif de poids |
| Python | Non requis par défaut | Seulement si un worker justifié en dépend ; environnement isolé verrouillé |

Références officielles consultées : [Fabric](https://www.fabricjs.com/docs/), [FFmpeg](https://ffmpeg.org/documentation.html), [Remotion](https://www.remotion.dev/docs/), [JSON Schema](https://json-schema.org/draft/2020-12). Elles décrivent les outils, pas la stack serveur CreaFlow. Le cahier ne demande aucune installation sur la machine Kevin pendant sa rédaction.

### 6.3 Modèles et fournisseurs

Registre de capacités : opération, fournisseur configuré, identifiant/version exacts quand disponibles, modalités, formats, durée, références supportées, masque, seed éventuelle, délais, coût, localisation contractuelle, statut et dernière évaluation. Les modèles inconnus CreaFlow ne doivent pas être devinés.

Profils logiques : reasoning_structured, vision_analysis, image_generation, image_edit, speech, animation, lipsync, transcription, music. Réutiliser les adaptateurs/fournisseurs TikTrends existants. Si un profil manque, implémenter contrat/UI et tests simulés, mais marquer le lot bloqué pour preuve réelle ; aucun faux résultat de production. Import média et montage restent utilisables.

Changement fournisseur/version : nouvelle configuration versionnée et benchmark, devis recalculé, pas de substitution silencieuse en cours de job. Une seed non supportée est null ; ne pas promettre reproduction pixel identique d’une IA distante.

## 7. Modèle de données et invariants

Les noms ci-dessous sont logiques, pas obligation de nouvelles tables. Claude produit le mapping aux entités présentes puis des migrations additives pour les seuls manques.

| Objet | Champs et contraintes essentielles |
|---|---|
| CreativeProject | id, tenantId, brandId, type, ownerId, currentVersionId, statut, titre, sourceRefs, testRefs, dates |
| ProjectVersion | id, parentId, projectId, schemaVersion, brief, productRef, styleRef, characterRefs, shots, document, timeline, promptReleaseId, hash, auteur, raison ; immuable |
| ProductReference | productId, variantId, photoAssetId/version/hash, composants requis, attributs immuables, transformations autorisées, provenance des faits |
| SourceReference | sourceId/type, droit, portée, date observation, extrait autorisé, hash, statut/revocation ; aucune URL signée durable comme identité |
| Asset | id, tenant/brand, storageKey, MIME réel, bytes, dimensions/durée/fps/audio, sha256, origine, droits, état stockage, parentAssetId |
| Shot | id stable, ordre séparé, intention, références versions, narration, speechMode, caméra, durée estimée/réelle, keyframe/clip/voice IDs |
| Document | dimensions, espace colorimétrique sRGB, liste calques typés, transformations, clipping, polices, assets référencés ; jamais code exécutable |
| Timeline | timebase entière, fps rationnel, pistes, in/out, transitions, audio/mix, sous-titres, overlays ; même logique aperçu/export |
| Proposal | cible/version, allowedPaths, patch, explication, sources, coûts non exécutoires, expiration et statut |
| ImpactPlan | entrées modifiées, sorties réutilisées/obsolètes/à refaire, ordre DAG, hash |
| Quote et Approval | lignes, devise/crédits/quota, plafond, expiration, pricingVersion, inputHash ; approbation liée à utilisateur autorisé et devis exact |
| Job et Attempt | opération, snapshot, état, lease, providerRequestId, clé idempotence, attempts, horodatages, résultat/erreur, journal coûts |
| PromptTemplate et Release | clé/version/schema/texte/hash/portée/état ; release immuable de versions compatibles |
| PromptRun | template/release/hash, contextSnapshotHash, sourceRefs, modèle/config, documentVersion, outputHash, latence, coût ; visibilité restreinte |
| Variant et TestLink | parentVariantId, mediaAssetId précis, projectVersionId, test/hypothèse/variable, mesure/apprentissage |
| AuditEvent | acteur, action, cible, version avant/après, date, reason et traceId ; append-only |

IDs opaques stables et relations avec portée contrôlée sur chaque lecture/écriture. Hash de contenu n’accorde aucun droit. Les snapshots ne copient pas des secrets fournisseur. La suppression d’une source respecte rétention et droits, sans supprimer un média partagé par une autre version encore autorisée.

Schéma géométrique : coordonnées en pixels document source, origine haut gauche, angle degrés, z-order explicite ; viewport/zoom séparés. Masque canonique grayscale8, 255=modifier, 0=préserver, même dimensions que source. Feather dans bande explicitement autorisée. L’éditeur stocke transformations réversibles ; l’export n’est pas le document éditable.

## 8. ADMIN des prompts et connaissances

### 8.1 Organisation et droits

Dans ADMIN ajouter « IA et Studios » avec onglets Prompts, Releases, Recettes de style, Connaissances, Évaluations, Routage et Exécutions. Réutiliser l’espace connaissances existant, pas une copie.

Séparer permissions de plateforme (prompts globaux/routage) et d’espace (connaissances et personnalisations autorisées de cet espace). La dénomination ADMIN+ du produit doit être mappée aux droits réels. Aucun admin d’espace ne modifie un prompt global ou ne lit les traces d’une autre marque hors de sa portée. Membres ne voient que les contrôles autorisés ; lecteurs ne peuvent pas générer.

Permissions logiques à mapper : prompt.read, prompt.draft, prompt.evaluate, prompt.publish, prompt.rollback, provider.configure, run.inspect_redacted, knowledge.manage, studio.propose, studio.generate, studio.export. Le rôle actuel propriétaire peut disposer de plusieurs permissions ; ne pas imposer une nouvelle organisation commerciale.

### 8.2 Cycle de vie

Draft → validated → staged → active → retired. Versions immuables après validation ; une modification crée une nouvelle version. Une release active associe toutes les clés requises à des versions compatibles. Importer le pack en draft idempotent par clé/version/hash ; même clé/version avec hash différent = conflit, jamais overwrite.

Éditeur avec diff, variables obligatoires/facultatives, schéma de sortie, exemples d’entrée/sortie, portée, propriétaire, origine, raisons, tests associés, modèle logique et coût de test estimé. Boutons Enregistrer brouillon, Valider, Tester, Publier la release, Revenir à une release. Tout changement public déclenche un audit event.

Publication : JSON valide, toutes clés requises présentes, aucune variable non résolue, tests structurels réussis et benchmark qualité approuvé. Une release initiale non évaluée ne peut pas être marquée active en production. Pour amorcer les évaluations, une commande ADMIN dédiée résout une release staged exacte, uniquement sous permission prompt.evaluate, données synthétiques et budget d’évaluation séparé. Elle ne modifie pas le pointeur actif et ne crée aucun fallback hardcodé. Rollback change le pointeur actif, n’altère pas les versions ni les jobs en cours. Un job épingle la release au moment du devis ; changement d’ADMIN n’affecte que les futurs devis.

### 8.3 Branchement obligatoire

**Tous les studios et Jarvis doivent appeler le même PromptResolver serveur.** Interdire les prompts fonctionnels concurrents codés en dur dans les composants ou adaptateurs. Les politiques de sécurité et validateurs restent dans le code, non modifiables par le prompt.

Résolution : politique système fixe → release autorisée pour opération et portée → contraintes projet validées → connaissances disponibles et autorisées → facts produit → références typées → demande courante. Résolution de portée explicite : override marque approuvé, sinon espace approuvé, sinon release globale active ; seuls champs extensibles peuvent être surchargés. Une source/une conversation ne crée pas un override.

ContextResolver produit un snapshot avec IDs/version/extraits retenus, motifs d’inclusion/exclusion, fraîcheur, statut ingestion et budget tokens. Priorité aux faits produit/invariants/brief validé avant historique conversationnel. Troncature explicite, jamais suppression silencieuse d’un invariant. Si budget insuffisant pour les contraintes obligatoires, bloquer et proposer simplification.

Preuve de branchement : dans un test local, publier une modification de style inoffensive en ADMIN ; nouvelle proposition Jarvis puis nouveau brief studio doivent utiliser la nouvelle version et traceHash. Ancien job garde la précédente. Rollback restaure la prochaine résolution. Désactiver une connaissance doit l’exclure des nouveaux snapshots. Afficher à l’utilisateur les noms des sources utiles ; réserver texte des prompts et traces détaillées à ADMIN.

### 8.4 Gestion éditoriale

Les prompts du pack sont rédigés par Codex pour TikTrends. Claude doit les intégrer, pas les remplacer par une phrase générique. Toute correction s’effectue dans le registre, avec nouvelle version, motif et tests ; reporter le changement dans le pack source pour éviter dérive DB/dépôt. Kevin garde la décision produit. Aucune maintenance future par Codex n’est supposée permanente sans exécution explicite : l’interface doit permettre la gestion autonome par les administrateurs autorisés.

## 9. Exécution fiable et budget

### 9.1 Machines d’états uniques

Proposition : draft → proposed → approved ou rejected/expired. Une proposition approuvée permet de demander un devis, pas de facturer sans approbation de ce devis.

Job : queued → claimed → running → persisting → completed. Branches : failed, cancel_requested → cancelled, reconciliation_required. QualityStatus séparé : pending, passed, requires_review, rejected. Synchronisation séparée : local_only, syncing, synced, conflict, error. Un projet peut avoir un ancien export accepté et une nouvelle version en cours.

completed signifie fichier stocké, décodable, relié et accessible selon droits ; pas qualité validée. Les statuts HTTP/fournisseur ne suffisent pas. timeout du navigateur n’est pas cancelled côté serveur.

### 9.2 Transactions et idempotence

Commande acceptée dans transaction : droits/version/devis vérifiés, approbation consommée une fois, réservation du plafond dans ledger, job et événement outbox créés. Clé idempotence unique par tenant+commande ; même clé avec entrées différentes retourne conflit. Double clic, timeout ou reconnexion retrouvent le job, pas une seconde réservation.

Worker avec lease/heartbeat, compare-and-set et tentative identifiée. Clé fournisseur idempotente si supportée ; si réponse perdue après soumission, récupérer le statut par requestId. Si impossible de savoir si facturé, état reconciliation_required : **aucune nouvelle soumission payante aveugle**.

Ledger append-only : reserve, settle, release, adjustment avec références uniques ; unités entières, jamais floats pour crédits. Limite dépense au plafond autorisé et disponibilité atomique entre deux onglets. Facturer selon politique commerciale existante, sans invention de remboursement ; libérer réserves non consommées après réconciliation. Distinguer coût fournisseur et crédits utilisateur.

Annuler empêche les étapes non commencées ; pour étape distante en cours, afficher demande d’annulation et coût potentiel. Pas de remboursement annoncé avant confirmation. Webhooks signés, timestamp/anti-rejeu, événements dupliqués et désordonnés gérés.

### 9.3 Devis et relances

Le devis contient opérations/plans, unités, quota gratuit éventuel, plafond, validité et pricingVersion. Toute variation du snapshot d’entrées, du modèle épinglé, du périmètre, du coût devisé ou de la version projet invalide l’approbation. Une nouvelle release active ou grille tarifaire ne périme pas un devis encore valide déjà épinglé ; une révocation explicite de sécurité/capacité le bloque avec motif. À expiration, recalculer selon configuration courante. Un devis nul reste une validation de mutation ; « gratuit » ne signifie pas « automatique ».

Par défaut aucun retry génératif payant automatique. Reprise réseau du même job autorisée avec backoff borné. Les réparations de sortie LLM sont limitées à une tentative dans le budget préautorisé ; au-delà erreur explicite. Un mode production par lot approuvé peut couvrir une liste fermée d’opérations et un plafond, jamais une boucle ouverte décidée par le modèle.

Les tests Claude utilisent stubs locaux sans dépense. L’autorisation de crédits CreaFlow de la recherche ne finance pas implicitement les fournisseurs TikTrends. À la reprise, utiliser le budget réel déjà configuré/autorisé ; si absent, terminer la partie indépendante et signaler uniquement la preuve fournisseur bloquée.

## 10. Versions et calcul des impacts

| Changement validé | À recalculer | À préserver |
|---|---|---|
| Texte écran, typo, position logo | Composition et export | Images, clips, narration/audio |
| Narration | Voix, timings, sous-titres, montage/export | Keyframes ; clips si durée compatible et pas lipsync |
| Voix | Audio/timings, lipsync si actif, montage | Images et clips voix off réutilisables |
| Tenue/identité | Fiche si nécessaire, plans dépendants, clips dérivés, montage | Plans sans dépendance, audio inchangé |
| Photo/variante produit | Composition produit ou plans dépendants selon mode, clips dérivés | Autres produits/plans et sources |
| Style décor | Décor ou plans concernés, clips dérivés | Produit protégé, voix et textes |
| Ordre des plans | Timeline, alignements/sous-titres/export | IDs, keyframes, clips et segments audio réutilisables |
| Musique/gain | Mix/export | Voix, images, animations |
| Format | Composition/crop/zones sûres, export ; génération seulement si indispensable | Originaux et historique |
| Connaissance/prompt global | Nouveaux devis seulement | Jobs et versions épinglés ; proposer mise à jour des brouillons |

Le serveur calcule les impacts à partir du graphe de dépendances et des hashes, pas uniquement le navigateur. Utiliser rowVersion/ETag et comparaison baseVersion ; si périmé, 409 avec diff, jamais overwrite. Résultat d’un job ancien stocké comme branche de sa version, non appliqué automatiquement à la version courante.

Sauvegarde locale de secours sans promesse multiappareil ; sauvegarde serveur complète du document/calques/timeline. Autosave avec debounce configurable, bouton explicite, statut visible et flush au changement sûr. Les collisions entre onglets demandent choisir/fusionner les champs non conflictuels ; pas CRDT imposé. Reprise sur seconde session testée.

## 11. Édition et rendu

### 11.1 Image

Calques image, texte, forme, logo ; nom, visibilité, verrouillage, duplication, ordre, groupes si supportés, transformation, alignement et undo/redo. Texte reste éditable. Sources immuables, édition non destructive, variantes nommées. Polices fournies/licenciées et mêmes métriques au rendu.

Retouche : sélection rectangle/lasso/pinceau selon capacités, masque aperçu à résolution source, prompt ciblé. En conservation stricte : résultat = masque×génération + (1−masque)×original. Vérifier égalité des pixels décodés hors zone autorisée avant encodage avec perte. Le masque et sa bande de fondu font partie du devis et du snapshot. Une étoile demandée dans une zone précise doit préférer un calque déterministe à une régénération complète.

Détourage : contrôle bords fins, transparence et ombres ; arrière-plan/ombre séparés si possible. Fallback pour absence WebGPU ; opérations lourdes dans worker pour ne pas bloquer le thread UI. Aucun poids non licencié ou téléchargement surprise obligatoire.

### 11.2 Vidéo et audio

Timeline avec unités entières (microsecondes ou ticks documentés), conversion frame exacte et fps rationnel. Audio garde sampleRate/canaux/durée réels. Trims non destructifs, gain en dB ou linéaire clairement converti, normalisation/clipping testés. Par défaut exporter MP4 H.264/AAC compatible si disponible/licencié, conserver audio source ; paramètres exacts issus de la capacité déployée.

Sous-titres sur narration validée et timings ; activation indépendante du texte incrusté par générateur. Demande sans texte interdit les overlays et déclenche contrôle de texte parasite. Ne pas promettre de retirer un texte déjà fondu sans retouche/ressource propre. Transitions, cadrage et polices doivent employer la même définition aperçu/export. Préflight vérifie ressources téléchargées, polices, durées, dimensions et quotas de rendu.

Validation export : ffprobe ou équivalent, décodage, lecture complète de l’échantillon de recette, images début/milieu/fin et points de coupe, contrôle audio. Écart durée ≤ une frame, synchronisation voix/image cible ≤80ms sur fixture étalon, géométrie overlays ≤1px avant encodage, aucun clipping audio. Ces seuils sont nos critères, pas des garanties observées chez CreaFlow.

## 12. Sécurité et confidentialité

Auth et autorisation côté serveur pour chaque ressource, commande, snapshot, URL signée, job et trace. Filtrage tenant/marque systématique, incluant recherches vectorielles, caches et files. Cache clé tenant+brand+versions+permissions ; jamais global par simple texte du prompt. Réévaluer droits au moment d’exécution et d’export si ressources révoquées.

Données Veille, pages importées, OCR, transcriptions, savoirs et sorties modèles sont non fiables : aucun ordre contenu dans ces sources ne peut changer droits, budget, modèle ou outils. Encoder en JSON délimité, valider schémas, liste blanche d’opérations/chemins ; aucun eval, shell, SQL ou HTML arbitraire d’un modèle.

Imports : MIME réel, taille/dimensions/durée bornées, antivirus si pipeline présent, SVG/HTML assainis ou rasterisés, zip bombs interdites, URLs distantes contre SSRF (réseaux privés, redirections, metadata cloud), timeout et taille maxima. Exports par URL courte durée avec contrôle de portée. Clés serveur dans secret manager/environnement existant, jamais dans ADMIN prompt ni bundles client.

Logs structurés expurgés ; accès au prompt compilé limité et tracé, conservation selon politique existante. Si aucune politique n’existe, défaut technique proposé : traces expurgées30j, détails debug désactivés, aucune copie durable de secrets. Ne pas mettre en place de suppression irréversible silencieuse : configuration et politique validées avant purge. Provenance/droits des assets conservés, pas utilisation inter-marques par défaut.

## 13. Performance et exploitation

Cibles de recette locale/staging sur environnement documenté : ouverture projet typique20 plans/100 calques <2s après chargement des métadonnées, édition visuelle ≥30fps sur machine de référence, feedback commande <300ms, sauvegarde acquittée p95<2s hors panne, reconnexion retrouvant un job <10s avec polling actif. Les temps fournisseur sont mesurés séparément et ne doivent pas être annoncés comme garantis.

Pagination galeries, lazy loading studios, miniatures serveur, décodage/retouche en workers, limites de mémoire et de concurrence par tenant. Stress synthétique200 plans/1000 calques : UI doit rester navigable ou indiquer la limite documentée sans crash ni perte ; pas obligation génération d’un tel lot.

Observabilité : traceId de bout en bout, queue age, jobs bloqués, taux erreur, coût réservé/réel, latence par étape, résultats obsolètes, QA rejetée, version prompt/modèle. Alertes sur double débit, fuite de portée, hausse erreurs et stockage non finalisé. Healthcheck n’appelle pas une génération payante. Runbook reprise worker, réconciliation, rollback release et rollback déploiement.

## 14. Migration et livraison

Migrations expand → backfill idempotent et borné → vérification → activation ; pas de drop/rename destructif dans cette mise à jour. Backup/restauration répétée sur copie synthétique ou environnement autorisé. Ancien lecteur compatible tant que nouveaux champs facultatifs. Historique aplati importé comme média legacy, sans inventer calques, prompts ou provenance absents.

Feature flags par capacité/espace, default off pour nouveautés incomplètes. Mode shadow pour résolution contexte/prompts sans nouvel appel payant ; comparer sorties structurées avec données synthétiques. Rollout interne → espaces pilotes autorisés → généralisation après recette. L’ancienne expérience reste disponible tant que conversion et reprise ne sont pas validées.

Toutes PR sous CI/protections existantes, pas d’admin bypass. Préserver les lots D/E en attente et leurs propriétaires ; ne pas écraser ni dupliquer. Pour chaque lot : SHA, routes, migrations, tests, captures1280×720/1440×720/390×720, preuves vides/remplies/erreurs/clavier, limites, rollback. Recette indépendante avant fusion selon mandat existant. Après fusion, observer réellement la version servie ; SHA inconnu si non exposé. Les tests avec écritures restent locaux/synthétiques restaurés ; production observée en lecture seule.

## 15. Critères de complétude

« Implémenté à100% » signifie chaque exigence applicable de `04-RECETTE.csv` passée avec preuve au SHA livré, chaque parcours praticable de bout en bout, prompts ADMIN réellement consommés, fournisseurs requis validés, migration et rollback prouvés, CI verte, recette indépendante acceptée et production observée. Un mock, un dossier, une PR ouverte, un job terminé ou une capture isolée ne suffit pas.

Qualité IA : benchmark de20 cas originaux autorisés couvrant produit/accessoire, logo, transparence, texte, références contradictoires, personnages multi-plans et changements ciblés. Minimum2sorties par cas lorsque stochastique, grille de revue5dimensions0–2 (fidélité produit, respect brief, cohérence, texte, qualité technique), moyenne≥8/10 et aucun défaut critique accepté. Un résultat douteux doit être marqué requires_review. Les cas stricts déterministes exigent100% de leurs invariants. Ce benchmark est une cible future budgétée, non un résultat acquis.

La génération peut échouer ; le produit doit détecter, expliquer et permettre de corriger sans perte ni débit incontrôlé. Aucun score automatisé seul ne certifie fidélité, lisibilité ou succès publicitaire. Si une capacité requise manque de fournisseur/budget, le dossier de livraison la marque bloquée et le périmètre global reste incomplet.
