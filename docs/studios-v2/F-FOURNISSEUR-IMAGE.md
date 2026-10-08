# F-A · Fournisseur image réel (fal) branché au moteur, barrière de dépense dans le worker

Lot F-A du chantier Studios v1.0 (vague 5). Base : `claude/studios-base-vague5` (`ad883e7`). Chemins relatifs à `product/`.
Ce document dit **ce qui est tranché, pourquoi, et comment le vérifier**. Il ne décrit aucun état de production : pour
savoir si le worker studio tourne, lire son journal au démarrage (`[studios] worker studio démarré …` ou la raison du
refus). Aucune migration, aucun appel réseau réel, aucune dépense : 0 $. Tout est prouvé contre un `fetch` INJECTÉ.

## 1. Ce que le lot livre

| Livrable | Où |
| --- | --- |
| Règles pures · plafond du worker, coût d'une soumission, ligne `ai_spend` dérivée du job | `packages/core/src/studios/fournisseurs/plafond.ts` |
| Règles pures · paramètres natifs fal (instantané → corps du modèle routé, médias autorisés, empreinte expurgée) | `packages/core/src/studios/fournisseurs/fal-image.ts` |
| Règles pures · lecture de la file fal (certain / incertain, statut, résultat, hôtes de sortie) | `packages/core/src/studios/fournisseurs/fal-file.ts` |
| Règles pures · choix du fournisseur, recul du sondage | `packages/core/src/studios/fournisseurs/choix.ts` |
| Export du noyau | une ligne en fin de `packages/core/src/index.ts` |
| Barrière de dépense hors web (règle) | `packages/integrations/src/plafond-depense.ts` (`BarriereDepenseStudio`, `sousPlafondStudio`) |
| Barrière de dépense hors web (base) | `packages/db/src/plafond-depense.ts` (`reserverDepense`, `annulerDepense`, `depenseDepuis`) + une ligne dans `packages/db/src/index.ts` |
| Adaptateur `FournisseurStudio` fal | `packages/integrations/src/studios-fal.ts` (`FournisseurFal`) + une ligne dans `packages/integrations/src/index.ts` |
| Branchement | `apps/workers/src/studios/fournisseurs.ts`, `startStudioWorker` dans `apps/workers/src/worker.ts` |
| Variables | `product/.env.example` (lignes ajoutées, sans valeur) |
| Tests | `packages/core/test/fa-fournisseur.test.ts`, `packages/integrations/test/fa-studios-fal.test.ts`, `apps/workers/test/fa-worker-fal.test.ts`, `apps/workers/test/fa-plafond-pg.test.ts` (Postgres réel, ignoré sans `FA_PG_URL`), `apps/web/test/fa-plafond-commun.test.ts`, ajouts à `apps/web/test/spend-guard-coverage.test.ts` |

## 2. Décisions et pourquoi

**Barrière du worker : deux modules, une règle.** `spend-guard.ts` (web) est `server-only` et n'est pas modifié. La règle
reste celle du noyau (`checkBudget`), le plafond se lit comme `spendCapUsd()` (`plafondDepenseUsd` : absent ⇒ 50 $,
illisible ou négatif ⇒ 50 $), la fenêtre est de 30 jours glissants sur `ai_spend.actual_usd`. Elle vit dans
`packages/integrations` (qui dépend du noyau) ; l'accès à la table vit dans `packages/db` (qui a le schéma). Aucune
dépendance ajoutée : `db` ne dépend pas du noyau, `integrations` ne dépend pas de la base, d'où le port
(`PortDepense`) que le worker réalise avec `reserverDepense` / `annulerDepense`. Deux écarts voulus, du côté prudent :
réservation sous verrou consultatif de transaction (deux workers ne passent pas le même reste ; prouvé sur Postgres
réel), et une écriture impossible REFUSE la dépense (le web journalise et laisse passer).

**Une ligne `ai_spend` par job, sans colonne.** Son identifiant est dérivé du job (`idDepenseDuJob`, SHA-256 au format
UUID). Une seconde réservation pour le même job retombe sur la même clé : refusée en INCERTAIN (réconciliation, jamais
une seconde soumission, jamais un « certain » qui rendrait la première dépense). Le libellé `action` reste
`studio.generation` (les postes de dépense de Jarvis restent groupés), `model` = `fal_image` comme les lignes fal du web.

