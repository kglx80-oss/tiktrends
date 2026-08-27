# ADSMAP · Journal des décisions

Tenu en application du §0 du cahier des charges : toute ambiguïté non tranchée en §17 est
résolue par l'option la plus simple respectant les invariants du §2.4, et consignée ici.

Statuts : **PROPOSÉE** (en attente de Kévin) · **PRISE** (appliquée) · **RÉVISÉE**.

---

## D1 — Ne pas dupliquer la couche de données dormante

**Statut :** PROPOSÉE · Phase 0 · bloquante pour la Phase 1

Sept tables du schéma (`creatives`, `ad_instances`, `metrics_daily`, `creative_tags`,
`radar_scores`, `briefs`, `insights`) couvrent déjà `AssetAnalysis`, `MetricSnapshot`, la face
plateforme de `Ad`, la sortie d'A0, le diagnostic de funnel et le brief d'A3. Aucune n'est
utilisée par le code applicatif.

**Décision proposée :** ADSMAP les étend. Créer `Ad`, `MetricSnapshot` et `AssetAnalysis` à côté
produirait deux modèles concurrents de la même réalité, avec deux synchronisations Meta et deux
vérités sur la performance.

**Conséquence si refusée :** compter environ une journée de plus en Phase 1, et prévoir la
suppression explicite des tables dormantes pour éviter l'ambiguïté.

---

## D2 — « Avatar » et « Persona » désignent le même objet

**Statut :** PROPOSÉE · bloquante pour la Phase 1

`personas` (`brand_id`, `name`, `description`, `pains[]`, `desires[]`) est déjà, champ pour champ,
le modèle `Avatar` du §4.

**Décision proposée :** conserver la table `personas`, y ajouter `objections[]`, `sources`,
`status`, et n'employer qu'un seul terme dans l'interface. Je propose **« Avatar »**, qui est le
mot du métier et celui du cahier des charges ; « Persona » disparaît des libellés.

---

## D3 — Transcription : ffmpeg + service dédié, avec repli vision seule

**Statut :** PROPOSÉE · §17.5

Le cahier des charges suppose `video_analysis_create` d'Higgsfield « déjà branché ». Il ne l'est
pas : le connecteur du dépôt n'expose que la génération vidéo (cf. `STACK.md` §2.1).

**Décision proposée :** extraction audio par ffmpeg dans le worker, puis transcription par service
dédié. En cas d'échec, A0 continue sur les frames seules, `transcript` et `hook_spoken` restent
nuls et `confidence` baisse en conséquence. Un asset non transcrit ne bloque jamais un batch.

---

## D4 — Compléter le connecteur Meta avant le moteur de verdict

**Statut :** PRISE (contrainte technique, sans arbitrage)

La synchro actuelle est agrégée sur 30 jours et ignore `adset_id`, `campaign_id`, le budget
quotidien des ad sets, `reach`, les paliers `p25/p50/p100` et `landing_page_views`. Le contrôle de
protocole (§6.2) et les intervalles (§6.4) en dépendent.

**Décision :** ajouter ces champs en tête de Phase 3, avec `time_increment=1`, avant d'écrire la
moindre règle de verdict. `metrics_daily` a déjà les colonnes.

---

## D5 — `LandingPage.cvr_30d` saisi à la main en v1

**Statut :** PRISE (repli prévu par le cahier des charges) · §17.6

L'Admin API Shopify branchée lit les commandes, pas les sessions : elle ne peut pas produire de
taux de conversion. Il faudrait `shopifyqlQuery`, une autre surface d'API.

**Décision :** saisie manuelle en v1, requête ShopifyQL en SHOULD de Phase 5. Le diagnostic
CONVERT (§8.4) fonctionne dès la v1 en comparant le CVR de l'ad à la baseline saisie.

---

## D6 — Le moteur de verdict vit dans `packages/core`

**Statut :** PRISE

Métriques dérivées, intervalles, règles de verdict, kill rules, score A7 v1 et parser de nommage
sont du calcul pur. `packages/core` n'a aucune dépendance serveur et est déjà couvert par des
tests. L'Annexe A se transpose directement en table de cas.

Point non traité par le cahier des charges : l'intervalle de Poisson par quantiles chi² suppose
une fonction quantile absente de JavaScript. Elle sera implémentée (inverse de la gamma
incomplète régularisée) et testée contre des valeurs de référence, plutôt qu'approximée
silencieusement.

---

## D7 — Les agents consomment le système de crédits existant

**Statut :** PRISE

Le produit dispose d'un débit atomique (`reserveCredits` / `settleCredits` / `refundCredits`),
d'un barème dans `packages/core`, d'un grand livre et d'une page `/usage`. `AgentRun.cost_eur` s'y
branche au lieu d'ouvrir un compteur parallèle.

**Point à trancher, absent du cahier des charges :** l'orchestrateur nocturne dépense des crédits
sans personne devant l'écran. Proposition — plafond nocturne par marque, et arrêt propre avec un
`DecisionItem` explicite quand le solde est insuffisant, jamais un échec silencieux.

---

## D8 — Canvas chargé dynamiquement et branché sur le thème du produit

**Statut :** PRISE

`@xyflow/react` et `elkjs` sont les premières dépendances UI du projet. Chargement par
`next/dynamic` avec `ssr: false` pour ne pas alourdir les pages sans canvas, et couleurs prises
sur les variables CSS existantes (`--ink`, `--surface`, `--accent-strong`) plutôt que sur le thème
par défaut de la bibliothèque.

---

## D9 — `brief_competitor` et `find_similar_shops` passent en COULD

**Statut :** PRISE

Le connecteur Trendtrack du dépôt expose `ttSearchAds`, `ttSearchTikTok`, `ttSearchGoogle` et
`ttGetMe`. Les deux fonctions citées au §8.3 A1 n'y sont pas.

**Décision :** A1 travaille sur `ttSearchAds`, déjà suffisant pour nourrir avatars et angles à
partir de la copy concurrente. Les deux autres seront ajoutées au connecteur si l'API Trendtrack
les expose, sans bloquer la Phase 5.

---

## D10 — Notion : abandon en v1

**Statut :** PROPOSÉE

Aucune intégration Notion dans le dépôt. Le brief d'A3 est déjà stocké (`briefs.content_json`),
affichable et exportable.

**Décision proposée :** ne pas ouvrir cette intégration en v1. À reconsidérer si l'équipe de
production travaille réellement dans Notion au quotidien.
