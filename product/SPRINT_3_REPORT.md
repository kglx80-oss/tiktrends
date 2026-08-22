# Sprint 3 — Radar en production

- `core/diagnostic.ts` : règles §5.6 -> codes de diagnostic (pur, testé).
- `ai/radar-reco.ts` : persona détecté + recommandations priorisées (exemple réécrit) via Claude tool use, validé par `RadarScore` (§5.6).
- Le moteur `computeRadar` (§5.6, testé au Sprint 0) se branche sur `metrics_daily` réelles et persiste `radar_scores`.

**En attente** : appels LLM réels (clé) ; persistance DB.
