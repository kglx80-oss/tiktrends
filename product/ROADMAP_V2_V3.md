# Roadmap V2 / V3 — scaffolds posés

## V2 (Sprints 7-10)
- **Review mining** (§F8) : sources (CSV/Amazon/Trustpilot/Shopify) -> insights (pain/desire/objection). Schéma DB `reviews_sources/reviews/insights` prêt.
- **URL -> brief** (§2.3) : scrape + LLM -> brief auto-rempli. `core/briefs.ts` (squelette) prêt.
- **Génération images** (clone / iterate / auto-gen) : `ai/generation.ts` (scripts/copy) posé ; images via Gemini/fal.ai à l'accès clés.
- **Slack + WhatsApp**, rapports programmés white-label, **API publique + MCP** (exposer les mêmes outils que Tess).

## V3 (Sprint 11+)
- **Launch** (§F13) : `core/launch.ts` (auto-pause / suggestion scale, testé) -> upload TikTok/Meta.
- **Vidéo IA** (Higgsfield), **benchmark marché** opt-in, TikTok Shop / Spark Ads / créateurs, Google Ads.

## Ce qui reste strictement bloqué par l'externe
Accès **API TikTok/Meta Marketing** (2-6 sem.) et **conditions Trendtrack**. Tout le code produit ci-dessus est structuré pour brancher ces sources **sans refonte** des couches normalisation / agrégation / Radar / UI.