**Coût.** `coutSoumissionImage` = nombre d'opérations `image_generation` × `GRILLE_STUDIO.image_generation`
(= `FIXED_COSTS.fal_image`, 0,08 $). Les nœuds `calcul` ne partent pas chez le fournisseur. Animation et voix :
refusées par ce fournisseur (pas de prix inventé). fal ne rapporte pas de coût dans la file : `coutUsdMicros = null`,
le règlement dollars reste borné par la réserve (L3).

**Réservée avant, gardée si incertain, rendue si certain.** `sousPlafondStudio` réserve AVANT le POST. L'appel lève
`ErreurFournisseurCertaine` quand on SAIT que rien n'a été accepté ⇒ `actual_usd = 0` (la ligne reste, l'essai reste
lisible) ; toute autre erreur garde la dépense. Plus tard, un résultat refusé pour une demande malformée (400/422,
famille `requete` de `spend-refund.ts`) rend aussi la dépense ; une annulation n'est jamais dite gratuite (fal ne dit
pas si le calcul avait commencé : le doute se paie, les crédits du client sont rendus quand même).

**Certain ou incertain, selon le statut ET le moment.**

| Moment | Constat | Classement |
| --- | --- | --- |
| Avant l'envoi | préparation refusée, plafond, URL hors liste | certain (rien n'est parti) |
| Avant toute réponse | `ENOTFOUND`, `ECONNREFUSED`, `EAI_AGAIN`, injoignable, certificat | certain |
| Avant toute réponse | `ECONNRESET`, délai, autre | incertain |
| Réponse reçue | 3xx, 4xx, 500, 501, 503, 505 | certain (la file a refusé) |
| Réponse reçue | 502, 504 (intermédiaire qui a pu transmettre) | incertain |
| Après 2xx (acceptée) | corps coupé, illisible, sans `request_id` | incertain |

**`rechercheParCle = false`.** La file fal n'accepte pas de clé d'idempotence et ne retrouve pas une requête par une clé
à nous. Une réponse perdue part donc en `reconciliation_required` (moteur L3), jamais en seconde soumission. La clé du
job est quand même portée par l'identifiant stocké (`<tt-studio-…> <suivi fal>`), ce qui relie la requête au job et à
sa ligne `ai_spend`.

**Webhooks : non utilisés.** La vérification d'une signature de webhook fal exige les clés publiques de fal (réseau) et
une route HTTP que ce lot ne possède pas. Le moteur sait déjà sonder ; l'adaptateur sonde avec RECUL (politique, pas
une mesure : 2 s, doublé à chaque lecture « en cours », plafonné à 15 s, mémoire du processus). Preuve
(`fa-worker-fal`, « sondage avec recul ») : 3 minutes de calcul simulé, 90 tours de boucle à 2 s, le job finit
`completed` au 97ᵉ tour, 1 seule soumission, 15 lectures de statut (borne de la garde : 16). Une erreur passagère (429, 5xx, réseau) laisse le job
`running` et sera relue ; une requête que fal ne connaît pas (404, 410) ou refuse de montrer (401, 403) ⇒ `inconnu`
⇒ réconciliation. `STUDIO_WEBHOOK_SECRET` reste documenté (sans valeur) pour le webhook L3 signé, inutilisé tant
qu'aucune route n'est branchée.

**Paramètres natifs, jamais l'enveloppe.** `requeteFalImage` lit `SnapshotJob.parametres` au schéma `studio_image/1`
(consigne FINALE de `image.compile`, références vues au devis avec version et empreinte, format). Le worker relit
chaque référence dans le catalogue de la MARQUE DU JOB au moment de soumettre (photos produit `pph_`, logos `logo_`,
médias studio `sta_` stockés, bibliothèque `bib_`) ; une source concurrente n'a pas de média transmissible. Absente,
d'une autre marque, modifiée depuis le devis (empreinte), non transmissible (pas https, pas data URI d'image) ⇒
`MISSING_REFERENCE`, tâche bloquée, AUCUNE substitution. Modèle routé : `FAL_IMAGE_MODEL_EDIT` avec références,
`FAL_IMAGE_MODEL` sans (défauts de `falFromEnv`). Le corps suit l'aiguillage de `falGenerateImage` (égalité prouvée sur
5 modèles × 4 formats). Instruction négative : non supportée par ces modèles, intégrée à la consigne, limite conservée.
L'audit `job.provider.payload` garde l'empreinte du corps EXPURGÉ (médias remplacés par identifiant + empreinte),
jamais une adresse ni une data URI.

