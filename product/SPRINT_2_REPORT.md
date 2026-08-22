# Sprint 2 — Rapport (tagging IA + Top Creative Tags)

## Fait
- **`packages/ai`** — orchestration **tagging** : `buildTaggingPrompt` + `tagCreative(client, input)` via **Claude tool use (structured output)** validé par le schéma **Zod `TagTaxonomy` (§5.5)** (retry côté appelant si invalide). Modèle réglable par env (`ANTHROPIC_TAGGING_MODEL`).
- **`packages/core`** — **Top Creative Tags** (pur, testé) : `topCreativeTags(dimension)` (chaque valeur notée par la métrique cible **pondérée par le spend**) et `personaHookMatrix()` (combinaison gagnante persona × hook). C'est ce qui transforme l'analyse *par ad* en analyse *par ingrédient créatif*.
- **`apps/web`** — page **`/tags`** : barres Top Creative Tags par dimension (hook, persona, angle, émotion) + top combinaisons persona × hook, à la DA TikTrends.
- **Fixtures** créas taggées + tests Vitest (top hook = `problem_callout`, combo gagnante `Femme 30-45 × problem_callout`). Logique vérifiée en Node.

## En attente
- **Pipeline média réel** (frames 1 fps sur 0-3 s puis 0,2 fps, transcription Whisper, OCR) : interface prête, exécution à l'accès aux médias (ingestion réelle).
- Corrections humaines de tags (`tag_overrides`) réinjectées en few-shot : schéma DB prêt, boucle à câbler.
- Coût crédits par tag via le ledger (§F14) : à brancher.

## Prochaine étape (Sprint 3)
Radar en production : brancher `computeRadar` sur `metrics_daily` réelles + persistance `radar_scores`, diagnostic LLM et recommandations (le moteur §5.6 est déjà écrit et testé).
