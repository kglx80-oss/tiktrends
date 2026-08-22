# TikTrends Creative Intelligence — Produit

Monorepo du vrai produit (distinct de la maquette de démo à la racine du dépôt).
Cahier des charges : `../docs/CDC_TikTrends_Creative_Intelligence.md`.
Plan de sprint : `../docs/SPRINT_0_PLAN.md`. Rapport : `./SPRINT_0_REPORT.md`.

## Stack
Next.js 15 · TypeScript · Tailwind (tokens TikTrends) · Drizzle + Postgres 16 + pgvector ·
BullMQ/Redis (workers) · Claude SDK · Zod (contrats taxonomie & Radar).

## Démarrage
```bash
pnpm install
cp .env.example .env       # renseigner les clés
pnpm db:generate && pnpm db:migrate
pnpm dev
```

## Arborescence
- `apps/web` — front Next.js (App Router)
- `apps/workers` — jobs asynchrones (ingestion, tagging, scoring, crons)
- `packages/db` — schéma Drizzle (§5.4)
- `packages/ai` — contrats Zod (taxonomie §5.5, Radar §5.6)
- `packages/core` — logique pure : Radar (scoring), naming parser, crédits
- `packages/ui` — design system TikTrends (tokens repris 1:1 de la maquette)

> Extraction vers un repo dédié : `git subtree split --prefix=product -b product-repo`.
