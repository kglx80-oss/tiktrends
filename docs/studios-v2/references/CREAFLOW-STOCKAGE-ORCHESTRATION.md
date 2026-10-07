# CreaFlow — seconde passe : stockage, tâches et limites de certitude

6 octobre 2026. Lecture statique complémentaire : StudioPage, index principal, EditionPage, creativeEditor et traductions légales publiques. Aucun appel des fonctions identifiées, aucune génération, aucun accès au serveur privé. Les noms de fonctions décrivent les contrats clients ; ils ne certifient pas le comportement serveur.

## Nouvelles réponses

### Le document éditable n'est pas le fichier exporté

L'analyse d'EditionPage confirme IndexedDB par utilisateur pour le document, les ressources, versions et conversations. Le serveur reçoit séparément des aperçus/activité et l'image aplatie lors de save/saveNew. Une sauvegarde distante complète des calques n'est pas démontrée. Autosauvegarde après600ms d'inactivité ; miniature différée ; limites visibles40brouillons/10versions/5anciennes conversations. Voir le rapport éditeur pour les détails et exceptions.

Pour TikTrends : prévoir des statuts distincts « enregistré sur cet appareil », « synchronisé », « exporté ». Tester le retour sur un second appareil, l'interruption réseau et le quota local avant toute promesse de récupération. Une miniature visible dans une bibliothèque ne prouve pas que tous les calques sont récupérables.

### Ils séparent concept et production d'images

Le client appelle batch-runs/start avec marque, réglages, prompt négatif, liste de tâches de concepts et liste de créations attendues. Les états visibles comprennent pending, concepts_running, concepts_done et images_running. Chaque création peut conserver prompt, format, angle, références produit, publicité source, avis source, parent d'édition et identifiant de lot. La séparation concept→image est donc matérialisée dans le contrat client, pas seulement dans la présentation marketing.

Le module Studio sait retrouver l'annonce source depuis les tâches d'un lot et afficher sa provenance. Cela explique une partie de la continuité découverte→adaptation→création, sans prouver une mesure de performance publicitaire.

### Les générations sont suivies comme des tâches

Le module commun propose pipeline-jobs avec actions enqueue, status et find-active. Réponse attendue : jobId, status, result, code, error, queuePosition. La fonction d'attente augmente l'intervalle selon un facteur1,25 avec variation aléatoire15%, base1,5s et plafond nominal8s (variation appliquée après plafond). Elle termine sur completed/failed/cancelled. Les délais sont configurables ; Studio demande jusqu'à12minutes pour une image dans le chemin inspecté. Ces valeurs ne sont pas une mesure de leur temps réel de génération.

Un délai dépassé ou un AbortSignal côté navigateur n'établit pas l'arrêt du traitement distant. batch-runs possède une action cancel, distincte ; l'effet et la facturation après annulation restent à vérifier.

### La protection contre les doublons est prévue dans le contrat des lots

batch-runs/start transmet idempotency_key ; la réponse peut porter wasExisting. Cela confirme une intention de réutiliser une demande existante. La fonction générique enqueue observée n'expose pas cette clé dans son propre corps. Ni transaction financière, ni absence de double facturation, ni couverture vidéo ne sont démontrées.

### Une tâche terminée et une création disponible sont deux vérifications

Après résultat completed, Studio relit ad_creatives pour vérifier status=done et output_url. Il retente après500ms et distingue une image générée d'une finalisation non confirmée. Ce détail doit inspirer notre suivi : ne pas afficher « livré » sur le seul succès du fournisseur si la ressource n'est pas réellement enregistrée et accessible.

### L'assistant a une mémoire bornée

30messages restaurés, mais seulement10derniers messages admissibles transmis à l'IA dans le chemin éditeur. Le contexte structuré, la sélection, les captures et la marque complètent cette mémoire. Les plans d'actions en attente expirent au rechargement. Cela ne démontre aucun entraînement ou fine-tuning personnalisé du modèle.

## Ce qui reste inconnu après cette passe

