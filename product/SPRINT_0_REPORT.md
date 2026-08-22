# Sprint 0 — Rapport

## Fait
- Monorepo pnpm + Turborepo (`apps/*`, `packages/*`), TS strict, `.env.example`, `.gitignore`, CI de référence.
- **`packages/db`** : schéma **Drizzle complet (CDC §5.4)** — workspaces, users/members, brands, products, personas, ad_accounts, creatives, ad_instances, metrics_daily (PK composite, à partitionner/mois), creative_tags, radar_scores, alerts, library_ads/brands, brand_follows, boards/board_items, reviews/insights, briefs, generations, agent_threads/memory/jobs, credit_ledger, api_keys. Colonnes `vector(1536)` (pgvector).
- **`packages/ai`** : contrats **Zod** — `TagTaxonomy` (§5.5) et `RadarScore` (§5.6). Ce sont les contrats entre modules.
- **`packages/core`** : **Radar §5.6** (percentiles intra-compte, repli seuils absolus < 8 créas, score global pondéré, buckets winner/high_potential/iteration/kill_candidate/fatigued/insufficient) + **naming parser** configurable. Tests Vitest (radar + naming).
- **`packages/ui`** : **tokens TikTrends repris 1:1 de la maquette** (`tokens.css`) + preset Tailwind.
- **`apps/web`** : squelette Next.js 15 (App Router) à la DA TikTrends.
- **`apps/workers`** : BullMQ (files ingest/tag/radar/generate/cron) + worker Radar + démo enqueue→worker (chaîne asynchrone).

## Écarts au CDC (assumés)
- **Mono-repo dans `product/`** du dépôt de la maquette (scope GitHub d'un seul repo). À extraire vers un repo dédié : `git subtree split --prefix=product`.
- Dépendances **non installées** ici (pas de `pnpm install` dans cet environnement) : les fichiers sont prêts, `pnpm install && pnpm test` à lancer en local.
- `metrics_daily` : la **partition par mois** se fait via une migration SQL manuelle (Drizzle ne génère pas les partitions déclaratives).
- Auth/RBAC (F1) et création de brand par URL : **schéma prêt**, implémentation applicative à faire en tête du Sprint 1.

## Manque (prochaines étapes)
- Auth.js/Clerk + RBAC (Owner/Admin/Member/Client viewer), UI workspaces/brands, création de brand par URL (scrape+LLM).
- Migration initiale : `CREATE EXTENSION IF NOT EXISTS vector;` + partitions `metrics_daily`.
- Sprint 1 : OAuth TikTok + Meta, ingestion, stockage médias R2, dashboard créas v1.

## Pour démarrer en local
```bash
cd product
pnpm install
cp .env.example .env
pnpm db:generate && pnpm db:migrate   # après avoir activé l'extension vector
pnpm test                              # Radar + naming
pnpm dev
```
