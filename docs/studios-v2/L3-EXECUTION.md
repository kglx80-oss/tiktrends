# L3 · Exécution fiable et budget

Lot L3 du chantier Studios v1.0. Base : `claude/studios-integration` (`beac17c`). Chemins relatifs à `product/`.
Ce document dit **ce qui est tranché, pourquoi, et comment le vérifier**. Il ne décrit aucun état de production :
pour savoir ce qui tourne, comparer le commit du VPS à `origin/main` (CLAUDE.md). Aucune migration, aucun appel
réseau, aucune dépense : fournisseur et stockage SIMULÉS, réservés aux tests.

## 1. Ce que L3 livre

| Livrable | Où |
| --- | --- |
| Règles pures (devis, approbation, idempotence, registre, décisions du worker, décodage, vue) | `packages/core/src/studios/execution/` (export par une ligne en fin de `packages/core/src/index.ts`) |
| Commandes serveur | `apps/web/lib/studios/execution/commandes.ts`, `epinglage.ts` |
| Actions | `apps/web/app/actions/studios/execution.ts` |
| Crédits atomiques reliés par `ref_id` | `apps/web/lib/credits.ts` (`debiterCreditsDans`, `crediterCreditsDans`, `reserveCredits`/`refundCredits` en transaction, `refId` optionnel) |
| Worker | `apps/workers/src/studios/{moteur,registre,boucle,types}.ts` ; `startStudioWorker()` dans `worker.ts` |
| Fournisseur et stockage simulés | `packages/integrations/src/studios-simule.ts` (NON exporté par l'index du paquet) |
| Tests | `packages/core/test/l3-*.test.ts`, `apps/web/test/l3-*.test.ts` (+ harnais `l3-harnais.ts`), `apps/workers/test/` |

## 2. Commandes (plan 06 §3)

| Commande | Permission | Effet |
| --- | --- | --- |
| `estimerImpact` | `studio.read` | Lecture et calcul : plan d'impact (`calculerPlanImpact`) + devis indicatif. Aucune écriture. |
| `creerDevis` | `studio.generate` | Devis IMMUABLE sur la version courante : plan d'impact stocké, lignes en crédits entiers et micro-dollars, `inputHash`, `impactPlanHash`, `pricingVersion`, expiration, release épinglée. Aucune dépense. |
| `approuverEtMettreEnFile` | `studio.generate` | UNE transaction : relecture par clé, projet verrouillé en partage, approbation unique du devis, `verifierApprobation`, job `queued` + instantané, consommation de l'approbation, débit conditionnel des crédits (`credit_ledger.ref_id = studio:job:<id>:reserve`), réserve au registre studio (même référence), outbox `studio.job.queued`, audit. Aucun appel externe. |
| `annulerJob` | `studio.generate` | `cancel_requested` par compare-and-set ; le worker fait le reste. Aucun remboursement promis. Idempotente. |
| `etatJob` | `studio.read` | Lecture PURE, par id ou par la clé du clic. |
| `accepterMedia` / `rejeterMedia` | `studio.propose` | Statut qualité seul (`relecteur`), sur un job `completed`. Aucun coût. |

Erreurs : le contrat commun de `erreurs.ts`. Hors portée ⇒ `NOT_FOUND` neutre. Même clé et autres entrées, devis déjà
approuvé, prix ou entrées changés, projet modifié ⇒ `VERSION_CONFLICT`. Devis expiré ou grille révoquée ⇒
`QUOTE_EXPIRED`. Solde ou plafond dollars insuffisant ⇒ `BUDGET_EXCEEDED`. Opération sans tarif, release révoquée ⇒
`UNSUPPORTED_CAPABILITY`.

## 3. Décisions et pourquoi

**File : PostgreSQL, pas BullMQ.** Redis est bien présent (`docker-compose.yml`, service `redis`, sans persistance AOF
configurée) et BullMQ déclare une file `generate` sans consommateur (L0-A §5). Mais la vérité financière
(approbation, réserve, job, outbox) s'écrit dans UNE transaction Postgres ; une seconde copie de l'état dans Redis
pourrait diverger sans se réconcilier avec le registre. `studio_jobs` porte déjà bail, propriétaire, battement et
`row_version` (L1). Réclamation : `FOR UPDATE SKIP LOCKED` + compare-and-set ; un job n'est réclamé que si sa réserve
existe. Pas de Redis nouveau. L'outbox est relayée par le worker (`relayerOutbox`), pour les notifications.

**Aucune migration.** Les tables L1 suffisent : unicités `studio_jobs (workspace_id, idempotency_key)`,
`studio_jobs.approval_id`, `studio_approvals.quote_id`, `studio_budget_ledger.ref`, déclencheurs d'ajout seul et de
consommation unique. La déduplication des webhooks repose sur la machine d'états et la référence unique de règlement,
pas sur une table d'événements (voir §6).

**Prix dérivés, jamais inventés.** Image clé et fiche d'identité = `CREDIT_COSTS.image`, clip = `CREDIT_COSTS.video` ;
plafonds fournisseur = `FIXED_COSTS` en micro-dollars entiers. `PRICING_VERSION` est l'empreinte de la grille dérivée.
La voix n'a aucun tarif dans l'offre : devis refusé (`UNSUPPORTED_CAPABILITY`), lot bloqué pour preuve réelle. Les nœuds
de calcul (composition, montage, export) sont « inclus » à 0 crédit mais restent à approuver.

**Validité d'un devis : 30 minutes** (bornée 1 min à 24 h). Choix de politique, pas une mesure : assez pour relire et
cliquer, assez court pour que la grille courante s'applique vite. Une nouvelle grille ou release NE périme PAS un devis
valide (épinglé) ; seule une révocation explicite le bloque, avec motif.

**Raccord des crédits sans double comptage.** Le produit débite avant le travail et rend le non-produit (`ads.ts`,
`video.ts`). L3 garde cette politique : le débit de `workspaces.credits_balance` a lieu à l'approbation (même
transaction que la réserve) ; le règlement (`settle`) n'y touche pas ; la libération (`release`) recrédite le solde,
avec la même référence dans `credit_ledger.ref_id`. Crédits réglés = prix devisé des sorties LIVRÉES ; dollars réglés
= coût rapporté par le fournisseur (borné au plafond devisé). Compte illimité (fondateur, équipe) : réserve à 0 crédit,
dollars réservés quand même. Échec facturé sans livrable : crédits rendus au client, dollars réglés.

