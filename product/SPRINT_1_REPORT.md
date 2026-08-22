# Sprint 1 — Rapport (OAuth + ingestion + dashboard créas v1)

## Fait
- **`packages/integrations`** :
  - **OAuth** : `buildTikTokAuthUrl`, `buildMetaAuthUrl` (purs, testés).
  - **Normalisation** : `normalizeTikTokAd`, `normalizeMetaAd` → formes communes (`NormalizedCreative`, `NormalizedAdInstance`, `MetricRow`). **Fingerprint créa** basé sur la vidéo/image (clé de dédup).
  - **Fixtures** TikTok + Meta (démo, dont 2 ads TikTok partageant une vidéo → prouve la dédup).
- **`packages/core`** :
  - `dedupeCreatives` (une vidéo = 1 creative, N ad_instances).
  - `aggregateCreativeMetrics` : métriques journalières → **niveau creative** (hook = v2s/impr TikTok ou v3s/impr Meta ; hold = v15s/v3s ; ctr ; ROAS/CPA), l'unité que consomme Radar.
- **`apps/web`** :
  - `lib/pipeline.ts` : pipeline complet fixtures → normalisation → dédup → agrégation → **Radar**.
  - `/dashboard` : **grille de créas** (dépense, impressions, CTR, ROAS + **grade Radar**), boutons **Connecter TikTok/Meta**.
  - Routes `/api/oauth/tiktok` et `/api/oauth/meta` (redirection OAuth réelle).
- **`apps/workers`** : worker **`ingest`** (normalise → dédup → agrège ; l'upsert DB suivra) + démo enqueue.
- **Tests** : OAuth, normalisation, ingestion (dédup + agrégation) + Radar/naming du Sprint 0. Logique **vérifiée en Node** sur fixtures (3 ads → 2 créas, zéro NaN, grades cohérents).

## Écarts / en attente
- **Accès API réel** non branché (attente approbation TikTok/Meta — chemin critique). Le code d'appel HTTP + échange de token + backfill se substituera aux fixtures **sans changer** normalisation/agrégation/Radar/UI.
- **Upsert DB** (`@tiktrends/db`) dans le worker ingest : à câbler quand la base tourne (schéma déjà prêt, §5.4).
- **Stockage médias R2** (téléchargement + thumbs) : interface prévue, implémentation à l'accès API.
- Callbacks OAuth (`/callback`) : à implémenter avec l'échange de token réel.

## Prochaine étape (Sprint 2)
Pipeline de **tagging** (frames + transcription + OCR → taxonomie §5.5), UI tags, Top Creative Tags. Le contrat Zod `TagTaxonomy` est déjà le point d'ancrage.
