# L1 · Modèle canonique des studios

Lot L1 (fondations) du chantier Studios v1.0. Base : `main` `bc33cec8`. Chemins relatifs à `product/`.
Ce document dit **où vit chaque objet logique du cahier** (01 §7) et **pourquoi**. Il ne décrit aucun état
de production : pour savoir si la migration est appliquée, compter les migrations en base et les comparer à
`packages/db/drizzle/meta/_journal.json` (CLAUDE.md).

## 1. Ce que L1 livre

| Livrable | Où |
| --- | --- |
| Migration additive (21 tables `studio_`, 2 unicités composites sur l'existant, 4 fonctions, 11 déclencheurs) | `packages/db/drizzle/0054_studios_fondations.sql`, snapshot `meta/0054_snapshot.json` |
| Schéma drizzle (ajouts seulement) | `packages/db/src/schema.ts`, bloc « STUDIOS v1.0 · L1 » |
| Compte de migrations | `packages/db/src/journal.ts` · `MIGRATIONS_IN_BUILD = 55` |
| Noyau pur | `packages/core/src/studios/{erreurs,permissions,portee,version,document,patch,machines,impact}.ts` |
| Serveur | `apps/web/lib/studios/{garde,depot,audit}.ts` |
| Actions | `apps/web/app/actions/studios/projets.ts` |
| Tests | `packages/core/test/studios-*.test.ts`, `apps/web/test/studios-{isolation-db,garde,immutabilite-db,conflit-version}.test.ts` |

Aucune UI, aucun appel IA, aucune dépense.

## 2. Mapping objet logique → table

| Objet logique (cahier) | Table | Existant réutilisé | Justification |
| --- | --- | --- | --- |
| CreativeProject | `studio_projects` | `brands` (portée), `workspaces` | Aucun équivalent (L0-B §1.3). `generations` n'a ni espace, ni auteur, ni parent en colonne, et son `input_json` est muté en place : on ne bâtit pas un historique fiable dessus. |
| ProjectVersion | `studio_project_versions` | patron des connaissances (version, concurrence optimiste) | Immuable par déclencheur. Contenu = `{brief, productRef, styleRef, characterRefs, shots, document, timeline}`. `workspace_id`/`brand_id` dénormalisés et liés au projet par clé composite. |
| Positions du canvas | `studio_layouts` | aucun | Séparées des données : déplacer une carte ne crée pas de version et ne change pas l'ordre des plans. |
| Asset | `studio_assets` | `assets` (lecture héritée via `legacy_ref`) | `assets` stocke des data URI et n'a ni sha256, ni MIME réel, ni fps. Les médias anciens seront importés en `origin = legacy` (L9), sans inventer de provenance. |
| ProductReference, SourceReference, Shot, Document, Timeline | `studio_project_versions.content` | `products`, `saved_ads`, `source_ref_json` | Ce sont des parties du dossier versionné : les mettre en tables séparées casserait l'atomicité d'une version. Types et validateurs dans `packages/core/src/studios/document.ts`. Les instantanés produit/source dédiés (épinglage d'image et de faits) restent à L4. |
| Proposal | `studio_proposals` | marqueurs Jarvis, nœuds Adsmap `proposed` (inchangés) | Cible, version de base, `allowed_paths`, `changes`, explication, sources, coûts non exécutoires, état, version appliquée, expiration. |
| ImpactPlan | `studio_impact_plans` | `iterationPlanAction` (calculé, non stocké) | Immuable. Calcul pur : `impact.ts`. |
| Quote | `studio_quotes` | `costFor` (prix affiché) | Immuable. Montants entiers : `maximum_credits` integer, `maximum_usd_micros` bigint. |
| Approval | `studio_approvals` | `ad_fact_validations` (patron signé) | Une par devis (`quote_id` unique), consommée une seule fois (déclencheur), un job par approbation (`studio_jobs.approval_id` unique). |
| Job, Attempt | `studio_jobs`, `studio_job_attempts` | `generations.status/job_id`, `agent_jobs` (dormant, non touché) | États et qualité séparés, idempotence unique par espace, bail, requête fournisseur, parent. |
| Ledger | `studio_budget_ledger` | `credit_ledger`, `ai_spend` (inchangés) | Ajout seul par déclencheur, `ref` unique, entiers. Le solde de crédits reste `workspaces.credits_balance` : L3 décidera du raccord, sans double comptage. |
| Outbox | `studio_outbox` | file BullMQ (worker vide) | Événements créés dans la transaction de commande ; publication par L3. |
| PromptTemplate / Release | `studio_prompt_versions`, `studio_prompt_releases`, `studio_prompt_active`, `studio_prompt_evaluations` | connaissances (`app_settings`, inchangées) | Posé maintenant pour figer les interfaces de L2. Version validée figée, release figée hors statut et évaluation, pointeur actif par portée avec `row_version` (activation et retour arrière atomiques). |
| PromptRun | `studio_prompt_runs` | `adsmap_agent_runs` (dormant, non touché) | Portée obligatoire (espace, marque) ; lecture réservée à `run.inspect_redacted` (plateforme). |
| Variant / TestLink | `studio_variants`, `studio_test_links` | `adsmap_ads` | Variante = un média PRÉCIS (`media_asset_id`) d'une version. Lien variante ↔ ad Adsmap par clé étrangère réelle (fin du double lien jsonb) ; une ad teste une seule variante (`adsmap_ad_id` unique) ; l'ad est du même espace (clé composite). |
| AuditEvent | `studio_audit_events` | `credit_ledger`, `error_log` | Ajout seul. Écrit dans la même transaction que le changement. |
| Restriction de marque | `studio_member_brand_scopes` | `workspace_members` | Optionnelle : aucune ligne = toutes les marques. Aucun droit acquis ne change. |

## 3. Décisions et invariants

**Portée en base, pas seulement dans le code.** `brands (id, workspace_id)` et `adsmap_ads (id, workspace_id)`
reçoivent une unicité composite (sans effet sur les lignes : `id` y est déjà unique). Chaque table studio référence
le COUPLE (marque, espace) et ses enfants référencent le triplet (projet, espace, marque) : la base refuse une marque
d'un autre espace et un enfant rattaché au projet d'une autre marque, quelle que soit l'application.

**Suppression conservatrice.** Espaces, marques, projets, versions : `ON DELETE RESTRICT`. Les tables immuables
refusent de toute façon la suppression. Conséquence voulue : `deleteBrandAction` échouera sur une marque qui porte un
projet studio (au lieu d'effacer un historique). La restriction de marque pointe aussi la marque en `RESTRICT` :
une cascade rendrait « sans restriction », donc toutes marques ouvertes, la personne restreinte à cette seule marque.
Utilisateurs : `RESTRICT` pour les auteurs de lignes immuables, `SET NULL` ailleurs.

**Valeurs fermées en `text` + CHECK, pas en enum Postgres.** `ALTER TYPE … ADD VALUE` ne passe pas dans la
transaction du migrateur ; un CHECK se remplace dans une migration ordinaire.

**Immuabilité par déclencheur.** `studio_refuser_mutation` (versions, devis, plans d'impact, registre, audit ; plus
TRUNCATE sur versions, registre, audit), `studio_colonnes_mobiles(...)` (releases : seuls `status`, `evaluation`,
`updated_at` bougent), `studio_approbation_consommee` (une consommation, puis plus rien), `studio_prompt_version_figee`
(brouillon modifiable ; validée → seulement retirée ; seul un brouillon se supprime). Aucune porte de purge : une
politique de rétention passera par une migration explicite (cahier §12).

**Unicités avec `NULLS NOT DISTINCT`** (Postgres ≥ 15 ; production pg16, pglite 18) pour les prompts de portée
plateforme, sinon deux versions `platform` de même clé coexisteraient.

**Permissions dérivées, sans droit nouveau** (`permissions.ts`). Sources : `canAccess(effectiveAccess(s), studio)`
(rôle Membre et offre Core pour un client, rubrique `studio` pour l'équipe), rôle d'espace, accès total plateforme.

| Permission | Portée | Accordée à |
| --- | --- | --- |
| `studio.read` (ajout L1) | espace | studio ouvert (même règle que les pages `/studio/*`) |
| `studio.propose`, `studio.generate`, `studio.export` | espace | studio ouvert ET rôle d'espace ≥ Membre (un `client_viewer` ne génère jamais, même membre d'équipe) |
| `prompt.*`, `provider.configure`, `run.inspect_redacted`, `knowledge.manage` | plateforme | accès total plateforme seulement (adminplus, admin d'équipe), comme `/admin/connaissances` |

Aucune permission de portée espace sur prompts, fournisseurs, traces ou connaissances n'est accordée à un owner ou
admin d'espace : ce droit n'existe pas aujourd'hui. Les personnalisations d'espace du cahier (8.1) demandent une
décision de Kevin et s'ajouteront dans ce seul module.

**Refus : 404 neutre contre 403.** Hors portée (autre espace, marque restreinte, identifiant inconnu ou mal formé) :
`NOT_FOUND`, message et cibles forcés au neutre par `erreurStudio`. Geste non permis sur sa propre portée :
`FORBIDDEN`. Pas de session : `AUTH_REQUIRED`. C'est la politique des gardes existants, qui ne confirment jamais
l'existence d'un objet d'un autre espace.

**Double garde de portée** (`depot.ts`). Chaque requête filtre `workspace_id` ET `brand_id IN (marques visibles)` ;
chaque ligne revenue est revérifiée par la règle pure `objetDansPortee`. Un test isole chacune des deux.

**Versions.** `enregistrerDocument` exige `baseVersionId`, verrouille la ligne projet (`FOR UPDATE`), compare la base
à la version courante : différente → 409 `VERSION_CONFLICT` avec le diff base → courante, rien n'est écrit. Sinon le
patch est appliqué (chemins = les sept clés du contenu, définis côté serveur, jamais lus du client), le résultat
validé, haché ; contenu identique → aucune version. Nouvelle version `n+1`, parent = courante, puis compare-and-set
sur `row_version` et audit, dans une transaction.

**Patches** (`patch.ts`). JSON Pointer RFC 6901 ; `__proto__`, `constructor`, `prototype` refusés (chemin et clés de
valeur) ; aucun indice positionnel (`/0`, `/-`) : les collections sont indexées par identifiant stable, un
identifiant purement numérique est refusé ; `remove` ⇒ `newValue: null` ; `replace` null = valeur ; `add` crée,
`replace`/`remove` visent l'existant ; tout ou rien ; vérification indépendante que tout champ hors `allowedPaths`
est resté égal.

**Empreintes** (`version.ts`). JSON canonique (clés triées, valeurs hors JSON refusées) + SHA-256 pur et synchrone
(le noyau n'avait aucun hachage ; `crypto.subtle` est asynchrone). Éprouvé contre `node:crypto`.

**Impacts** (`impact.ts`). Graphe de sorties dont chaque nœud hache ce qu'il lit. La table du cahier §10 en découle :
texte écran → composition/montage/export sans image ; tenue → fiche, images et clips des seuls plans qui la citent ;
ordre → montage, mix, sous-titres, export, rien de généré ; musique → mix, export ; narration → voix (clip seulement
en lipsync). Le prompt actif n'entre pas dans le contenu : il n'affecte que les nouveaux devis.

**Machines** (`machines.ts`). Table 06 §4 avec l'acteur autorisé par transition ; états terminaux finaux (un nouvel
essai = un nouveau job) ; `reconciliation_required` ne repart jamais en `running` ; qualité séparée, mobile seulement
sur un job `completed`.

**Document et timeline** (`document.ts`). Calques typés image/texte/forme/logo, pixels du document source, origine
haut gauche, degrés, `z` entier unique, masque `grayscale8` aux dimensions exactes de la source ; timeline en ticks
entiers (`timebase`), fps rationnel, conversion en frame exacte (BigInt).

## 4. Preuves

Migration : appliquée sur une base vide à 54 migrations restaurée (`base-vide-54.dump`), instruction par
instruction (`psql -v ON_ERROR_STOP=1`), puis rejouée sur la même base : code de sortie 0 les deux fois, zéro erreur,
mêmes comptes (90 tables dont 21 `studio_`, 11 déclencheurs, 4 fonctions, 176 contraintes studio, 59 index studio,
2 unicités composites). Les déclencheurs sont éprouvés sur pglite (tests) et sur le Postgres 16 local.

Gardes et mutations (chaque garde a été cassée volontairement, a échoué, puis le code a été restauré) :

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| Filtre SQL de portée → `true` | `studios-isolation-db` | `expected [ 'Projet A1', 'Projet A2' ] to deeply equal [ 'Projet A1' ]` |
| Revérification pure neutralisée | `studios-isolation-db` | `la revérification pure doit refuser malgré un filtre SQL élargi` |
| Restriction de marque ignorée | `studios-portee`, `studios-isolation-db` | `SEC-02 · restreint à la marque A…` / réponse `{"ok":true,…"title":"Projet A2"…}` |
| Lecteur autorisé à générer | `studios-permissions`, `studios-garde` | `lecteur autorisé à agir : [{"roleEspace":"client_viewer",…}]` |
| Owner/admin d'espace promu plateforme | `studios-permissions`, `studios-garde` | `permission plateforme hors accès total : […]` / `owner: expected [ 'prompt.read', … ] to deeply equal []` |
| Garde sans contrôle de permission | `studios-garde` | `expected false to be 'FORBIDDEN'` |
| Déclencheur versions / registre / audit retiré | `studios-immutabilite-db` | `promise resolved "{ rows: [] … }" instead of rejecting` |
| Base périmée acceptée | `studios-conflit-version` | `onglet 2 · base périmée → 409 …` : `expected true to be false` |
| Indice positionnel, `__proto__`, `allowedPaths` ignoré, `remove` avec valeur | `studios-patch` | `patch accepté à tort : [{"op":"add","path":"/brief/constructor",…}]` (etc.) |
| Texte écran dans l'image clé | `studios-impact` | `un changement de texte écran a déclenché une génération` |
| Identités appliquées à tous les plans | `studios-impact` | `expected [ 'clip:s_fin', …(6) ] to deeply equal [ 'clip:s_ouverture', …(2) ]` |
| Ordre des plans dans l'image clé | `studios-impact` | `réordonner a déclenché une génération` |
| `NOT_FOUND` non neutre | `studios-portee` | `expected [ 'projet_secret' ] to deeply equal []` |
| Constante SHA-256 faussée, clés non triées | `studios-version` | vecteur FIPS / `l'ordre d'insertion des clés ne change pas l'empreinte` |

## 5. Ce qui reste aux lots suivants

- **L2** : import du pack en `draft` (idempotent par clé/version/hash), validation, releases, activation par
  compare-and-set sur `studio_prompt_active`, résolveur unique, écriture des `studio_prompt_runs`.
- **L3** : `createQuote`, `approveAndEnqueue` (transaction approbation + réserve + job + outbox), worker à bail sur
  `studio_jobs` avec `transitionJob`, réconciliation, raccord du registre avec `workspaces.credits_balance` et
  `ai_spend`.
- **L4** : `ContextResolver`, instantanés produit/source épinglés, liens Veille → projet → test via
  `studio_variants`/`studio_test_links`.
- **Hors périmètre L1, à arbitrer** : archivage d'une marque qui porte des projets studio (aujourd'hui, la
  suppression est refusée par la base) ; personnalisations de prompts par espace (droit à créer, décision Kevin) ;
  écran d'administration des restrictions de marque.