| Question | Réponse vérifiable actuelle | Preuve manquante |
|---|---|---|
| Langage du navigateur | JavaScript, React et bibliothèques identifiées | TypeScript source non établi |
| Langage du serveur | Inconnu | Source serveur ou déclaration technique fiable |
| Modèles de retouche | Familles MI-GAN/BiRefNet/MobileSAM référencées | Validation des poids et essais de qualité |
| LLM/image/vidéo/voix | Aucun nom confirmé | Identifiant exposé dans réponse normale, métadonnée ou déclaration fournisseur |
| Rendu final vidéo | Commande de montage serveur, aperçu local | Moteur réel et parité aperçu/export |
| Entraînement maison | Non démontré | Description technique et provenance des modèles |
| Sauvegarde collaborative complète | Non démontrée | Essai entre appareils et contrat de synchronisation |
| Fiabilité/coût/qualité | Aucun benchmark effectué | Scénarios contrôlés et coûts observés |

La recherche dans les modules Studio/éditeurs et textes légaux n'a pas fourni de nouveau nom de fournisseur génératif. Google y apparaît pour la connexion au compte, ce qui ne prouve pas Gemini. Les textes de confidentialité nomment des catégories de prestataires, sans liste technique suffisante. Les mentions Claude dans des pages pédagogiques ne prouvent pas que l'application utilise Claude.

Les fichiers nommés fakeGeneration/fakeRunStore existent parmi les imports. Leur nom seul ne permet aucune conclusion sur une génération simulée dans le parcours réel ; ne pas en déduire une tromperie.

## Essais prioritaires pour notre futur studio

1. Même référence produit sur plusieurs plans : vérifier forme, logo, couleur, texte et absence de caractéristiques inventées.
2. Modifier uniquement la narration : vérifier sorties conservées, coûts et versions.
3. Réordonner des plans : conserver identifiants et synchronisation, sans mélanger personnages/produits.
4. Déconnecter puis recharger pendant un traitement : retrouver tâche et résultat, pas de doublon.
5. Modifier le projet pendant une génération : empêcher l'ancien résultat d'écraser la version courante.
6. Reprendre un document sur un autre appareil : calques et références intacts, état de synchronisation clair.
7. Comparer aperçu et export sur formats, polices, temps et sous-titres.
8. Évaluer sur images synthétiques le détourage, les bords fins, ombres, transparence et sélections ; inclure appareils sans WebGPU.
9. Relier chaque variante au test et à l'apprentissage ; afficher source et limites de la conclusion.

Ce sont des critères de recette à préparer, pas des essais réalisés ni une autorisation de génération payante.

## Sources et reproductibilité

- https://creaflowai.fr/assets/StudioPage-BePA-9VY.js
- https://creaflowai.fr/assets/index-DxqI3-IS.js
- https://creaflowai.fr/assets/EditionPage-_VE78twf.js
- https://creaflowai.fr/assets/creativeEditor-DwO8MWJh.js
- https://creaflowai.fr/assets/legal-RPcdrGlF.js
- https://creaflowai.fr/fr/pricing : distinction officielle entre retouches graphiques et opérations IA facturées ; ne permet pas d'identifier le fournisseur ni son coût réel.

Repères index : fonctions oE/yi/aE/cE (tâches), mD (départ lot), CE (annulation). Studio : Ks/Xs (payload génération), sélection Ot (métadonnées), Ms (provenance annonce), chemin generateOne (relecture finalisation).

- SHA-256 StudioPage-BePA-9VY.js : `93029476fd64a41919660aba18430001ff19e0ff22e7c3daab1d187ae11b8d68`
- SHA-256 EditionPage-_VE78twf.js : `a541841b6cc2435ab9790c99d76d142da435123363c53c99dc91791d8b14f55e`
- SHA-256 creativeEditor-DwO8MWJh.js : `e6bd7c846754e0f39a159ad265bd944d2ab26f91a076fc331a2cbcdfa010e960`
- SHA-256 legal-RPcdrGlF.js : `5baf7126da0d447093937e49e23a3f570280b0de4526f2e5a1dc5ee8a4b26442`
- SHA-256 public-index.js : `517ecd768b59326a762692a449deb4a7f36e53b7fb957548550598c862653bd9`
