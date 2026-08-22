# TikTrends Creative Intelligence — Plan de Sprint 0

> Point de départ du **vrai produit** (backend), distinct de la maquette de démo actuelle.
> Base : `docs/CDC_TikTrends_Creative_Intelligence.md`. Objectif du Sprint 0 : socle exécutable — repo, CI, infra, schéma DB, auth, workspaces/brands, design system.

---

## 0. Chemin critique (à lancer en parallèle du code — délais externes)

| Action | Délai | Pourquoi maintenant |
|---|---|---|
| Créer l'app **TikTok for Business** (Marketing API) + demande d'accès avancé | 2–6 sem. | Bloquant pour l'ingestion — le plus long |
| Créer l'app **Meta** (Marketing API + Ad Library API) | 2–6 sem. | Idem |
| Obtenir les **conditions API Trendtrack** (volume, stockage média autorisé, prix) | quelques jours | Source data de la V1 |
| Sortir **3 comptes historiques** (TikTok + Meta) + décisions scale/kill passées | 1 jour | Validation Radar ≥ 75 % (§5.9) |

> Tant que les accès API ne sont pas accordés : développement contre des **fixtures** (exports d'Ads Manager anonymisés) + usage interne agence.

---

## 1. Arborescence monorepo (pnpm workspaces + Turborepo)

```
tiktrends/
├─ apps/
│  ├─ web/                 # Next.js 15 (App Router, RSC), Tailwind + shadcn/ui, i18n FR/EN/DE
│  ├─ workers/             # Node + BullMQ : ingestion, tagging, scoring, génération, crons
│  └─ extension/           # Chrome MV3 (V1 : save TikTok CC / Meta AL / Trendtrack)
├─ packages/
│  ├─ db/                  # Drizzle schema + migrations (Postgres 16 + pgvector)
│  ├─ ai/                  # prompts + schémas Zod (taxonomie §5.5, Radar §5.6), clients Claude
│  ├─ integrations/        # tiktok, meta, trendtrack, slack, stripe, storage (R2)
│  ├─ core/                # logique métier pure : radar (scoring), naming-parser, credits
│  └─ ui/                  # design system TikTrends (tokens + composants partagés)
├─ docs/                   # CDC + rapports de sprint
├─ .github/workflows/      # CI (lint, typecheck, test, migrations dry-run)
└─ turbo.json / pnpm-workspace.yaml
```

**Règles structurantes (issues du CDC §6) :**
- Aucun job IA dans une requête HTTP → tout passe par `apps/workers` (BullMQ/Redis).
- Chaque action IA débite le **ledger de crédits** (`packages/core/credits`).
- Les **contrats Zod** (taxonomie §5.5, JSON Radar §5.6) vivent dans `packages/ai` et sont importés par web + workers.
- Tout ce qui est affiché est **en français par défaut** (i18n).
- **Tests unitaires** obligatoires sur `radar` (scoring/buckets) et `naming-parser`.
- Aucune écriture sur un compte pub sans **confirmation explicite**.

---

## 2. Périmètre exact du Sprint 0

1. **Repo + outillage** : pnpm + Turborepo, ESLint/Prettier, tsconfig strict, Vitest, CI GitHub Actions (lint + typecheck + test + `drizzle migrate` dry-run).
2. **Infra dev** : Postgres 16 + pgvector (Supabase/Neon), Redis (Upstash), Cloudflare R2 (bucket médias), `.env.example` complet (§4).
3. **Schéma DB complet (§5.4)** en Drizzle + migrations : workspaces, users, members, brands, products, personas, ad_accounts, creatives, ad_instances, metrics_daily (partitionnée/mois), creative_tags, radar_scores, library_ads/brands, boards, reviews/insights, briefs, generations, agent_*, credit_ledger, api_keys.
4. **Auth + RBAC (F1)** : Auth.js (ou Clerk), rôles Owner/Admin/Member/**Client viewer**, multi-workspace.
5. **Workspaces & Brands** : CRUD, **création de brand par URL** (scrape + LLM → pré-remplissage palette/ton/industrie/produits, validation humaine).
6. **Design system TikTrends** dans `packages/ui` : reprendre les **tokens de la maquette** (thème sombre magenta : `--bg #120810`, accent `#fe2c55`, dégradé primaire, arrondis) → parité visuelle immédiate.
7. **Contrats Zod** : `TagTaxonomy` (§5.5) et `RadarScore` (§5.6) + tests de validation.
8. **Squelette workers** : queue + un job « hello » de bout en bout (web → enqueue → worker → DB), pour prouver la chaîne asynchrone.

**Hors Sprint 0** (sprints suivants, cf. §5.10) : OAuth + ingestion (S1), tagging (S2), Radar prod (S3), Inspo/Trendtrack (S4), Agent Tess (S5), crédits/Stripe/white-label (S6).

---

## 3. Stack (rappel §5.7)

- **Front** : Next.js 15, TS, Tailwind + shadcn/ui, TanStack Query, Recharts, next-intl.
- **Back** : route handlers (CRUD) + workers Node/BullMQ ; jamais d'IA en HTTP.
- **DB** : Postgres 16 + pgvector, Drizzle, métriques partitionnées/mois.
- **Stockage** : Cloudflare R2 (presigned URLs, FFmpeg transcodage worker, thumbs WebP).
- **IA** : Claude (Sonnet tagging/briefs/agent, Opus rapports) via SDK (tool use + structured outputs) ; Whisper ; Gemini/fal.ai images ; Higgsfield vidéo ; embeddings Voyage/OpenAI.
- **Auth** : Auth.js/Clerk + RBAC, tokens plateformes chiffrés (KMS).
- **Infra** : Vercel (web) + Railway/Fly (workers) ; Redis Upstash ; Sentry + OpenTelemetry ; dashboard coûts IA/workspace.
- **RGPD** : hébergement EU, DPA, suppression en cascade, pas d'entraînement sur données clients sans opt-in.

---

## 4. `.env.example` (clés à provisionner)

```env
# Base
DATABASE_URL=
DIRECT_URL=
REDIS_URL=
# Auth
AUTH_SECRET=
# Stockage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
# IA
ANTHROPIC_API_KEY=
OPENAI_API_KEY=            # embeddings / fallback
VOYAGE_API_KEY=           # embeddings (option)
FAL_KEY=                  # images FLUX
GEMINI_API_KEY=           # images Nano Banana
HIGGSFIELD_API_KEY=       # vidéo (V3)
WHISPER_API_KEY=          # ou self-host
# Plateformes pub
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=
META_APP_ID=
META_APP_SECRET=
META_AD_LIBRARY_TOKEN=
# Data
TRENDTRACK_API_KEY=
# Intégrations
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
NOTION_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
APIFY_TOKEN=              # reviews (V2)
# Observabilité
SENTRY_DSN=
```

---

## 5. Definition of Done — Sprint 0

- [ ] `pnpm i && pnpm build` vert ; CI passe (lint + typecheck + test).
- [ ] `pnpm db:migrate` crée **tout** le schéma §5.4 sur une base fraîche.
- [ ] Un utilisateur s'inscrit, crée un **workspace** et un **brand par URL** (champs pré-remplis par LLM, éditables).
- [ ] RBAC effectif (un Client viewer ne voit que son brand, en lecture).
- [ ] Design system TikTrends appliqué (parité visuelle avec la maquette).
- [ ] Schémas Zod `TagTaxonomy` + `RadarScore` couverts par tests.
- [ ] Job asynchrone de démonstration : web → queue → worker → écriture DB.
- [ ] `docs/SPRINT_0_REPORT.md` rédigé (fait / écarts au CDC / manques).

---

## 6. Ordre d'exécution proposé (quand tu lances le repo applicatif)

1. Scaffold monorepo + CI + `.env.example`.
2. `packages/db` : schéma Drizzle complet + migration + seed minimal.
3. Auth + workspaces + brands (F1) + RBAC.
4. `packages/ai` : contrats Zod + tests.
5. `packages/ui` : tokens TikTrends + 6–8 composants de base.
6. Squelette workers + job démo.
7. `SPRINT_0_REPORT.md`.

> Ce plan vit dans le **futur repo applicatif** (nouveau), pas dans cette maquette de démo. La maquette reste l'outil commercial ; le repo produit démarre ici.
