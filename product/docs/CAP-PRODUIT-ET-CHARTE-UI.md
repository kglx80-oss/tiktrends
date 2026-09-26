# Cap produit et charte UI · consignes Codex (26/09/2026)

Ce document consigne le cap produit et les critères UI validés, transmis par
Codex au nom de Kevin. Il **complète** les instructions existantes
(`CLAUDE.md`, `.claude/skills/impeccable`, `docs/DESIGN_TOKENS.css`) sans les
remplacer. En cas de doute d'apparence (couleur, marge) déjà fixé ici, ne pas
redemander d'arbitrage.

## Cap produit · la valeur n°1

La valeur n°1 de TikTrends est l'**ANALYSE POUR L'ITÉRATION** des publicités
e-commerce. La boucle :

> veille concurrentielle et/ou KPI propres à la marque → analyse sourcée →
> hypothèse priorisée → plan de test → création ou production externe →
> diffusion → mesure → apprentissage → prochaine itération.

- La **création centralisée** est une **deuxième phase**, proposée dans une
  offre plus premium. Elle n'est pas le cœur.
- **Ne pas réécrire** les tarifs ni les connecteurs.
- **Meta / Google / TikTok Ads** sont les **sources visées** · à distinguer des
  **connecteurs réellement opérationnels**. Ne pas présenter une source visée
  comme un connecteur actif.
- **Jarvis** aide d'abord à décider **quoi tester ensuite et pourquoi**.
- La **longévité** d'une pub concurrente **ne prouve jamais sa rentabilité**.
- Inventorier les méthodes TikTrends **existantes** sans les inventer.
- Le **Canvas inspiré de FLORA** est une piste à concevoir **après** la
  correction UI · ce n'est **pas un chantier de développement autorisé**
  maintenant.

## Charte UI · critères validés

Couleurs (déjà dans `DESIGN_TOKENS.css` / `packages/ui/tokens.css`) :

- Fond principal **UNI `#120810`** · **sans quadrillage décoratif ni halo rose
  global** (ni sur `body`, ni sur le contenu admin, pseudo-éléments compris).
- Sidebar / rail **`#0d070c`** · surface (cartes) **`#1c121b`** · accent mesuré
  **`#ff5c8a`** · texte **`#f6eef4`**.

Conversation et accueil (Jarvis) :

- Colonne centrée de **760 px maximum** (écran conversationnel, **pas** la
  largeur « data » des tableaux).
- Composeur **généreux, rayon 24 px**.
- **Aucune grande boîte de diagnostic** autour de l'accueil.
- **3 suggestions au maximum**, selon les capacités réelles.
- Sources et Contexte **accessibles discrètement, à la demande**.
- Exemple de copie · titre « Quelle publicité améliorer en premier ? » ;
  suggestions « Analyser mes résultats », « Repérer des pistes chez mes
  concurrents », « Préparer mon prochain test ».

Général :

- Titres en **graisse 500**.
- Zones interactives **effectives 44 × 44 px** (agrandir la zone, pas forcément
  le visuel).
- Rail **184 / 64 px**, menu mobile.
- **Préserver** données, fonctions et droits.

## Méthode de livraison (ce cap)

- Implémenter, vérifier **localement** desktop/mobile et états **vide/rempli**,
  ouvrir une **PR** avec protections et CI habituelles, puis remettre le statut
  **PRÊT À VÉRIFIER** *avant* fusion · Codex donne le retour visuel.
- Publier dans le fil les **captures visualisables de l'application réelle**, le
  **SHA exact**, la **PR**, les **routes**, les **résultats de tests** et les
  **limites**.
- **Ne pas déduire** le déploiement VPS du succès GitHub Pages.
- Aucun appel de génération **payant**, aucune **fixture en production**, aucun
  **chantier annexe**.
- `design.md` et `jarvis-preview.html` ne sont **pas** dans le dépôt · ne pas
  prétendre les avoir lus · s'appuyer sur les critères ci-dessus.
