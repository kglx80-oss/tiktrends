# Enseignements de CreaFlow et décisions TikTrends

## 1. Niveaux de preuve

**Observé** : interaction ou média réellement inspecté. **Client documenté** : comportement lu dans ressources publiques, sans certification serveur. **Déclaration éditeur** : guide/post officiel, pas trace technique. **Décision TikTrends** : notre cible originale. **Inconnu** : aucune preuve suffisante. Les sources peuvent avoir évolué depuis le6–7 octobre2026.

Nous cherchons une expérience comparable, pas une copie du code, de la marque ni des consignes privées. Les prompts du pack sont originaux. Les recettes publiques expliquent une méthode mais ne constituent pas le texte final envoyé aux modèles en production.

## 2. Ce que l’audit apporte à la spécification

| Apprentissage | Niveau et limite | Application obligatoire |
|---|---|---|
| Le canvas vidéo relie produit, style, scénario, identités, plans et montage | Client documenté HTML/SVG ; pas preuve React Flow ni éditeur universel | Graphe métier dérivé du même projet que la vue guidée |
| Éditeur d’image distinct du graphe vidéo | Fabric.js7.4 rapporté dans bundle historique | Calques et commandes d’édition séparés du DAG métier |
| React/JavaScript/Vite client ; langage serveur inconnu | Analyse historique, certains bundles sources désormais absents | Conserver stack TikTrends ; aucun choix backend à partir du look |
| MI-GAN/BiRefNet/MobileSAM et ONNX référencés | Familles/artefacts client, pas validation poids ni benchmark | Adaptateurs détourage/masque avec licences, fallback et preuve |
| Cartes exposent produit, format, scène, textes et couleurs | UI inspectée | Brief structuré, champs vides respectés et validation avant production |
| Une ancienne conversation peut ajouter du contexte indésirable | Soupçon test10, causalité non établie | Contexte visible, nouveau projet indépendant et historique borné |
| Catalogue produit avec plusieurs photos | UniBleu7 images ; photo effectivement retenue fournisseur inconnue | Épingler photo/variante/version/hash précis |
| Rôles Style, À intégrer, Logo visibles | UI inspectée | Références typées, portée et transformations explicites |
| Avec référence Style+légende, décor modelé mieux reproduit | Quatre rendus, deux par condition ; image et légende changent ensemble | Tester contamination style/produit sans attribuer causalité aux seuls pixels |
| Produit peut changer malgré bon décor | Monture/verres/bandeau variables | QA par composant et mode composition fidèle |
| «Aucun accessoire» peut contredire bandeau requis | Omission observée, facteurs confondants | Invariants composants priment sur exclusion vague |
| Géométrie demandée55% non respectée exactement | Environ67% dans test11 | Dimension appliquée par calque, tolérance déterministe |
| Retouche hors zone attendue | Étoile déplacée dans tests12/13 | Masque source, recomposition stricte, test pixel hors zone |
| Texte peut rester éditable hors image | UI/calques observés | Séparer texte, logo, bitmap ; pas génération pour simple placement |
| Prévalidation conversationnelle ignorée | P1 consomme retouche malgré demande de présentation | Garde serveur proposer/appliquer/devis, y compris quota gratuit |
| Fiche personnage multi-vues et plans | Test16, cadrage demandé imparfait | Fiche identité versionnée et recette des vues/cadrages |
| Fiche verte mais plans/vidéo jaunes | Test propagation V3 | Détection contradiction et invalidation avant coût |
| Correction veste réussie mais lunettes remplacées par boîte | V4 après correction235cr | QA produit obligatoire et ancien résultat conservé |
| Changer dialogue modifie les durées et devis | Test17, images conservées, chronologie globale recalée | Voix réelle pilote temps, impacts locaux et temporels distingués |
| Sous-titres ajoutés malgré demande sans texte | V1 puis V2 sans sous-titres, audioPCM identique | Texte écran et sous-titres réglages séparés explicites |
| Modification musique/texte autour d’un média propre | Aperçu et export observés | Composition déterministe, pas régénération de clips |
| Réordonner après finalisation refusé dans le parcours testé | Refus conversationnel, pas preuve limite universelle | Chez TikTrends recomposer clips existants par IDs |
| Versions UI et suffixes fichiers ne coïncident pas toujours | V4 pointant final-v3 observé | ID version et manifest, jamais nom fichier comme vérité |
| Aperçu et export dimensions différentes |540×960 contre720×1280 ; comparaison partielle seulement | Même modèle timeline, recette multi-résolutions et audio complète |
| Audio conservé sur certaines révisions visuelles | PCM V2/V3/V4 identique dans essai | Vérifier hashes/pistes non touchées lors modification visuelle |
| Rechargement reprend animation sans nouveau débit visible | Cas observé, garantie générale inconnue | Jobs durables/idempotence testés chez nous |
| Client prévoit jobs/batches et idempotency_key | Contrat client, transactions serveur inconnues | Ledger atomique, réconciliation et tests crash explicites |
| IndexedDB/document versus image sauvegardée | Client documenté ; synchronisation complète non prouvée | Sauvegarde serveur de calques, statut local/synchronisé/exporté |
| Prix docs diffèrent des devis connectés | Débits observés12image/9retouche selon parcours, docs génériques différentes | Devis frais/version tarif ; ne pas recopier prix CreaFlow |
| Provenance GPT Image dans11PNG | Métadonnées, signatures des5récents non vérifiées ; version inconnue | Registre provenance ; ne pas affirmer modèle exact |
| Export vidéo encodé avec FFmpeg/x264 | Métadonnées média | Piste rendu viable, pas preuve langage ni modèle animation |
| Claude mentionné pour moteur créatif | Déclaration guide officiel | Aucun modèle/version universel déduit ; profils abstraits |
| Recettes style annoncées par fondateur en DM | Post5oct ; contenu non obtenu | Nos8 recettes originales, pas attribution de secrets |
| Méthode ADN→angles→concepts→outil publiée | Guides officiels quatre couches | Étapes structurées reprises comme méthode, prompts originaux |