**Variante volontaire.** `creerDevis({ variante: true })` refait des sorties déjà livrées : nouveau devis, nouvelle clé,
nouveau job. Par défaut, le plan réutilise ce qui existe (sorties livrées par un job `completed` de la version).

**Release épinglée.** Pointeur de la marque, sinon de l'espace, sinon de la plateforme, puis `epinglerAuDevis` (noyau
L2). Aucun pointeur ⇒ `prompt_release_id = null`, aucun repli inventé. L'instantané du job garde `{ promptReleaseId,
releaseHash }`. La révocation est lue dans `studio_prompt_releases.evaluation.revocation.motif` faute de colonne
dédiée (besoin L2, §8).

**Plafond dollars.** L'action lit `spendStatus()` (barrière existante, non modifiée) et refuse un devis dont le plafond
fournisseur dépasse le reste. Une reconnexion avec la même clé retrouve son job AVANT ce contrôle (pas de faux refus).

## 4. Worker (plan 06 §4 et §8)

| Étape | Règle |
| --- | --- |
| `queued → claimed` | Réserve existante exigée, `SKIP LOCKED`, compare-and-set, tentative `n` créée dans la même transaction. |
| `claimed → running` | Clé fournisseur `tt-studio-<jobId>` écrite sur la tentative DANS la transaction de `running`, AVANT l'appel. Une par job. |
| soumission | Succès ⇒ `provider_request_id` enregistré. Refus certain ⇒ `failed`, tout rendu. Réponse incertaine ⇒ recherche par clé si le fournisseur sait, sinon `reconciliation_required`. |
| bail expiré | `claimed` (aucune clé) ⇒ `queued`, tentative `abandoned`. `running` avec requête ⇒ reprise du suivi. `running` sans requête ⇒ recherche par clé ou réconciliation. Jamais de resoumission. |
| `running → persisting` | Statut fournisseur `reussi` (sondage, webhook ou réconciliation). |
| `persisting → completed` | Téléchargement, premier filtre pur (structure plausible, `inspecterMedia`), DÉCODAGE RÉEL (`DecodeurMedia`, pixels complets aux dimensions de l'en-tête), dépôt, RELECTURE (sha256 identique), `studio_assets` stocké et relié, règlement, contrôle qualité automatique. Échec de stockage ou décodeur indisponible ⇒ reste `persisting` (`PERSISTENCE_FAILED`), seule la finalisation est rejouée. Fichier refusé ⇒ retéléchargé 3 fois au plus puis `failed` sans débit (§5 bis). |
| annulation | Rien parti ⇒ `cancelled`, tout rendu. Requête en cours ⇒ annulation distante puis statut : sans frais ⇒ `cancelled` ; résultat arrivé ⇒ conservé (`annulationDemandee`), réglé, non appliqué. |
| réconciliation | `reconciliation_required → persisting/failed/cancelled` par l'acteur `reconciliateur`, sur preuve fournisseur (identifiant, clé, ou webhook portant la clé). Aucune soumission. |
| webhooks | `x-studio-signature: v1=<HMAC-SHA256(secret, "<horodatage>.<corps>")>`, `x-studio-timestamp`, fenêtre ±300 s, comparaison à temps constant. Le statut AUTORITAIRE est relu chez le fournisseur ; doublons et désordre sont absorbés par la machine d'états et la référence unique de règlement. |
| qualité | Un constat négatif ⇒ `requires_review` (acteur `controle`). Jamais de relance payante. |

Le worker studio NE DÉMARRE PAS sans fournisseur réel : aucun n'est branché (lots L5/L6). Les jobs approuvés restent
`queued`, réserve intacte, rien facturé.

## 5. Preuves

Tests (résultat lu en base) :

| Recette | Garde | Ce qui est compté |
| --- | --- | --- |
| COST-01 | `l3-commandes` (pglite, `Promise.all`), `l3-concurrence-pg` (Postgres réel, deux connexions, 10 manches) | 1 job, 1 approbation, 1 réserve, 1 débit `ref_id`, puis 1 règlement |
| COST-02 | `l3-commandes` | 2 devis, 2 jobs, 2 réserves ; même devis approuvé deux fois refusé |
| COST-03 | `l3-concurrence-pg` (deux sessions Postgres distinctes, `pg_backend_pid` différents, 25 manches) | 1 réservation, 1 refus `BUDGET_EXCEEDED`, solde 0, jamais négatif |
| COST-04 | `l3-commandes`, `l3-devis` | brief modifié, prix, empreinte, expiration ⇒ refus, rien écrit ; nouveau devis accepté |
| COST-05 | `l3-commandes` | estimer + devis (ligne incluse comprise) : 0 job, 0 approbation, 0 registre, solde et médias intacts |
| COST-06 | `l3-worker`, banc | tentatives `[1 A abandoned, 2 B succeeded]`, 1 requête, 1 réserve, 1 règlement ; le worker « ressuscité » est refusé par compare-and-set |
| COST-07 | `l3-worker`, banc | réponse perdue : requête retrouvée par clé (1 requête) ; sans recherche : `reconciliation_required`, 0 resoumission, 0 remboursement annoncé, puis webhook signé ⇒ `completed` ; reprise du suivi par un autre worker |
| COST-08 | `l3-worker` | succès ×2 en parallèle, progrès en retard, succès rejoué, échec contradictoire : `completed`, 1 règlement, 1 média ; signature fausse, rejeu ancien, corps illisible refusés |
| COST-09 | `l3-worker`, banc | avant démarrage : 0 soumission, `cancelled`, `release` = réserve ; après : sans frais ⇒ rendu ; trop tard ⇒ résultat conservé, réglé, 0 remboursement |
| COST-10 | `l3-worker`, banc | `completed` + `requires_review`, 1 requête, 1 job pour le devis ; rejet sans écriture au registre |
| COST-11 | `l3-worker`, banc | stockage indisponible ou acquittant sans conserver : `persisting`, 0 média, 0 règlement ; reprise par un autre worker : `completed`, toujours 1 requête |
| COST-12 | `l3-attribution` | lignes incluse + payante (A1), incluse seule (A2) : chaque ligne du registre porte espace/marque/projet/job/devis, release épinglée sur devis et job, 1 seul débit, solde −4 |
| VIDEO-13 (préparé) | `l3-commandes` | navigateur fermé : `etatJob({ idempotencyKey })` rend le même job, progrès 50, aucun nouveau débit |

Banc Postgres réel (`L3_PG_URL=postgres://postgres@127.0.0.1:5433/tiktrends_l3 L3_BANC_JOURNAL=… pnpm exec vitest run
test/l3-concurrence-pg.test.ts` depuis `apps/web`) : deux workers sur deux connexions, sept scénarios (nominal, crash
avant soumission, réponse perdue, annulé avant, annulé après, produit faux, stockage), journal JSON de 61 lignes
(transitions, registre, appels fournisseur). Sommes vérifiées par scénario (réserve = règlement + libération, en
crédits et en micro-dollars ; variation du solde = somme des lignes `credit_ledger` studio) et sur la base entière
après la campagne : 54 réserves = 54 règlements ; 216 crédits réservés = 68 réglés + 148 rendus ; 4 320 000 µ$ =
663 000 + 3 657 000 ; 6 requêtes fournisseur pour 6 jobs partis, 0 pour l'annulé avant démarrage.

Mutations (chaque garde cassée volontairement, échec constaté, code restauré) :

| Mutation | Garde | Phrase d'échec |
| --- | --- | --- |
| Crédits : ancien débit hors transaction | `l3-credits` | `débit sans ligne de registre: expected 4 to be 6` |
| Débit sans condition de solde | `l3-concurrence-pg` COST-03 | `manche 0: expected { ok: 2, refus: +0, solde: -4, …}` |
| Débit lecture-puis-écriture | `l3-concurrence-pg` COST-03 | `manche 0: expected { ok: 2, refus: +0, solde: +0, …}` (réservation perdue) |
| Reprise sur violation d'unicité retirée | `l3-concurrence-pg` COST-01 | `[…{"ok":false,"code":"PERSISTENCE_FAILED"…}]: expected false to be true` |
| Relecture par clé dans la transaction retirée | `l3-commandes` COST-01 | `[…"Ce devis a déjà été approuvé"…]: expected false to be true` |
| Relecture par clé avant la transaction retirée | `l3-commandes` reconnexion | `expected false to deeply equal [ …(2) ]` |
| Déduplication par empreinte au lieu de la clé | `l3-commandes` COST-02 | `expected false to be true` |
| Version / prix / expiration non vérifiés | `l3-commandes` COST-04 | `expected false to deeply equal [ 'VERSION_CONFLICT', …(1) ]` / `expected false to be 'QUOTE_EXPIRED'` |
| Le devis débite | `l3-commandes` COST-05 | `expected { jobs: +0, approbations: +0, …(5) } to deeply equal …` |
| Bail expiré avant soumission ⇒ réconciliation | `l3-worker` COST-06 | `expected [ [ 1, 'worker-A', 'succeeded' ] ] to deeply equal [ Array(2) ]` |
| Bail d'autrui pris sans compare-and-set | `l3-worker` COST-06 | `expected true to be false` |
| Réclamation sans réserve | `studios-moteur` | `expected { …(27) } to be null` |
| Réclamation sans SKIP LOCKED ni CAS | `l3-concurrence-pg` | `expected 2 to be 8` / `expected [ 18, 18 ] to deeply equal [ 6, 6 ]` |
| Resoumission aveugle après réponse perdue | `l3-worker` COST-07 | `expected [ 2, 2 ] to deeply equal [ 1, 1 ]` |
| Soumission possible ⇒ remise en file | `l3-worker` COST-07 | `job · transition running → queued interdite` |
| Signature non vérifiée / fenêtre retirée | `l3-worker` COST-08 | `expected 200 to be 401` / `expected { status: 200, action: 'persister' } to deeply equal { status: 401, …}` |
| Transition sans compare-and-set | `l3-worker` COST-08 | `duplicate key value violates unique constraint "studio_assets_storage_uq"` |
| Annulé avant démarrage facturé | `l3-worker` COST-09 | `expected [ [ 'release', +0 ], …(2) ] to deeply equal [ [ 'release', 4 ], …(2) ]` |
| Annulation distante jamais envoyée | `l3-worker` COST-09 | `expected 'cancel_requested' to be 'cancelled'` |
| Constat qualité ignoré | `l3-worker` COST-10 | `expected 'pending' to be 'requires_review'` |
| Completed sans fichier / sans relecture | `l3-worker` COST-11 | `expected 'completed' to be 'persisting'` |
| Réserve sans marque ni projet | `l3-attribution` COST-12 | `expected { …(5) } to deeply equal { …(5) }` |
| Ligne incluse débitée | `l3-attribution` COST-12 | `expected 5 to be 4` |
| Épinglage ignoré | `l3-attribution` | `expected null to be '<release>'` |
| `etatJob` par clé ignoré | `l3-commandes` reprise | `expected false to be '<job>'` |
| Accepter débite | `l3-commandes` qualité | `expected { jobs: 1, approbations: 1, …(5) } to deeply equal …` |
| Vue : remboursement promis pendant l'annulation | `l3-deroulement` | `expected 'Annulation demandée · tes crédits ser…' to match /peut encore facturer/` |
| Succès en `persisting` ré-appliqué | `l3-deroulement` | `persisting/succeeded: expected 'persister' to be 'ignorer'` |
| Échec facturé au client | `l3-deroulement` | `expected { settle: { credits: 4, …} } to deeply equal { settle: { credits: +0, …} }` |
| Voix tarifée au prix image | `l3-devis` | `expected { ok: true, …(3) } to match object { ok: false, …(2) }` |
| En-tête PNG non vérifié | `l3-deroulement` | `expected { Object (mime, largeur, ...) } to be null` |
| Fenêtre anti-rejeu ouverte | `l3-deroulement` | `expected 'ok' to be 'trop_ancien'` |

Le premier passage a laissé TROIS mutations au vert (relecture par clé avant la transaction, bail volé, dépôt non
relu) : les gardes ont été renforcées (reconnexion avec plafond atteint, `etape` dirigée sur un bail valide, stockage
qui acquitte sans conserver), puis les trois mutations sont tombées.

## 5 bis. Contre-recette du 8 octobre · P1 décodabilité média

**Constat reproduit avant correction** (`a8b98b2`). Noyau : le MP4 de 88 octets de la recette (ftyp 24 + moov 24 à
zéro + mdat 40 à zéro, sha256 `7b8ce73e…`) ⇒ `inspecterMedia` = `{"mime":"video/mp4"}`, `etatFichierMedia` =
`complet`. Worker : la garde `l3-decodage` rejouée sur l'ancien moteur tombe sur 7 cas sur 9, dont le MP4 de 88 octets,
le PNG à IDAT corrompu (CRC recalculés) et le JPEG au scan coupé : `un média non décodé a terminé le job: expected
'completed' to be 'persisting'` · l'ancien worker les livrait, les reliait et les réglait.

**Ce qui est tranché.**

- Le noyau ne décode rien et ne dit plus « décodable » : `inspecterMedia` / `etatFichierMedia` rendent une
  **structure plausible**. MP4 : piste `trak/mdia/hdlr` de type `vide`, `stsd` non vide (VisualSampleEntry aux
  dimensions non nulles), `stsz`/`stz2` > 0, décalages `stco`/`co64` tous dans un `mdat`, échantillons qui tiennent
  dans les données. Un MP4 fragmenté (échantillons dans `moof`) est refusé par ce filtre : aucune sortie de ce type
  n'est attendue, et aucune vidéo n'est livrable de toute façon (ci-dessous).
- Le worker exige un **décodage réel** : `MoteurStudio` refuse de se construire sans `DecodeurMedia`. Production :
  `DecodeurSharp` (`apps/workers/src/studios/decodeur.ts`), `sharp(o, { failOn: 'warning' }).raw().toBuffer()`,
  verdict pur `verdictDecodage` (pixels = largeur × hauteur × canaux, dimensions = en-tête). `sharp 0.34.5` ajouté à
  `apps/workers` : même version et même paquet que `apps/web` (lockfile : 3 lignes, `pnpm install --offline
  --lockfile-only`).
- Fichier refusé (structure ou décodage) : `persisting`, rien déposé, relié ni réglé ; retéléchargé
  `TELECHARGEMENTS_MEDIA_MAX` = 3 fois au plus (politique, pas une mesure : un transfert coupé se rattrape au deuxième
  essai, un fichier abîmé à la source reste abîmé), puis `failed` `facture_sans_livrable` : crédits rendus au client,
  coût fournisseur réglé. Décodeur indisponible (binaire absent) : attente, rien n'est compté.
- **Vidéo** : aucun décodeur (ni ffmpeg ni ffprobe, dans le worker ni sur la machine). Une sortie vidéo est refusée
  comme **non vérifiable** (motif écrit, jamais « lisible ») et une opération d'animation n'est **jamais soumise**
  (`failed` `echec_sans_frais` avant soumission, 0 $, réserve rendue). Point d'injection :
  `new DecodeurSharp({ video })`. **Aucune vraie vidéo positive n'est prouvée** : le MP4 « plausible » des tests est
  fabriqué (données à zéro) et nommé comme tel.

**Preuves au résultat** (`l3-decodage` site + worker complet sur pglite ; `studios-moteur`, `studios-decodeur` worker ;
`l3-media-complet` noyau) :

| Cas | Résultat compté |
| --- | --- |
| MP4 de 88 octets | noyau `null` / `incomplet` ; worker `persisting` (`PERSISTENCE_FAILED`, 0 média, 0 dépôt, 0 règlement) puis `failed`, 3 téléchargements, `settle` = 0 crédit, solde rendu |
| 8 variantes MP4 (sans trak, `soun`, `stsd` vide, 0 échantillon, dimensions nulles, décalage hors `mdat`, données trop courtes, octets parasites) | noyau `null` |
| PNG à IDAT corrompu, CRC recalculés (réel sharp et simulé) | structure plausible au noyau ; décodeur `cause: contenu` ; worker idem MP4 |
| JPEG au scan coupé, EOI conservé | structure plausible au noyau ; décodeur `Corrupt JPEG data: premature end of data segment` ; worker idem MP4 |
| PNG, JPEG, WebP réels (sharp, 32×24) | pixels complets ; worker `completed`, 1 média 32×24, 1 règlement, 1 téléchargement |
| MP4 à structure plausible | worker `failed`, motif `video/mp4 non vérifiable · aucun décodeur vidéo dans le worker`, 0 média |
| Opération `clip:` | 0 soumission, `failed` `echec_sans_frais`, `settle` 0 crédit 0 µ$ |
| Décodeur indisponible | `persisting` sans compteur, puis `completed` quand il revient |

Limite assumée : un flux abîmé qui reste syntaxiquement valide (scan JPEG mis à zéro) se décode en pixels faux sans
erreur ; le décodage prouve « lisible », pas « juste ». La justesse reste au contrôle qualité (`requires_review`).

Mutations (chaque garde cassée, échec constaté, code restauré) :

| Mutation | Garde | Phrase d'échec |
| --- | --- | --- |
| Décodeur retiré du moteur | `l3-decodage` | `un média non décodé a terminé le job: expected 'completed' to be 'persisting'` (5 cas) |
| Décodage réduit à l'en-tête (`metadata()`) | `studios-decodeur` / `l3-decodage` | `PNG à pixels illisibles décodé: expected { ok: true, … } to match object { ok: false, cause: 'contenu' }` / `un média non décodé a terminé le job: expected 'completed' to be 'persisting'` |
| Vidéo acceptée sans décodeur | `l3-decodage` | `expected 'completed' to be 'failed'` |
| Animation soumise sans décodeur vidéo | `l3-decodage` | `expected 'completed' to be 'failed'` |
| Filtre MP4 sans exigence de piste | `l3-media-complet` / `l3-decodage` | `MP4 sans piste accepté comme vidéo: expected { mime: 'video/mp4', … } to be null` / `expected 'failed' to be 'persisting'` (le worker le refuse alors comme vidéo non vérifiable : jamais livré) |
| Re-téléchargement sans borne | `l3-decodage` | `expected 'persisting' to be 'failed'` (4 cas) |
| Pixels non comptés | `l3-media-complet` | `expected { livrable: true, largeur: 6, … } to match object { livrable: false, … }` |
| Moteur construit sans décodeur | `studios-moteur` | `expected [Function] to throw an error` |
| Panne du décodeur comptée comme fichier abîmé | `l3-decodage` | `expected 'failed' to be 'persisting'` |

## 6. Reprise après fermeture du navigateur et suivi vidéo historique

Le navigateur doit garder la clé du clic (`idempotencyKey`, à générer côté client au clic et à conserver en `sessionStorage` · aucun écran L3).
À la réouverture : `etatJob({ idempotencyKey })` (ou `{ jobId }`) rend le même job, son progrès et un message sans
promesse ; rejouer `approuverEtMettreEnFile` avec la même clé rend le même job (`deja: true`) sans débit. Le serveur
avance sans onglet ouvert : c'est le worker qui sonde, reçoit les webhooks et finalise.

Plan pour faire passer `app/actions/video.ts` (hors liste L3, NON modifié) sur ce worker :

1. **Démarrage** · `startVideoAction` / `startImageVideoAction` deviennent : `creerDevis` (opération `clip:<shotId>`,
   profil `animation`, prix `CREDIT_COSTS.video` × unités de durée existantes `videoUnits`) puis
   `approuverEtMettreEnFile` avec la clé du clic. Le débit `reserveCredits` direct et la ligne `generations
   status='processing'` disparaissent ; `generations` reste lisible pour l'historique.
2. **Fournisseur** · un adaptateur `FournisseurStudio` fal (et Higgsfield) dans `packages/integrations`, qui appelle
   `falSubmitVideo`/`falGetVideo` SOUS `sousPlafond('fal_video', …)` (la barrière dollars doit être accessible au
   worker, voir §8), transmet la clé idempotente si fal la supporte, sinon `rechercheParCle = false` (réponse perdue ⇒
   réconciliation). Les URL de statut ne viennent JAMAIS du navigateur (ferme le constat L0-A 6, clé fal exfiltrable).
3. **Suivi** · `pollVideoAction` et la boucle client 5 s × 80 de `VideoStudioFull.tsx` sont remplacés par `etatJob`
   (lecture pure) ; le worker sonde. La péremption 15 min (`video.ts:228`) devient une règle du worker :
   `reconciliation_required` après N lectures `inconnu`, jamais un `failed` + remboursement aveugle.
4. **Remboursement** · `failAndRefund` disparaît : le règlement unique (`studio:job:<id>:settle`) et la libération liée
   par `ref_id` le remplacent ; un double onglet ne peut plus rembourser deux fois (contrainte unique, pas lecture puis
   écriture).
5. **Stockage** · la vidéo est copiée dans S3 (`studios/<ws>/<job>/clip_*.mp4`), relue et reliée avant `completed`
   (ferme le constat L0-A 7, sorties fal jamais copiées).
6. **Migration des lignes en cours** · au déploiement, les `generations kind='video' status='processing'` gardent
   l'ancien suivi jusqu'à épuisement (aucune ligne réécrite) ; seuls les nouveaux lancements passent par le worker.
7. **Recette** · VIDEO-13 (recharger pendant l'animation) se prouve alors comme ici : même job, même progrès, aucun
   débit, en rechargeant l'écran sur `etatJob`.

## 7. Limites

- Aucun fournisseur réel branché : le worker ne tourne en production que lorsqu'un adaptateur réel existera.
- Les tests de concurrence réelle (`l3-concurrence-pg`) sont ignorés en CI (pas de Postgres) ; pglite sérialise les
  transactions et ne prouve pas COST-03. Ils se lancent localement avec `L3_PG_URL` (base locale uniquement, refus
  sinon) et réécrivent des lignes immuables : restaurer la base ensuite (`pg_restore --clean`).
- Les tests web importent le moteur du worker par chemin relatif : un cache Turbo local pourrait rejouer
  `@tiktrends/web#test` sans voir une modification du worker (la CI n'a pas de cache partagé). Les tests propres du
  worker (`apps/workers/test`) couvrent son paquet.
