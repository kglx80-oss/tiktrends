# TikTrends Creative Intelligence — Étude Atria + Cahier des charges

> Document destiné à être donné tel quel à Claude Code comme base de développement. Rédigé le 22/08/2026.

---

## 0. Cadre méthodologique et limites de l'étude

**Ce qui a été analysé** : site marketing tryatria.com (home, pricing, MCP/API), help center Intercom (articles Raya, AI tagging, image gen, Ask Raya, troubleshooting), blog produit (annonce Raya, février 2026), documentation API publique (endpoints `/open/v1/*`), 4 reviews indépendantes (max-productive.ai, hackceleration, aazarshad, trendtrack.io), Chrome Web Store.

**Ce qui n'a pas pu être analysé** : l'application elle-même (`app.tryatria.com/workspace/raya` est derrière login). L'UI décrite ci-dessous est reconstituée depuis les captures publiées dans les reviews et la doc. Confiance sur l'architecture fonctionnelle : élevée (~90 %). Confiance sur les détails d'écran et les règles de scoring internes : moyenne (~60 %). Si tu as un compte, une session de 30 minutes d'enregistrement d'écran module par module ferait monter tout le document à 95 %.

**Correction de prémisse avant de commencer.** "Un outil tout aussi performant" n'est pas atteignable à l'identique par du code seul, et il faut que ce soit clair avant d'ouvrir Claude Code :

- La valeur d'Atria repose à ~60 % sur des actifs data, pas sur du logiciel : 25 M+ d'annonces scrapées et stockées depuis 2022, un modèle de scoring entraîné sur 5–9 Md$ de dépense pub réelle de milliers de comptes connectés, et 4 ans d'itération financée par Accel.
- Ce qui est reproductible en quelques mois avec Claude Code : 100 % de la couche produit (workflow, boards, tagging IA, Radar, review mining, génération, agent, API/MCP). Ce qui ne l'est pas : le volume de la bibliothèque et la profondeur statistique du benchmark marché.
- Conséquence stratégique : TikTrends doit **acheter ou brancher** sa couche data (API Trendtrack déjà connectée à ton stack, Meta Ad Library API via le DSA européen, TikTok Commercial Content Library API, TikTok Creative Center) et **construire** la couche intelligence par-dessus. Tenter de re-scraper 25 M d'ads est un projet d'infrastructure de 12–18 mois et un risque juridique, pas un avantage.
- Le vrai angle d'attaque n'est pas la parité avec Atria ; c'est son angle mort : Raya et Radar n'analysent aujourd'hui que les comptes **Meta** (TikTok « en cours d'expansion »), l'outil est 100 % anglophone, sans white-label agence, avec une note Trustpilot de 1,9/5 sur le support et la facturation. TikTrends peut être **TikTok-first, FR/EU-first, agence-first**.

---

## 1. Fiche produit Atria

| Élément | Donnée |
|---|---|
| Éditeur | TESSERACT01, Inc. (San Francisco), fondé avril 2022 par Ray Jang (ex-ByteDance/TikTok), backé par Accel |
| Positionnement | « Your creative engine that drives winning ads » — plateforme de creative intelligence + workflow end-to-end pour Meta/TikTok |
| Cible | Media buyers, creative strategists, agences, marques DTC dépensant ≥ 5 k$/mois |
| Données revendiquées | 25 M+ ads (Meta + TikTok), 9 Md$+ de dépense pub d'entraînement (5 Md$ en février 2026, 2,1 Md$ fin 2025 : le chiffre est marketing et gonfle vite), 20 000+ équipes |
| Pricing (annuel) | Core 129 $/mois (5 sièges, 4 000 crédits, 50 marques suivies, cap 500 k$/mois de spend) · Plus 269 $/mois (8 sièges, 10 000 crédits, 100 marques, cap 1 M$) · Business/Enterprise sur devis (15 sièges, 25 000 crédits, 200 marques, spend illimité). Mensuel : 159 $ / 329 $. Siège additionnel 20 $/mois. Essai 7 jours, CB requise |
| Modèle de crédits | Chaque action IA coûte des crédits (affichés au survol), reset mensuel sans report, top-ups qui n'expirent pas |
| Intégrations | Meta Ads, TikTok Ads (comptes), Slack (agent + rapports programmés), Canva, Google Drive, Google Docs (export rapports), extension Chrome, REST API (`X-API-Key`), serveur MCP (`https://api.tryatria.com/mcp`) |
| Sécurité | SOC 2 Type II |
| Navigation app | Onglets principaux : **Inspo** (bibliothèque + marques suivies + boards), **Analytics & Launch** (comptes pub, Radar, AI tagging, Ask Raya, rapports), **Creation** (scripts, images, clone, iterate), **Raya** (workspace agent, route `/workspace/raya`), Settings (Connections, Billing, Team) |
| Faiblesses documentées | Meta + TikTok uniquement (pas Google/YouTube) ; Raya analytics Meta-only ; prix d'entrée élevé ; crédits sans report ; caps de spend ; support/facturation mal notés (Trustpilot 1,9/5 sur 7 avis) ; pas de white-label ; certaines features « coming soon » (bulk upload Meta, cross-account, contrôles d'accès avancés) |

---

## 2. Décomposition fonctionnelle d'Atria (par premiers principes)

Atria résout une boucle à 5 étapes. Chaque module sert une étape, et la valeur vient du fait que la donnée circule entre les étapes sans ressaisie.

```
RECHERCHER → COMPRENDRE → DÉCIDER → PRODUIRE → LANCER/MESURER → (retour à COMPRENDRE)
  Inspo        Radar +      Briefs     Scripts,     Bulk upload,
  Brands       AI tags      Raya       Images,      Rapports,
  Boards       Review       Auto-gen   Clone,       Alertes
  Chrome ext   mining                  Iterate
```

