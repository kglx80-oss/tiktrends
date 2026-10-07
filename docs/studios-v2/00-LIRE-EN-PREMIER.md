# Mission Claude pour la refonte des studios TikTrends

Ce dossier est le cahier des charges de Kevin pour un atelier créatif unifié : Jarvis, Veille, marque, prompts ADMIN et studios Image/Vidéo/Pubs/Textes. Il doit être installé dans le dépôt applicatif sous `docs/studios-v2/` ou un emplacement documentaire équivalent, référencé depuis CLAUDE.md sans écraser les instructions existantes.

**Statut : dossier prêt à remettre, pas mission déjà envoyée. TikTrends/Claude restent en pause jusqu’à la reprise autorisée et au quota disponible.** Le présent dossier n’est ni un déploiement ni une autorisation de dépense illimitée.

## Consigne autonome à Claude lors de la reprise

Lis intégralement les fichiers 01 à09 de ce dossier avant de modifier le produit. Prends 01 comme définition du résultat, 02/03 comme contrats de prompts, 04 comme critères de complétude et06 comme ordre d’exécution. Les fichiers de preuves expliquent les choix, ils ne sont pas du code à copier depuis CreaFlow.

Commence par relever le SHA et réconcilier les lots D/E en attente avec l’état actuel. Cartographie les capacités présentes avant d’ajouter des composants. Conserve les routes, les données, les droits, les fournisseurs et le design TikTrends. Installe uniquement les dépendances compatibles nécessaires, avec versions verrouillées et documentation reproductible. Le tutoriel CreaFlow n’impose ni Next14, ni Imagen, ni Vercel à TikTrends.

Implémente tous les lots de manière incrémentale. Ne t’arrête pas à un prototype, des mocks, une UI ADMIN débranchée ou une PR ouverte. Les22 prompts et8 recettes sont des instructions originales à importer en draft, évaluer, publier et utiliser réellement dans Jarvis et chaque studio via le même résolveur serveur. Ne les remplace pas par des prompts hardcodés dispersés. N’annonce jamais un média produit par une simple réponse texte du LLM.

Utilise des agents sur branches et fichiers disjoints si disponibles. Un seul intégrateur possède les contrats communs, migrations, shell, navigation, tokens et releases. Déclare la propriété des fichiers avant délégation ; transmets les demandes transversales à l’intégrateur. Parallélise les lots indépendants, jamais des migrations contradictoires ou deux éditions d’un même fichier.

Prends les décisions techniques ordinaires selon les valeurs par défaut du cahier. Écris les décisions et leur preuve sans attendre une approbation de Kevin pour chaque détail. En cas de contrainte externe réelle (secret absent, quota, permission, contrat fournisseur, dépense non autorisée), isole la dépendance, poursuis les autres lots et fournis un blocage précis. Aucun contournement des protections, aucune fixture en production, aucun achat/recharge, aucune mutation destructive silencieuse.

Pour chaque lot : implémenter → vérifier → corriger de façon groupée → livrer preuves au SHA final → recette indépendante → CI/protections → fusion/déploiement autorisés → observation production. La pause, les règles de recette et le budget priment sur « automatique ». Toute opération réelle payante nécessite un plafond déjà autorisé et contrôlé ; les tests CreaFlow n’autorisent pas les dépenses fournisseur TikTrends.

Conserve un checkpoint durable `PROGRESS.json` avec états des exigences, SHA, tests, preuves, erreurs, prochaine action et blocages. Mets-le à jour avant changement de contexte ou fin de session. Reprends depuis ce checkpoint, sans recommencer les lots faits ni attendre une relance pour les lots indépendants. Après deux tentatives identiques sans progrès, change de diagnostic et documente la cause ; ne répète pas une génération payante.

Ne conclus «100%» que lorsque les92 exigences applicables sont prouvées et les parcours réels publiés et observés. Un manque de clé ou de budget reste un blocage visible, même si tout le code est écrit. Fournis un bilan par état : implémenté, testé localement, testé réellement, accepté, déployé, observé.

## Ordre de lecture

- `01-CAHIER-DES-CHARGES.md` : cible exhaustive et décisions.
- `02-PROMPTS.json` et `03-CONTRATS.schema.json` : pack machine et schémas.
- `04-RECETTE.csv` :92 exigences, toutes NON_EXECUTE au moment de la rédaction.
- `05-PREUVES-ET-DECISIONS.md` : enseignements de l’audit et niveau de preuve.
- `06-PLAN-EXECUTION.md` : lots, intégration existante, transitions et endpoints logiques.
- `07-PROMPTS-LISIBLES.md` : lecture humaine du pack.
- `08-EXEMPLES-CONTRATS.json` : exemples de forme et cas invalides ; aucune qualité modèle démontrée.
- `09-BENCHMARK.json` : cas sémantiques et oracles à exécuter sur notre système.

## Ce qui est livré et ce qui reste à faire

Livré ici : spécification, prompts originaux, recettes, schémas, exemples, benchmark proposé, matrice de recette et protocole d’exécution. À faire dans le dépôt : implémentation, connexion aux fournisseurs disponibles, évaluation et recette, publication. Aucune consigne de ce dossier ne doit être présentée comme une instruction privée récupérée du serveur CreaFlow.