- Le webhook n'a pas encore de route HTTP (voir §8) : `MoteurStudio.recevoirWebhook` est prouvé en appel direct.
- Le plafond dollars est contrôlé à l'approbation (barrière globale existante, non par espace) ; la dépense réelle d'un
  futur adaptateur doit passer par `sousPlafond`.
- Pas d'écran : L3 livre commandes et worker ; l'interface (devis affiché, bouton, suivi) appartient aux lots studio.
- Vidéo : aucun décodeur vidéo ⇒ aucune sortie vidéo livrable, aucune animation soumise par le worker. Aucune vraie
  vidéo positive n'est prouvée ici (§5 bis).

## 8. Besoins hors périmètre (l'intégrateur tranche)

1. **Module partagé de crédits** · le worker ne peut pas importer `apps/web/lib/credits.ts` (`server-only`) : le
   recrédit de libération est réécrit dans `apps/workers/src/studios/registre.ts` (même forme, même `ref_id`). À
   déplacer dans un paquet partagé (`packages/db` ou nouveau) pour une seule source.
2. **Barrière dollars accessible au worker** · `sousPlafond` vit dans `apps/web/lib/spend-guard.ts` (agent SEC) ; un
   adaptateur réel exécuté par le worker en aura besoin.
3. **Route webhook** · `app/api/studios/webhook/route.ts` (corps brut + en-têtes vers `recevoirWebhook`) ou un petit
   écouteur HTTP dans le worker ; `STUDIO_WEBHOOK_SECRET` à poser dans `.env.deploy` par le propriétaire.