## 3. Sources primaires consultées

- [Application CreaFlow](https://creaflowai.fr/app) : UI et tests autorisés6–7 octobre.
- [Système quatre couches](https://creaflowai.fr/systeme-4-layer) : prompts pédagogiques relus le7 octobre ; pas promptserveur.
- [Variante angles](https://creaflowai.fr/systeme-4-layer-angle) et [Persona360](https://creaflowai.fr/framework-persona-360) : modules publics archivés avec empreintes.
- [Système Claude et CreaFlow](https://creaflowai.fr/systeme-prod-claude-creaflow) : déclaration moteur créatif.
- [À propos](https://creaflowai.fr/about) : modèles du marché choisis/remplacés selon résultats ; pas noms/version exhaustifs.
- [Post du fondateur5 octobre](https://x.com/ibrascale/status/2107151559981199698) : contexte marque/produits/angles, scénario/storyboard/voix/montage et pack de styles distribué sur demande ; aucun contact engagé.

## 4. Registre local de provenance

Dossier original : `../tiktrends-pilotage/preuves-creaflow-provenance/`. Le dossier de transfert contient les rapports textuels utiles dans `references/`; les médias lourds restent dans le dossier original. `SOURCES-MANIFEST.json` fournit les empreintes des annexes copiées. L’absence d’un média dans l’archive de spécification ne constitue pas une nouvelle preuve visuelle.

Preuves structurantes : `tests-prompts-90/` (P5 et P1), `tests-95/character-result.json`, `repeat-analysis.json`, `style-product-observations.json`, `factor-results.json`, `factor-normalized-fields.json`, `manifest.json`, `tests15-18/`, `metadata.json`, `video-metadata.json`, `guides-publics-manifest.json`, `PROMPT-SOURCING-LEDGER-7OCT.json`. Les noms sont à vérifier dans le manifeste avant citation détaillée ; certains rapports parlent de chemins temporaires historiques aujourd’hui absents.

Correction de preuve : `tests-95/factor-A1.png` présent,1024×1024, SHA256 `5dfd2aa061c66f9da00004d2ee197c665d1a32fa0092ca83d29f5ab4b89250c1`. Les trois autres originaux factoriels ne sont pas confirmés ; captures et paramètres existent. Ne pas inventer leurs empreintes.

Quatre bundles historiques FlowPage/proposal/CanvasEditor/index n’ont pas été retrouvés lors de l’audit récent : leurs détails restent rapportés, non relus dans leur source. Trois modules des guides sont présents avec empreintes vérifiées. L’ancien contrat v0.8 contient des états de tests dépassés ; ce cahier v1.0 prévaut et unifie les états d’exécution.

## 5. Incertitudes restantes et façon de les fermer

| Inconnue | Décision pour TikTrends | Preuve future nécessaire |
|---|---|---|
| Prompts privés et compilation fournisseur CreaFlow | Ne pas en dépendre ; utiliser pack original et journal compilé | Benchmark de nos prompts, pas extraction privée |
| Modèles versions/parcours exacts CreaFlow | Réutiliser fournisseurs TikTrends et registre capacités | Test réel par opération et version |
| Fidélité produit générative | Mode composition stricte pour exigences exactes | Benchmark et contrôle humain des scènes générées |
| Synchronisation CreaFlow multiappareil | Exiger notre sauvegarde complète serveur | Deux sessions, conflits, coupure réseau |
| Concurrence/facturation CreaFlow | Concevoir ledger/job robuste indépendamment | Tests locaux crash/doublons/reconciliation |
| Qualité lipsync | Fonction distincte conditionnée au fournisseur | Test audiovisuel réel et critères temporels |
| Stack/contraintes TikTrends actuelles | Cartographie L0 au SHA courant | Manifests, schémas, droits et appels réels |

Aucune dépense CreaFlow supplémentaire n’est nécessaire pour rédiger cette spécification. Les671 crédits de recherche depuis1770, dernier solde observé1099, ne financent pas la future recette TikTrends. Les nouveaux tests sont nos propres évaluations sous budget explicite.