**Téléchargement.** La référence d'une sortie est son indice (`image:0`), jamais son URL : le résultat est relu chez fal
(avec la clé) à chaque téléchargement. L'adresse doit être `https` sur `fal.media` ou un sous-domaine (jamais une IP,
jamais un port, jamais d'identifiants), publique (`assertPublicUrl` de `safe-fetch.ts`), téléchargée SANS la clé et
sans suivre de redirection, en flux coupé à 64 Mio (la borne de lecture des médias studio, `OCTETS_MAX_MEDIA` : tout
fichier déposé reste relisible par le rendu). Moins d'octets que l'annonce ⇒ incertain (re-téléchargement, le moteur
reste `persisting`). Le type est relu dans les octets (`inspecterMedia`), le type annoncé est ignoré. `safeFetch`
lui-même n'est pas réutilisé : il n'accepte pas de `fetch` injecté et lit le corps entier avant de le borner.

**Branchement.** `decisionFournisseurStudio` : vraie `FAL_KEY` (pas `simule-…`), production OU
`STUDIO_FOURNISSEUR_REEL=autorise`, `S3_*` posés. Sinon `startStudioWorker` ne démarre rien et journalise la raison
(« … · worker studio non démarré, jobs laissés en file, rien facturé. »). Le fournisseur simulé n'est importé ni par
`worker.ts`, ni par `fournisseurs.ts`, ni par `index.ts` (garde de test). Stockage : `putObject` existant, puis
relecture par l'adresse publique du bucket ; le moteur compare l'empreinte relue avant `completed`.

**Plafond atteint ⇒ job `failed`, pas `queued`.** Le moteur L3 a posé `running` et la clé fournisseur avant d'appeler
`soumettre` ; un refus certain y conduit à `failed` + règlement à 0 + crédits rendus, avec la raison du plafond dans
`studio_jobs.error.motif`. Rien n'est parti, rien n'est compté. (L'approbation refuse déjà un devis qui dépasse le
reste ; ce cas est la course entre approbation et exécution.)

## 3. Preuves (résultat lu)

| Recette | Garde | Ce qui est lu |
| --- | --- | --- |
| COST-07 (adaptateur réel) | `fa-worker-fal`, `fa-studios-fal` | `ECONNRESET` après envoi : `reconciliation_required`, tentative `uncertain`, 1 POST après 6 tours, `ai_spend.actual_usd = 0,08` gardé, registre `[reserve]` seul |
| COST-08 (double livraison) | `fa-worker-fal` | deux workers en parallèle sur un résultat prêt : 1 média, 1 `settle`, 1 POST |
| COST-09 | `fa-worker-fal` | avant démarrage : 0 POST, 0 ligne `ai_spend`, `cancelled` ; pendant : PUT `…/cancel` reconstruite, `cancelled`, registre `release/reserve/settle`, dollars gardés |
| COST-11 | `fa-worker-fal`, `fa-studios-fal` | résultat tronqué : `persisting` + `PERSISTENCE_FAILED`, 0 média, registre `[reserve]` ; re-téléchargement ⇒ `completed`, 1 média, toujours 1 POST |
| Nominal | `fa-worker-fal` | transitions `claimed, running, persisting, completed` ; média `stored`, sha256 des octets = relu au stockage, clé `studios/<ws>/<job>/…` ; `ai_spend` 1 ligne 0,08 $ espace du job ; registre `reserve 4/80 000` + `settle 4/80 000` ; tentative `[1, succeeded]` ; audit `job.provider.payload` avec empreinte ; clé fal vers la file seulement, jamais vers l'hôte des médias |
| 5xx avant acceptation | `fa-worker-fal`, `fa-studios-fal` | 503 : `failed`, `ai_spend` 0,08 estimé / 0 réel, `release 4`, solde +4, tentative `failed` |
| Plafond | `fa-worker-fal`, `fa-studios-fal`, `fa-plafond-commun`, `fa-plafond-pg` | 0 appel, `error.motif` « Plafond de dépense atteint… », 0 ligne ; web + worker sur la même base : chacun ferme la porte à l'autre ; 20 réservations simultanées (Postgres réel, pool de connexions) au plafond de 0,40 $ ⇒ exactement 5 |
| SEC-06 | `fa-studios-fal`, `fa-fournisseur` | IP de métadonnées, hôte non fal, sous-domaine piégé, port, identifiants, redirection : refus sans requête vers l'hôte ; 5 000 octets pour une borne de 1 000 : coupé ; type `text/html` annoncé ⇒ `image/png` relu |
| SEC-07 | `fa-studios-fal`, `fa-fournisseur` | la clé n'apparaît dans aucun message (401, 503, coupure, 2xx vide) ni journal ; identifiant de requête forgé vers un autre hôte ⇒ 0 requête |
| SEC-08 | `fa-worker-fal` | photo retirée du catalogue après le devis, ou d'une autre marque du même espace : `failed` `MISSING_REFERENCE`, 0 appel, 0 dépense, audit `job.provider.blocked` |
| PROMPT-04 | `fa-fournisseur`, `fa-worker-fal` | `{{ … }}` dans la consigne, liaison vers une référence non transmise, `parametres: {}` : bloqué, rien complété |