### 2.1 Module RECHERCHE — « Inspo »

**Ad Library (Discovery feed)**
- Flux d'annonces Meta + TikTok, 25 M+, stockées définitivement (persistantes même si l'annonceur les supprime).
- Filtres : Format (image/vidéo/carrousel), Durée vidéo, Plateforme, Industrie (~45 catégories e-commerce : skincare, men's grooming, sportswear…), Statut (active/inactive), Langue, Thème.
- Tris : plus récent, **plus longtemps diffusé** (proxy de performance — c'est le tri recommandé par leur doc), par marque.
- Recherche sémantique : par angle de message, type de hook, thème, pas seulement par mot-clé/marque.
- Chaque carte : aperçu média, marque, plateforme, date de lancement, durée de diffusion, landing page, texte primaire/headline, tags IA, boutons **Save to board**, **Clone ad**, **Transcribe**.
- Fiche annonce : média lisible, transcription vidéo (payante en crédits), hooks extraits, copy complète, URL de landing, asset URLs, marques similaires.

**Brand Library / Competitor tracking**
- Page marque : nombre d'ads actives, niche, régions, « creative velocity » (cadence de lancement), top hooks, top personas, top landing pages, résumé IA de la stratégie (« playbook »).
- Suivi : cœur sur une marque → elle rejoint les « followed brands » (quota 50/100/200 selon plan). Raya mémorise ces marques pour ses analyses concurrentielles et ses digests.
- Feed « followed brands » : nouvelles annonces des marques suivies, jour par jour (exposé aussi via API pour digests Slack).

**Boards (swipe files)**
- Organisation par client/projet/thème, commentaires, tags manuels + IA, notes, lien de partage public, import depuis Foreplay (migration assistée).
- Extension Chrome : sauvegarde en un clic depuis Meta Ad Library et TikTok Ads Library/Creative Center, avec transcription auto.

### 2.2 Module COMPRENDRE — « Analytics & Launch »

**Connexion comptes pub** : OAuth Meta (Marketing API) et TikTok (Marketing API). Sync automatique continue. Multi-comptes (agences), cross-account « coming soon ».

**Dashboard compte**
- KPIs : Spend, ROAS, CPA, CTR, AOV, Hook rate (3s views / impressions), Hold/Retention (ThruPlay ou 15s / 3s), conversions.
- Vue par créa (grille visuelle type Motion) : vignette + métriques, filtrable par date/campagne/format/tag.
- **Naming convention parser** : extraction de dimensions depuis le nom des ads (réglable dans le header).
- **Top Creative Tags** : bar charts horizontaux par catégorie de tag (Persona, Core desire, USP, Theme, Key message, Hook, Emotion, Format) avec sélecteur de métrique cible (ROAS, CTR…). Objectif : trouver la *combinaison* gagnante persona × hook × theme.

**AI Tagging (Raya)**
- Auto-tag des top créas à la connexion ; option « Always auto-tag new creatives ».
- Dimensions : hook, persona, core desire, USP, theme, key message, emotion, format, style visuel, couleurs, produit.
- Tags éditables/ajoutables manuellement sur chaque créa.

**Radar (moteur prescriptif — le cœur d'Atria)**
- Note chaque créa avec **lettre A→D** sur 4 axes : Conversion, Hook, Retention, CTR.
- Classe chaque créa : **Winner**, **High Iteration Potential**, **Iteration Candidate** (+ implicitement « kill »).
- Fiche Radar d'une créa : métriques avec grades, **persona cible identifié automatiquement**, **problèmes détectés** (CTA faible, proposition de valeur floue, manque d'urgence, hook lent…), **recommandations priorisées avec exemples concrets**, bouton **Iterate ads** (génération d'une version corrigée), coût en crédits affiché au survol.
- Alertes proactives quand une créa décline (fatigue), suggestions « scale this / kill that ».
- Entraîné sur ≥ 1 Md$ de spend (benchmarks marché par vertical pour calibrer les grades).

**Ask Raya (chat analytics)** : bouton en bas à droite du compte pub. Questions en langage naturel → réponses avec les créas affichées inline, analyse croisée des tags, génération de rapports visuels avec graphes, export Google Doc, mémoire de conversation. Périmètre : données du compte connecté uniquement (Meta today).

**Rapports** : génération automatique, export lien partagé / Google Doc, envoi Slack programmé (choix rapports, fréquence, canal).

### 2.3 Module DÉCIDER — Insights et briefs

**Review Mining** (différenciant, aucun concurrent direct ne l'a) : import d'avis Amazon/Google/Trustpilot/CSV → extraction de pain points, déclencheurs émotionnels, objections, langage client verbatim → transformés en angles, hooks, concepts. Coût en crédits par rapport.

**URL / landing page analysis** : coller une URL → extraction produit, audience, USP, ton, niveau de conscience (Schwartz) → brief auto-rempli.

**Briefs data-driven** : Raya compose des briefs créatifs à partir des winners Radar + tags + intel concurrents + reviews (fonction en cours de finalisation selon la doc : « turn answers into creative briefs is on the roadmap »).

### 2.4 Module PRODUIRE — « Creation »

**Scripts & copy** : génération de scripts vidéo (UGC, testimonial, problème/solution…), hooks, primary text/headline/description, à partir d'un prompt, d'une ad de référence, d'un brief ou des insights reviews. Transcription de vidéos existantes.

**Images (3 voies)**
1. **Auto-Gen hebdomadaire** : Raya lit les Winners/High potential de Radar et livre chaque semaine jusqu'à 4 sets × 12 images, chacune avec analyse « pourquoi ça peut marcher », recommandations de ciblage, messages, tags.
2. **Clone ad** : depuis n'importe quelle image statique (Inspo, concurrents, boards) → wizard 2 étapes (Context → Image ads) : choix de la marque (logo, couleurs, détails ; création de marque par URL ou manuelle), brief auto par URL ou manuel (produit, objectif, description, USP, cible, ton, plateforme, niveau de conscience), ratio, taille de batch → génère des variantes qui suivent la composition de la référence avec l'identité de la marque.
3. **Iterate** : depuis Radar, régénère une version corrigée d'une créa sous-performante en appliquant les recommandations.

**Playground IA** : espace libre de prompting contextualisé par la marque.

**Canva** : envoi vers templates Canva pour finition.

### 2.5 Module LANCER — « Launch »

- **Bulk upload vers Meta** (Raya batch uploads « dozens of creatives ») : mapping campagne/adset, naming convention, copy, lancement en un clic. Annoncé « coming soon » en février 2026, présenté comme live sur la home en août 2026.
- Auto-scale winners / auto-pause losers (règles).

### 2.6 Module AGENT — « Raya » (route `/workspace/raya`)

- Agent unique derrière toutes les features IA ; persona féminine nommée, « trained on $9B ad spend ».
- Interface chat de type workspace avec quick actions : « Analyze my ad performance », « Clone competitor's top performing ads », « Learn from my poor performing ads », « Scale my winning ads to new products », « Build a report ».
- Comportement **proactif** : jobs hebdomadaires sans prompt (auto-tag, monitoring concurrents, génération d'images, digest), pas seulement réactif.
- **Natif Slack** : on lui parle dans Slack, elle répond avec créas/graphes ; rapports programmés.
- Streaming temps réel ; timeouts documentés sur les gros comptes (limite : découper les demandes).
- Limites actuelles : données compte Meta uniquement, pas d'accès aux données concurrents dans le chat analytics, briefs exécutables en roadmap.

### 2.7 Module PLATEFORME

- **REST API** `https://api.tryatria.com/open/v1/` : `ad-library/search`, `ad-library/{ad_id}`, `brand-library/search`, `brand-library/{brand_id}`, `brand-library/{brand_id}/ads`, `brand-library/followed`, `boards`, `ad-accounts` (métriques ad-level, tri KPI, résumé compte), `image-generations` (job → poll → résultat).
- **MCP** natif (Claude/ChatGPT/Cursor) exposant les mêmes capacités.
- Workspace multi-marques, sièges, rôles (basiques), connexions, billing crédits.

---

## 3. Ce qui crée réellement la valeur (et ce qu'il faut copier en priorité)

1. **Le prescriptif plutôt que le descriptif.** Motion montre des chiffres ; Radar dit « scale / iterate / kill » et pourquoi. C'est la feature qui génère les témoignages. Priorité absolue.
2. **La boucle fermée.** Un insight de review → brief → image → score Radar → itération, sans changer d'outil. Chaque module lit les outputs des autres (la table `creative_tags` est le pivot).
3. **Le tri « longest running » comme proxy de performance** sur les ads concurrentes. Simple, robuste, ne nécessite aucune donnée de spend.
4. **Le tagging multi-dimensionnel** qui transforme l'analyse par ad en analyse par *ingrédient créatif* (persona × hook × émotion). C'est ce qui rend l'agent utile.
5. **La proactivité** : l'agent travaille sans prompt (digest, auto-gen hebdo, alertes fatigue). Différence de perception énorme vs « un chat ».
6. **Slack natif** : l'outil vit là où l'équipe vit.

Ce qu'il ne faut **pas** copier : le modèle de crédits opaque (source n°1 de mauvais avis), les caps de spend, l'absence de white-label.

---

## 4. Positionnement cible TikTrends

**Thèse** : *La plateforme de creative intelligence TikTok-first pour les marques et agences francophones/européennes, avec un agent qui pilote la production créative de bout en bout.*

| Axe | Atria | TikTrends |
|---|---|---|
| Plateforme prioritaire | Meta (TikTok secondaire, analytics Meta-only) | **TikTok** (Ads + organique + Shop + Spark Ads) puis Meta |
| Marché | US, anglophone | **FR / EU** (langue, RGPD, Ad Library DSA, Trendtrack) |
| Cible | Brands DTC + agences | **Agences multi-clients** (white-label, rapports clients, 40+ marques) + DTC |
| Sources data | Scraping propriétaire | **Trendtrack API** (bibliothèque Meta/TikTok/Google, brandtracker, emails), TikTok Creative Center, Commercial Content Library (EU), Meta Ad Library API (EU), comptes connectés |
| Agent | Raya | **« Tess »** (nom de travail — à valider) ; proactive, Slack + WhatsApp |
| Contenu | Images statiques | Images **+ vidéo** (Higgsfield déjà dans le stack : UGC IA, motion, dubbing FR/DE/EN) |
| Pricing | Crédits opaques + caps | Crédits **transparents avec report partiel**, pas de cap de spend, prix agence par marque |
| Spécificité TikTok | — | Hook rate 2 s, watch-time %, Spark Ads, sons tendance, créateurs, TikTok Shop GMV, scoring « natif TikTok » |

---

## 5. Cahier des charges

### 5.1 Personas & jobs-to-be-done

| Persona | JTBD principal | KPI de succès produit |
|---|---|---|
| Media buyer agence (Hugo/Léo/Marine) | Savoir chaque lundi quoi scaler, couper, itérer sur 10 comptes | Temps d'analyse hebdo < 30 min/compte |
| Creative strategist | Produire 20 briefs/semaine ancrés dans des données | Brief généré → validé sans retouche > 60 % |
| Fondateur DTC | Comprendre pourquoi ses ads marchent, copier les concurrents | Rétention mensuelle > 85 % |
| Directeur d'agence (Kévin) | Rapports clients automatiques, preuve de valeur | Rapports envoyés sans intervention 100 % |

### 5.2 Périmètre par version

**MVP (V1, ~10–12 semaines)** — objectif : un compte TikTok/Meta connecté produit des insights prescriptifs et des briefs exploitables.
1. Auth, workspaces, marques (brand kit), équipe, rôles.
2. Connexion comptes pub TikTok Ads + Meta Ads, sync ad-level quotidien + intraday.
3. Dashboard créas (grille visuelle) + KPIs + naming parser.
4. AI tagging automatique (taxonomie §5.5).
5. Radar v1 : scoring A–D relatif au compte + classification + recommandations LLM.
6. Inspo via **Trendtrack API** (recherche, filtres, longest running, pages marques, follow).
7. Boards + extension Chrome (save TikTok Creative Center / Meta Ad Library / Trendtrack).
8. Agent Tess v1 : chat sur données du compte, génération de rapports, briefs structurés.
9. Scripts & copy generation (brand-aware).
10. Crédits + billing Stripe.

**V2 (+8 semaines)** : Review mining, URL→brief, Clone ad images (Nano Banana / fal.ai / Higgsfield), Iterate, Auto-gen hebdo, Slack + WhatsApp, rapports programmés white-label, API publique + MCP.

**V3** : Bulk upload TikTok/Meta + règles auto-scale/pause, vidéo IA (Higgsfield : UGC, motion control, dubbing), benchmarks marché agrégés (anonymisés, opt-in clients), TikTok Shop / Spark Ads / créateurs, Google Ads.

### 5.3 Spécifications fonctionnelles détaillées

#### F1 — Comptes, workspaces, marques
- Un **workspace** = une agence ou une marque. Un workspace contient N **brands**. Un brand contient : nom, URL, logo, palette (extraite automatiquement du site), ton de voix, industrie, produits (nom, description, USP, prix), personas, concurrents suivis, comptes pub liés, langue(s).
- Création de brand par URL : scrape + LLM → pré-remplissage de tous les champs, validation humaine.
- Rôles : Owner, Admin, Member, **Client viewer** (lecture seule sur son brand, pour white-label).
- Multi-workspace par utilisateur (un freelance qui bosse pour 2 agences).

#### F2 — Connexion et ingestion comptes publicitaires
- OAuth TikTok Marketing API (scopes ad read, report read, creative read) et Meta Marketing API (`ads_read`, `ads_management` pour V3).
- Ingestion : liste ads + créatifs (vidéo/image téléchargés et stockés en S3/R2 — les CDNs expirent), métriques journalières par ad : spend, impressions, reach, clicks, CTR, CPC, CPM, conversions, CPA, ROAS, AOV, video views 2s/3s/6s/15s/p25/p50/p75/p100, avg watch time, thruplay (Meta), likes/comments/shares (TikTok).
- Fréquence : backfill 90 jours à la connexion ; refresh toutes les 3 h ; recalcul J-1 complet la nuit (les conversions s'attribuent en retard).
- Dédup créas : une même vidéo utilisée dans 5 ads = 1 **creative** avec N **ad instances** ; métriques agrégées au niveau creative (c'est l'unité d'analyse de Radar).
- Naming convention parser : regex configurable par workspace (`{client}_{format}_{angle}_{hook}_{v}`), extraction en dimensions filtrables.

#### F3 — Dashboard créas
- Vue grille (vignette + 4 KPIs sélectionnables), vue tableau, vue « par tag ».
- Filtres : période, compte, campagne, format, statut, tags IA, dimensions de naming, grade Radar.
- Comparaison de périodes, tri par n'importe quel KPI, seuil de spend minimal pour filtrer le bruit (défaut : ≥ 50 € ou ≥ 1 000 impressions).
- Top Creative Tags : barres horizontales par dimension avec métrique cible sélectionnable, + matrice persona × hook.

#### F4 — AI tagging
- Déclenchement : à l'ingestion pour les créas ≥ seuil de spend ; option « toujours auto-tagger » ; bouton manuel avec coût affiché.
- Pipeline vidéo : extraction frames (1 fps sur les 3 premières secondes, puis 0,2 fps), transcription (Whisper large-v3 ou API), OCR des textes à l'écran, détection musique/voix, durée → prompt multimodal Claude → JSON strict conforme à la taxonomie §5.5 + résumé libre + hook verbatim (3 premières secondes).
- Pipeline image : vision + OCR → mêmes dimensions.
- Tags éditables ; corrections humaines stockées comme `tag_overrides` et réinjectées en few-shot pour ce workspace (amélioration continue sans fine-tuning).
- Confiance par tag (0–1) stockée ; tags < 0,5 affichés en pointillé.

#### F5 — Radar (moteur prescriptif)
Voir spécification algorithmique §5.6. Fonctionnellement :
- Onglets **Winners / High iteration potential / Iteration candidates / Fatigued / Insufficient data**.
- Fiche créa : 4 grades (Hook, Hold, CTR, Conversion) + grade global, persona détecté, diagnostic (liste de problèmes typés), recommandations priorisées (max 5) avec exemple concret réécrit (« remplace le hook "Découvrez notre sérum" par "J'ai arrêté le rétinol pendant 30 jours, voilà ma peau" »), boutons **Iterate**, **Brief from this**, **Find similar in Inspo**.
- Alertes : fatigue (CTR ou hook rate en baisse > 20 % sur 7 j glissants vs 14 j précédents avec fréquence > 2,5), winner émergent (spend faible, grades A), kill candidate (spend > X, grade D conversion sur 7 j).
- Digest hebdo automatique par compte (Slack/WhatsApp/email).

#### F6 — Inspo (bibliothèque)
- Source V1 : Trendtrack (search_ads, search_advertisers, search_tiktok_library, lookup, find_similar_shops, brief_competitor, analyze_brand_changes, daily_radar). Source V2 : TikTok Creative Center top ads + Commercial Content Library (EU), Meta Ad Library API (EU). Toutes les ads récupérées sont **copiées en stockage propre** (média + métadonnées) pour persistance.
- Filtres et tris identiques à Atria (§2.1) + spécifiques TikTok : Spark Ad oui/non, son utilisé, créateur, durée, vues estimées.
- Recherche hybride : full-text + vectorielle (pgvector) sur transcription + tags + copy. Requêtes type « hook problème-solution skincare femme 40+ ».
- Page marque : ads actives, velocity (ads/semaine sur 8 semaines), top hooks, personas, landing pages, timeline, « playbook » IA, bouton Follow (quota par plan).
- Feed followed brands + digest quotidien.
- Actions carte : Save to board, Clone, Transcribe, Brief from this, Add to competitor set.

#### F7 — Boards
- CRUD boards, sections, drag & drop, commentaires, mentions, tags, notes, lien public (option mot de passe), export PDF/Notion (tu bosses déjà dans Notion → export natif).
- Import Foreplay/Atria via CSV/JSON.
- Extension Chrome (Manifest V3) : bouton « Save to TikTrends » sur TikTok Creative Center, TikTok Ads Library, Meta Ad Library, Trendtrack, et n'importe quelle page vidéo (fallback : capture URL + screenshot).

#### F8 — Review mining
- Sources : import CSV, scraping Amazon/Google/Trustpilot par URL (via Apify ou équivalent — coût à refacturer en crédits), Shopify (avis Judge.me/Loox via API — avantage direct pour ton portefeuille Shopify).
- Output structuré : top 10 pain points (avec fréquence et verbatims), top 10 désirs, objections, langage récurrent, moments d'usage, comparaisons concurrents citées → chaque item est un **insight** rattaché au brand, utilisable dans les briefs et scripts.

#### F9 — Briefs
- Template structuré : objectif, persona, awareness level, angle, hook (3 variantes), structure (timing seconde par seconde pour vidéo), messages clés, preuve, CTA, références visuelles (ads Inspo liées), do/don't, specs format.
- Généré depuis : Radar (winner à décliner), Inspo (ad à adapter), Review mining (insight), prompt libre. Toujours brand-aware.
- Export : Notion, Google Doc, PDF, lien partagé, envoi à un créateur UGC.

#### F10 — Génération
- **Scripts** : formats TikTok natifs (UGC talking head, POV, before/after, green screen, listicle, storytime, problem-solution, founder), langues FR/EN/DE, longueur cible, hooks × 5.
- **Copy** : primary text / headline / description Meta ; caption TikTok + hashtags. Réutilise les skills d'ad copy que tu as déjà construits.
- **Images** (V2) : clone (référence + brand kit → variantes même composition), iterate (créa + recommandations Radar → version corrigée), auto-gen hebdo (4 sets × 12). Modèles : Gemini image (Nano Banana) pour le respect du texte/logo, FLUX via fal.ai en secours. Toujours : aperçu, coût, batch, ratios 9:16 / 1:1 / 4:5.
- **Vidéo** (V3) : Higgsfield (image-to-video, UGC avatar, motion control, dubbing) piloté par le brief.

#### F11 — Agent Tess
- Surface : page `/workspace/tess` (chat plein écran + panneau latéral « ce que Tess a fait cette semaine »), bouton flottant dans Analytics, Slack app, WhatsApp (via Kanal que tu utilises déjà).
- **Outils** (function calling) : `get_account_metrics`, `list_creatives(filters)`, `get_radar(creative_id)`, `search_inspo`, `get_brand_playbook`, `list_followed_brand_new_ads`, `get_reviews_insights`, `generate_brief`, `generate_script`, `generate_images(job)`, `create_report`, `save_to_board`, `tag_creatives`, `schedule_job`, `push_to_ads_manager` (V3).
- **Jobs proactifs** (cron) : lundi 8 h digest Radar par compte ; quotidien 9 h nouvelles ads concurrents ; hebdo auto-gen images ; alertes fatigue en temps réel (après chaque sync).
- Mémoire : fil de conversation persistant par brand ; mémoire longue (préférences, décisions) stockée en table `agent_memory`.
- Rapports : génération Markdown + graphes (Vega-Lite/Recharts rendus côté client, PNG pour Slack), export Google Doc/Notion/PDF white-label.
- Garde-fous : jamais d'action d'écriture sur un compte pub sans confirmation explicite ; affichage du coût crédits avant toute génération lourde ; découpage automatique des tâches longues (cause n°1 des timeouts Raya).

#### F12 — Rapports & white-label
- Rapports hebdo/mensuels par brand : résumé exécutif Tess, KPIs, top/flop créas, tags gagnants, concurrents, recommandations, prochaines créas.
- White-label : logo agence, domaine custom (`app.agence-x.com`), couleurs, signature.
- Envoi programmé : email, Slack, WhatsApp, lien client.

#### F13 — Launch (V3)
- Sélection de créas générées/validées → mapping campagne/adset/adgroup existant ou nouveau → copy → naming auto → upload TikTok (Spark Ad si code fourni) / Meta → statut.
- Règles : auto-pause si grade D conversion pendant N jours et spend > X ; suggestion de scale (+20 % budget) pour Winners, validation humaine par défaut.

#### F14 — Crédits, plans, billing
- Stripe ; plans Starter (1 brand), Agency (10 brands), Agency+ (40 brands), Enterprise. Pas de cap de spend.
- Crédits : 1 crédit = coût API réel × 3 (marge), coût affiché **avant** chaque action, historique détaillé, report de 25 % des crédits non utilisés, top-ups sans expiration, alertes à 80 %/100 %.
- Coûts indicatifs : tag vidéo 2, tag image 1, transcription 1/min, script 3, brief 5, image 4/unité, review mining 20, rapport 5, clone image 5/unité.

#### F15 — API & MCP
- REST `/v1/` : ads search, ad detail, brands, followed, boards, accounts metrics, creatives, radar, generations (job/poll). Auth `X-API-Key`, rate limit par plan.
- Serveur MCP (Streamable HTTP) exposant les mêmes outils que Tess → utilisable depuis Claude/Cursor par tes équipes.

### 5.4 Modèle de données (Postgres)

```
workspaces(id, name, plan, credits_balance, white_label_json, created_at)
users(id, email, name) ; workspace_members(workspace_id, user_id, role)
brands(id, workspace_id, name, url, logo_url, palette_json, tone, industry, languages[], brand_kit_json)
products(id, brand_id, name, description, usp, price, url)
personas(id, brand_id, name, description, pains[], desires[])
ad_accounts(id, brand_id, platform ENUM(tiktok,meta), external_id, access_token_enc, status, last_sync_at)
creatives(id, brand_id, ad_account_id, fingerprint_hash, type ENUM(video,image,carousel), storage_url, thumb_url, duration_s, transcript, ocr_text, embedding VECTOR(1536))
ad_instances(id, creative_id, external_ad_id, campaign_name, adset_name, name_dims_json, status, created_at)
metrics_daily(ad_instance_id, date, spend, impressions, reach, clicks, conv, revenue, v2s, v3s, v6s, v15s, p25, p50, p75, p100, avg_watch, likes, comments, shares, PRIMARY KEY(ad_instance_id,date))
creative_tags(id, creative_id, dimension, value, confidence, source ENUM(ai,human))
radar_scores(id, creative_id, period_start, period_end, grade_hook, grade_hold, grade_ctr, grade_conv, grade_overall, bucket ENUM(winner,high_potential,iteration,fatigued,insufficient), persona_detected, diagnosis_json, recommendations_json, computed_at)
alerts(id, brand_id, creative_id, type, payload_json, sent_channels[], created_at, acked_at)
library_ads(id, source ENUM(trendtrack,tiktok_cc,tiktok_ccl,meta_al,chrome_ext), external_id, platform, brand_name, library_brand_id, media_url, storage_url, format, duration_s, first_seen, last_seen, is_active, landing_url, copy_json, transcript, tags_json, embedding VECTOR(1536), raw_json)
library_brands(id, name, domain, platforms[], industry, regions[], active_ads_count, velocity_8w, playbook_json, last_refresh)
brand_follows(brand_id, library_brand_id)
boards(id, workspace_id, brand_id, name, share_token, share_password_hash) ; board_items(board_id, library_ad_id|creative_id, section, note, order) ; board_comments(...)
reviews_sources(id, brand_id, type, url, imported_at) ; reviews(id, source_id, text, rating, date) ; insights(id, brand_id, type ENUM(pain,desire,objection,language,usage), text, frequency, verbatims[], origin_ref)
briefs(id, brand_id, origin_type, origin_id, content_json, status, created_by)
generations(id, brand_id, kind ENUM(script,copy,image,video), input_json, output_json|asset_urls[], credits_cost, status, job_id)
agent_threads(id, brand_id, channel ENUM(web,slack,whatsapp), messages_jsonb) ; agent_memory(brand_id, key, value, updated_at)
agent_jobs(id, workspace_id, type, schedule_cron, last_run, next_run, config_json)
credit_ledger(id, workspace_id, delta, reason, ref_id, created_at)
api_keys(id, workspace_id, key_hash, scopes[], rate_limit)
```

### 5.5 Taxonomie de tags (JSON strict en sortie de l'IA)

```json
{
  "format": ["ugc_talking_head","pov","before_after","green_screen","listicle","storytime","demo","founder","testimonial","static_product","static_text","meme","comparison","unboxing","asmr","tutorial","street_interview","ai_generated"],
  "hook_type": ["question","bold_claim","pattern_interrupt","curiosity_gap","problem_callout","result_first","social_proof","controversy","direct_address","visual_shock","text_overlay_statement"],
  "hook_verbatim": "string (3 premières secondes, transcription exacte)",
  "persona": "string libre normalisé (ex: 'femme 35-50, peau sensible, budget moyen')",
  "core_desire": ["save_time","save_money","look_better","feel_better","status","belonging","safety","convenience","pleasure","mastery"],
  "emotion": ["curiosity","fear","relief","joy","pride","frustration","surprise","trust","desire","humor"],
  "angle": ["problem_solution","transformation","ingredient_mechanism","us_vs_them","myth_busting","offer_led","lifestyle","education","urgency_scarcity","founder_story"],
  "usp_claims": ["string[]"],
  "key_message": "string",
  "cta_type": ["shop_now","learn_more","try_risk_free","limited_offer","link_in_bio","none"],
  "visual_style": ["raw_phone","polished_studio","text_heavy","minimal","colorful","dark","lifestyle","product_macro"],
  "has_voiceover": true, "has_music": true, "has_captions": true, "has_face": true,
  "product_shown_at_s": 2.5,
  "language": "fr",
  "awareness_level": ["unaware","problem_aware","solution_aware","product_aware","most_aware"],
  "offer": "string|null",
  "confidence": {"format":0.9,"hook_type":0.8,"persona":0.6}
}
```

### 5.6 Spécification Radar (algorithme v1, sans dataset marché)

Principe : grades **relatifs au compte** en V1 (percentiles intra-compte sur les créas avec données suffisantes), puis **relatifs au vertical** en V3 quand le benchmark agrégé existe. Transparent et explicable, contrairement à Atria.

```
Période par défaut : 14 jours glissants. Seuil d'éligibilité : spend ≥ 50 € ET impressions ≥ 1 000 ; sinon bucket = insufficient.

Métriques dérivées (par creative, agrégées sur ses ad_instances) :
  hook_rate   = v2s / impressions (TikTok)  |  v3s / impressions (Meta)
  hold_rate   = v15s / v3s  (ou p50 / impressions si v15s absent)
  ctr         = clicks / impressions
  conv_eff    = ROAS si revenue dispo, sinon 1 / CPA (inversé pour tri)

Grades : pour chaque métrique, percentile intra-compte pondéré par spend.
  A ≥ p75, B ≥ p50, C ≥ p25, D < p25.
  Fallback si < 8 créas éligibles : seuils absolus par plateforme
  (TikTok : hook A ≥ 35 %, B ≥ 25 %, C ≥ 18 % ; hold A ≥ 30 % ; CTR A ≥ 1,2 %)
  (Meta vidéo : hook A ≥ 30 %, B ≥ 22 % ; CTR A ≥ 1,5 %).

Score global = 0.4·conv + 0.25·hook + 0.2·hold + 0.15·ctr (valeurs A=4…D=1).

Buckets :
  winner           : conv ∈ {A,B} ET global ≥ 3.2
  high_potential   : (hook = A ET conv ∈ {C,D})  OU  (conv = A ET hook ∈ {C,D})   -- un seul maillon faible
  iteration        : global entre 2.0 et 3.2, pas de maillon A
  kill_candidate   : conv = D ET spend ≥ 3 × CPA cible ET ≥ 7 jours
  fatigued         : bucket précédent winner/high_potential ET (ctr_7j / ctr_14j_préc ≤ 0.8 OU hook_7j / hook_14j ≤ 0.8) ET frequency ≥ 2.5

Diagnostic (règles → puis LLM pour la rédaction) :
  hook D            → "hook lent / non différenciant" (montrer hook_verbatim + 3 meilleurs hooks du compte)
  hook A, hold D    → "promesse non tenue après 3 s" (analyser transcript 3–15 s)
  hold A, ctr D     → "CTA absent ou tardif" (product_shown_at_s, cta_type)
  ctr A, conv D     → "landing page ou offre" (hors créa ; signaler)
  tous moyens       → "concept sans aspérité" → recommander angle/persona sous-exploités (tags gagnants du compte absents de cette créa)

Recommandations : LLM reçoit {créa : tags, transcript, grades, diagnostic} + {compte : top 5 winners avec tags} + {brand kit} → 3 à 5 actions priorisées avec exemple réécrit, JSON strict.
```

Validation : sur 3 comptes historiques de l'agence, comparer le bucket Radar J-14 à la décision réelle prise par le media buyer (scale/kill) → viser ≥ 75 % d'accord avant de l'exposer aux clients.

### 5.7 Architecture technique

- **Front** : Next.js 15 (App Router), TypeScript, Tailwind + shadcn/ui, TanStack Query, Recharts, i18n FR/EN/DE. Design : identité TikTrends (reprendre les tokens du thème Shopify déjà développé).
- **Back** : Next.js route handlers pour le CRUD ; **workers séparés** (Node + BullMQ sur Redis) pour ingestion, tagging, scoring, génération, crons. Les jobs IA ne tournent jamais dans une requête HTTP.
- **Base** : Postgres 16 + pgvector (Supabase ou Neon), Prisma ou Drizzle. Métriques en table partitionnée par mois.
- **Stockage** : Cloudflare R2 (médias créas + bibliothèque), presigned URLs, transcodage FFmpeg en worker, thumbs WebP.
- **IA** : Claude (Sonnet pour tagging/briefs/agent, Opus pour rapports complexes) via SDK avec tool use et structured outputs ; Whisper (API ou self-host) ; Gemini image / fal.ai pour images ; Higgsfield API pour vidéo ; embeddings via Voyage ou OpenAI text-embedding-3.
- **Intégrations** : TikTok Marketing API, Meta Marketing API + Ad Library API, Trendtrack API, Slack Bolt, WhatsApp via Kanal, Notion API, Google Docs API, Stripe, Apify (avis).
- **Auth** : Clerk ou Auth.js + RBAC ; tokens plateformes chiffrés (KMS).
- **Observabilité** : Sentry, OpenTelemetry, dashboard des coûts IA par workspace (indispensable pour le pricing crédits).
- **Infra** : Vercel (front) + Railway/Fly (workers) ou tout sur Railway ; Redis Upstash ; CI GitHub Actions ; environnements dev/staging/prod.
- **Sécurité / RGPD** : hébergement EU, DPA, suppression de compte en cascade, logs d'accès, pas d'entraînement sur données clients sans opt-in (et c'est l'opt-in qui construira le benchmark V3).

### 5.8 Exigences non fonctionnelles

- Sync d'un compte de 500 ads : < 10 min au backfill, < 2 min en refresh.
- Tagging : < 60 s par vidéo, parallélisé ; 100 créas taggées en < 15 min.
- Agent : premier token < 2 s, streaming, tâches > 30 s déléguées à un job avec notification.
- Disponibilité 99,5 % ; RPO 24 h ; RTO 4 h.
- Coût IA par brand/mois suivi et plafonné (kill switch).

### 5.9 Critères d'acceptation MVP

1. Connecter un compte TikTok Ads + un compte Meta, voir les créas avec KPIs corrects (écart < 2 % vs Ads Manager sur spend/impressions/clics).
2. 100 % des créas éligibles taggées automatiquement, JSON valide, ≥ 80 % de tags jugés corrects par un media buyer sur un échantillon de 50.
3. Radar classe toutes les créas éligibles et produit un diagnostic + recommandations lisibles en FR ; ≥ 75 % d'accord avec la décision humaine sur 3 comptes tests.
4. Recherche Inspo via Trendtrack avec filtres, tri longest running, save to board, page marque, follow, digest quotidien.
5. Tess répond à 10 questions de référence (« quelles créas scaler cette semaine ? », « quel hook performe le mieux chez les femmes 35+ ? », « génère un brief à partir de ma meilleure ad »…) avec les créas affichées inline.
6. Rapport hebdo white-label généré et envoyé sur Slack sans intervention.
7. Crédits débités correctement, coût affiché avant chaque action, facture Stripe.

### 5.10 Roadmap d'exécution (sprints de 2 semaines)

| Sprint | Livrable |
|---|---|
| 0 | Repo, CI, infra, schéma DB, auth, workspaces/brands, design system TikTrends |
| 1 | OAuth TikTok + Meta, ingestion, stockage médias, dashboard créas v1 |
| 2 | Pipeline tagging (vidéo + image), taxonomie, UI tags, Top Creative Tags |
| 3 | Radar v1 (scoring, buckets, diagnostic, recommandations), alertes |
| 4 | Inspo Trendtrack + boards + extension Chrome |
| 5 | Agent Tess v1 (web), briefs, scripts/copy, rapports Markdown |
| 6 | Crédits/Stripe, rapports white-label, Slack, beta interne sur 5 comptes agence |
| 7–10 | V2 : review mining, URL→brief, images (clone/iterate/auto-gen), WhatsApp, API + MCP |
| 11+ | V3 : launch, règles auto, vidéo Higgsfield, benchmark marché opt-in |

### 5.11 Risques et réponses

| Risque | Impact | Réponse |
|---|---|---|
| Dépendance Trendtrack pour la bibliothèque | Élevé | Contrat API + stockage propre de tout ce qui est récupéré + sources officielles EU en parallèle dès V2 |
| Quotas/approbation apps TikTok & Meta Marketing API | Bloquant | Demander l'accès avancé dès le sprint 0 (délai 2–6 semaines), usage interne agence en attendant |
| Qualité du tagging sur contenu FR/DE | Moyen | Few-shot par langue, boucle de correction humaine, évaluation hebdo sur 50 créas |
| Coûts IA non maîtrisés | Élevé | Ledger par action, plafonds, modèles moins chers pour tagging de masse (Haiku/Sonnet), cache des transcriptions |
| Radar perçu comme « boîte noire » | Moyen | Toujours afficher la métrique, le percentile et la règle qui a produit le grade |
| Scraping d'avis (Amazon) | Juridique | Passer par Apify/opérateur tiers, privilégier avis first-party Shopify |

---

## 6. Prompt d'amorçage pour Claude Code

À coller en premier message dans le repo vide :

```
Tu construis "TikTrends Creative Intelligence", une plateforme SaaS de creative intelligence pour TikTok Ads et Meta Ads, destinée aux agences et marques e-commerce francophones. Le cahier des charges complet est dans ./docs/CDC_TikTrends_Creative_Intelligence.md : lis-le intégralement avant toute action, puis :

1. Propose une arborescence monorepo (apps/web Next.js 15, apps/workers Node+BullMQ, packages/db Drizzle+Postgres+pgvector, packages/ai prompts et schémas Zod, packages/integrations tiktok/meta/trendtrack/slack, apps/extension Chrome MV3).
2. Implémente le Sprint 0 : schéma DB complet (§5.4), auth + workspaces + brands (F1), design system aux couleurs TikTrends, CI, .env.example avec toutes les clés listées en §5.7.
3. À chaque module, commence par les schémas Zod de la taxonomie (§5.5) et du JSON Radar (§5.6) : ce sont les contrats entre tous les modules.
4. Règles : pas de job IA dans une requête HTTP ; chaque action IA passe par le ledger de crédits ; tout ce qui est affiché à l'utilisateur est en français par défaut ; tests unitaires sur le scoring Radar et le parser de naming convention ; aucune écriture sur un compte publicitaire sans confirmation explicite.
5. Après chaque sprint, écris docs/SPRINT_N_REPORT.md : ce qui est fait, ce qui dévie du CDC et pourquoi, ce qui manque.
Commence par le point 1 et attends ma validation.
```

---

## 7. Actions immédiates

1. **Aujourd'hui** : créer les apps développeur TikTok for Business (Marketing API) et Meta (Marketing API + Ad Library API) et soumettre les demandes d'accès avancé — c'est le chemin critique.
2. **Cette semaine** : obtenir les conditions d'API Trendtrack (volume, stockage des médias autorisé, prix) ; décider le nom de l'agent ; sortir 3 comptes historiques (TikTok + Meta) avec les décisions scale/kill passées pour valider Radar.
3. **Semaine prochaine** : ouvrir le repo, coller le prompt §6 dans Claude Code, livrer le Sprint 0.
4. **Comment savoir si ça marche** : à la fin du Sprint 3, Radar doit être d'accord avec Hugo/Léo/Marine sur ≥ 75 % des décisions passées ; à la fin du Sprint 6, 5 comptes de l'agence reçoivent leur rapport hebdo sans intervention et l'équipe cesse d'ouvrir Ads Manager le lundi matin.
