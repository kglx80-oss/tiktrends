# Brief concurrentiel — Atria vs TikTrends

> Synthèse pour aligner les associés et le pitch. Mise à jour août 2026 (sources : site Atria + reviews indépendantes). Confiance élevée sur le positionnement, moyenne sur les détails d'écran (app derrière login).

---

## 1. Atria en une phrase
Plateforme de *creative intelligence* IA pour media buyers et agences sur **Meta + TikTok** : recherche concurrentielle sur une bibliothèque de **25 M+ ads**, analyse prescriptive des créas (**Radar**), génération (scripts/images) et un agent (**Raya**). Fondée avril 2022 par Ray Jang (ex-ByteDance/TikTok), *backed by Accel*.

## 2. Ce qui fait leur valeur (leur moat)
- **~60 % = actifs data**, pas le logiciel : 25 M+ d'ads scrapées et stockées depuis 2022, un scoring entraîné sur **~5 Md$** de dépense réelle (chiffre marketing, a affiché jusqu'à 9 Md$), 4 ans d'itération financée.
- **Reproductible** en quelques mois (couche produit : Radar, tagging, agent, workflow). **Non reproductible** rapidement : le volume de bibliothèque + la profondeur du benchmark marché.

## 3. Comment ils trackent la data (2 sources)
1. **Bibliothèque concurrents** : scraping continu Meta Ad Library + TikTok Ads/Creative Center → médias + métadonnées **copiés et persistés** (visibles même si l'annonceur supprime) → transcription + tagging IA. Tri « diffusée depuis le plus longtemps » = proxy de perf.
2. **Comptes connectés** : OAuth Meta/TikTok Marketing API → sync continue des métriques ad-level, agrégées (anonymisées) pour entraîner le benchmark Radar.

## 4. Pricing (août 2026)
- **Core** ~129 $/mois (annuel) / 159 $ mensuel.
- **Plus** ~**599 $/mois** — **hausse forte** (269 $ dans les données de début 2026).
- **Business / Enterprise** sur devis. Pas de plan gratuit, essai 7 jours (CB requise). Modèle de **crédits sans report**, caps de spend.

## 5. Forces / Faiblesses documentées
**Forces** : Radar prescriptif (« scale / iterate / kill » + pourquoi), bibliothèque 25 M, Review Mining (rare), agent Raya proactif + natif Slack, boucle fermée insight→brief→image→score.
**Faiblesses** : **Meta-only en analytics** (TikTok « en expansion »), **100 % anglophone**, **pas de white-label**, **prix d'entrée élevé** (et Plus qui double), **crédits opaques sans report** (source n°1 de mauvais avis), caps de spend, support/facturation mal notés (Trustpilot ~1,9/5).

---

## 6. Positionnement différenciant TikTrends (point par point)

| Axe | Atria | **TikTrends** |
|---|---|---|
| Plateforme | Meta-first (TikTok secondaire, analytics Meta-only) | **TikTok-first** (Ads + organique + Shop + Spark Ads) puis Meta |
| Marché | US / anglophone | **FR / EU** (langue, RGPD, hébergement OVH souverain) |
| Cible | Brands DTC + agences | **Agences multi-clients** (white-label, rapports clients, 40+ marques) |
| Data | Scraping propriétaire | **Brancher** Trendtrack API (déjà ouverte/connectée) + sources officielles EU (Meta Ad Library API DSA, TikTok Commercial Content Library, Creative Center) |
| Agent | Raya (anglophone) | **Tess** (FR, proactive, Slack + WhatsApp) |
| Contenu | Images statiques | Images **+ vidéo** (Higgsfield dans le stack) |
| Pricing | Crédits opaques sans report + caps + Plus à ~599 $ | **Crédits transparents avec report partiel**, **pas de cap de spend**, **prix agence par marque** |
| Spécificité TikTok | — | Hook rate 2 s, watch-time %, Spark Ads, sons tendance, créateurs, TikTok Shop GMV, scoring « natif TikTok » |

## 7. Le wedge (à retenir)
On **n'égale pas** leur bibliothèque de 25 M d'ads (12-18 mois + risque juridique). On **comble leur angle mort** : **TikTok-first, FR/EU-first, agence-first, prix clair, souveraineté data (OVH)**. La hausse de prix d'Atria (Plus ×2+) **élargit** la place pour une alternative européenne à tarification honnête.

## 8. Ce qu'il ne faut PAS copier chez Atria
- Le modèle de **crédits opaques sans report** (leur pire point d'avis).
- Les **caps de spend**.
- L'absence de **white-label** (indispensable pour les agences).
- Le **tout-anglais**.

---

## 9. Actions qui découlent de ce brief
1. Prendre **Trendtrack Pro** (débloque l'API) → brancher l'Inspo **avant** l'accès Meta/TikTok.
2. Lancer les **demandes d'accès API TikTok/Meta Marketing** (2-6 sem., chemin critique).
3. Confirmer avec Trendtrack le **droit de stockage des médias** (juridique, §5.11).
4. Trancher le **nom de l'agent** (Tess) et la **tarification agence par marque**.

*Sources : tryatria.com (pricing), reviews Trendtrack / max-productive.ai / Hack'celeration / AdCreate, et le CDC interne.*