Portes au SHA final : voir le rapport du lot.

## 4. Mutations (cassées volontairement, échec constaté, code restauré)

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| M01 soumission hors barrière | `fa-studios-fal`, `fa-worker-fal`, `spend-guard-coverage` | `expected ErreurFournisseurIncertaine: réponse de f… to be an instance of DepenseRefusee` · `expected [] to deeply equal [ { actual: 0.08, …(4) } ]` · `soumission sans sousPlafondStudio: expected -1 to be greater than -1` |
| M02 dépense jamais rendue sur échec certain | `fa-studios-fal`, `fa-worker-fal` | `expected 0.08 to be +0` |
| M03 dépense rendue même si incertain | `fa-studios-fal`, `fa-worker-fal` | `expected +0 to be 0.08` |
| M04 502/504 classés certains | `fa-fournisseur`, `fa-studios-fal` | `expected ErreurFournisseurCertaine: fal a refusé l… to be an instance of ErreurFournisseurIncertaine` |
| M05 toute erreur réseau certaine | `fa-studios-fal`, `fa-worker-fal` | `expected 'failed' to be 'reconciliation_required'` |
| M06 transfert coupé non vu par l'adaptateur | `fa-studios-fal` | `Error: aucune erreur levée` · **survit** dans `fa-worker-fal` : le moteur relit le fichier (`etatFichierMedia` ⇒ incomplet), double garde |
| M07 hôtes de sortie non filtrés | `fa-fournisseur`, `fa-studios-fal` | `https://evilfal.media/a: expected URL {…} to be null` · `Error: aucune erreur levée` (le premier passage ne testait qu'une IP : garde renforcée) |
| M08 empreinte non comparée | `fa-fournisseur` | `expected { ok: true, …(6) } to match object { ok: false, …(2) }` |
| M09 référence absente ignorée | `fa-fournisseur`, `fa-worker-fal` | `expected 'completed' to be 'failed'` |
| M10 réservation déjà engagée non vue (base) | `fa-plafond-commun` | `expected DepenseRefusee: compteur de dépense injoi… to be an instance of ErreurFournisseurIncertaine` |
| M11 somme sur `estimated_usd` | `fa-plafond-commun` | `expected 0.24 to be close to 0.08` (survivait au premier passage : garde renforcée) |
| M12 défaut du worker à 10 $ | `fa-plafond-commun` | `expected 10 to be 50` |
| M13 réel hors production sans autorisation | `fa-fournisseur`, `fa-worker-fal` | `expected { ok: true, apiKey: 'id:secret', …(2) } to match object { ok: false }` · `expected '[studios] stockage objet illisible · …' to contain 'hors production sans STUDIO_FOURNISSE…'` (survivait au premier passage : refus pour une autre raison) |
| M14 clé de simulation acceptée | `fa-fournisseur`, `fa-worker-fal` | `expected '[studios] stockage objet illisible · …' to contain 'simulation locale'` |
| M15 sondage sans recul | `fa-studios-fal`, `fa-worker-fal` | `expected 2 to be 1` · `expected 90 to be less than or equal to 16` |
| M16 échec non facturé, dépense non rendue | `fa-studios-fal` | `expected 0.08 to be +0` |
| M17 clé dans un message d'erreur | `fa-studios-fal` | `expected 'fal a refusé la demande (HTTP 401) av…' not to contain 'secret-0123456789'` |
| M18 audit avec le corps non expurgé | `fa-worker-fal` | `expected '{"corps":{"prompt":"Lunettes posées s…' not to contain 'data:image'` |
| M19 second POST hors enveloppe | `spend-guard-coverage` | `une seule soumission attendue: expected 2 to be 1` |
| M20 appel payant historique dans le worker | `spend-guard-coverage` | `appelle un moteur payant sans barrière : apps/workers/src/studios/boucle.ts` |
| M21 portée de marque retirée | `fa-worker-fal` | `expected 'completed' to be 'failed'` (survivait au premier passage : cas « autre marque » ajouté) |
| M22 médias pris dans l'instantané au lieu d'être relus | `fa-worker-fal` | `expected 'completed' to be 'failed'` |
| M23 sorties dupliquées | `fa-worker-fal` | `expected 'failed' to be 'completed'` |
| M24 coût inventé (0,04 $) | `fa-fournisseur`, `fa-worker-fal` | `expected { ok: true, usd: 0.04, …(2) } to deeply equal { ok: true, usd: 0.08, …(2) }` |
| M25 clé envoyée à l'hôte des médias | `fa-studios-fal`, `fa-worker-fal` | `expected 'Key cle-fal-de-test:secret-0123456789' to be undefined` |
| M26 type annoncé cru | `fa-studios-fal` | `expected 'text/html' to be 'image/png'` |
| M27 verrou consultatif retiré | `fa-plafond-pg` (Postgres réel) | `expected { passees: 9, appels: 9, …(2) } to deeply equal { passees: 5, appels: 5, …(2) }` (3 manches : 9, 12, 9) |

## 5. Provenance des fixtures

Les réponses rejouées sont écrites à la main d'après la documentation publique de la file fal (« Queue » :
soumission `{request_id, status_url, response_url, cancel_url}`, statuts `IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`,
annulation 202 `CANCELLATION_REQUESTED` / 400 `ALREADY_COMPLETED`) et le schéma de sortie de Nano Banana
(`images: [{url, content_type, file_name, width, height}]`, hôte `v3.fal.media`). Elles n'ont JAMAIS été capturées sur
le service (le proxy de la session bloque fal, 0 $). Les médias sont des PNG décodables générés par `pngSimule`.