4. **Révocation de release** · pas de colonne dédiée en L1 ; L3 lit `evaluation.revocation.motif`. L2 serveur doit
   confirmer ou fournir l'emplacement.
5. **Export du noyau L2** · `epinglerAuDevis` est importé par `@tiktrends/core/src/prompts/release` faute d'export dans
   l'index du noyau.
6. **`porteeSql` de `depot.ts`** n'est pas exporté : recopié (4 lignes) dans `commandes.ts`, avec la même double garde.
7. **Fichier de harnais** `apps/web/test/l3-harnais.ts` (hors motif `l3-*.test.ts`), et `apps/workers/package.json` :
   script `test` + dépendances de dev déjà présentes dans le lockfile (`vitest`, `@electric-sql/pglite`, `drizzle-orm`).
8. **Décodeur vidéo** · ffprobe (ou ffmpeg) sur le VPS et dans l'image du worker, décision du propriétaire ; puis un
   `decoderVideo` réel (décodage d'images, pas seulement l'en-tête) injecté dans `DecodeurSharp({ video })`, prouvé
   sur une vraie vidéo positive et sur le MP4 de 88 octets négatif.
9. **Capacité vidéo au devis** · le worker refuse les animations, mais `creerDevis` (`tarifs.ts`, `commandes.ts`,
   hors liste) les devise encore : l'utilisateur verrait un devis puis un échec sans frais. À bloquer au devis
   (`UNSUPPORTED_CAPABILITY`) tant qu'aucun décodeur vidéo n'est déclaré.
10. **COST-01 Postgres réel intermittent** · `l3-concurrence-pg` (double clic même clé sur deux connexions) rend parfois
   `VERSION_CONFLICT « Ce devis a déjà été approuvé »` au second clic au lieu du même job (1 échec sur 2 passages sur
   `a8b98b2`, 1 sur 7 après correction) : un seul job et un seul débit, mais pas la réponse idempotente promise. Hors
   liste (`commandes.ts`).