## 6. Limites

- **Aucune exécution réelle.** Que fal ACCEPTE ces corps, que les statuts aient exactement cette forme, qu'une requête
  annulée en file ne soit pas facturée : seul un appel réel le dit, et il attend un budget explicite du propriétaire.
- **Les jobs actuels sont bloqués honnêtement.** L'approbation L3 écrit `parametres: {}` : tant qu'elle n'écrit pas la
  consigne compilée (voir §7.1), chaque job image réel finit `failed` avec la raison « la consigne image compilée
  n'est pas dans l'instantané du job », 0 appel, 0 $, crédits rendus.
- **Course web/worker.** La barrière web n'utilise pas le verrou consultatif : une dépense web et une dépense worker
  simultanées peuvent passer le même reste (comme deux dépenses web aujourd'hui). Worker contre worker : sérialisé.
- **Plafond atteint ⇒ `failed`** et non retour en file (le moteur L3 a déjà posé `running`).
- **Recul du sondage en mémoire** : un redémarrage relit tout de suite ; une erreur passagère persistante laisse le job
  `running` sans borne de durée (le moteur n'a pas de compteur de lectures).
- **Sources concurrentes** : sans média transmissible, une liaison vers elles bloque la tâche (pas de média, pas de
  substitution). La consigne doit porter le style en texte.
- **Statut de qualité** : aucun constat produit côté fal (`constat: null`) ⇒ `pending` ; le contrôle visuel reste celui
  de L5-C.

## 7. Besoins hors périmètre (l'intégrateur tranche)

1. **`apps/web/lib/studios/execution/commandes.ts`** (`approuverEtMettreEnFile`) : remplir `snapshot.parametres` avec
   `parametresImageDuDevis({ consigne, references, largeur, hauteur, promptRunId })` (noyau, ce lot) à partir d'une
   compilation `image.compile` acceptée (`compilerConsigneImagePour` rend la consigne finale, la préparation et le
   `runId`, mais rien ne la persiste aujourd'hui : il faut soit la passer au devis, soit la stocker avec la version).
2. **Route webhook** (L3 §8.3) : toujours absente ; fal n'est pas branché en webhook (décision §2).
3. **`safe-fetch.ts`** : un `fetch` injectable et une lecture en flux bornée permettraient de réutiliser `safeFetch`
   tel quel.
4. **`apps/workers/tsconfig.json`** n'inclut pas `test/` : les tests du worker sont vérifiés par vitest, pas par tsc.
