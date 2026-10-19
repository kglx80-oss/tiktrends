-- TikTrends · reset-pilote · remise à ZÉRO du CONTENU MÉTIER d'un pilote.
-- =============================================================================
--
--   ⚠  LE PROPRIÉTAIRE EXÉCUTE CE SCRIPT LUI-MÊME SUR LE VPS.
--      La session Claude n'a pas d'accès SSH et n'exécute JAMAIS ce fichier.
--
--   ⚠  SAUVEGARDER D'ABORD. La toute première étape du README
--      (`reset-pilote.README.md`) est le `pg_dump` horodaté. Sans dump, ce
--      script REFUSE de supprimer quoi que ce soit (barrière `-v sauvegarde=`).
--      Réversible = restaurable depuis ce dump.
--
-- Ce qu'il supprime : les MARQUES ciblées et TOUT leur contenu dépendant
--   (produits, personas, créatives, générations, graphe Adsmap · désirs, angles,
--   concepts, ads, verdicts, lots, éléments · projets Studios, versions,
--   variantes, devis, jobs, médias Studios, liens de test Adsmap, médias de la
--   bibliothèque rattachés à la marque).
--
-- Ce qu'il PRÉSERVE (jamais touché) : le schéma, le modèle de droits / RBAC
--   (workspace_members, platform_staff, platform_role_rights), les comptes
--   utilisateurs, les releases de prompt (studio_prompt_versions / _releases /
--   _active / _evaluations), les réglages (app_settings), le registre de
--   dépense (ai_spend, credit_ledger), et tout ce qui n'est pas rattaché aux
--   marques ciblées.
--
-- ── Paramètres (psql -v), JAMAIS d'ids du banc en dur ────────────────────────
--
--   workspace_id   UUID de l'espace à cibler (facultatif)
--   marques        liste de NOMS de marques séparés par des virgules (facultatif)
--                  ex. -v marques='Neva,Maison Lumière Botanique'
--   sauvegarde     chemin du dump déjà pris (OBLIGATOIRE pour supprimer)
--   confirmer      'oui-vider'  → exécute les DELETE dans la transaction
--   valider        'oui'        → COMMIT ; sinon ROLLBACK (essai transactionnel)
--
--   Au moins un de { workspace_id, marques } est exigé · sinon REFUS (le script
--   ne cible jamais « toutes les marques »).
--
-- ── Déroulé recommandé ───────────────────────────────────────────────────────
--
--   1) ESSAI À BLANC (lecture seule · liste et compte, aucune suppression) :
--        psql "$URL" -v workspace_id=... -v marques='Neva' -f reset-pilote.sql
--   2) ESSAI TRANSACTIONNEL (supprime, montre les comptes, PUIS annule) :
--        psql "$URL" -v workspace_id=... -v marques='Neva' \
--             -v sauvegarde=/chemin/dump.sql.gz -v confirmer=oui-vider -f reset-pilote.sql
--   3) APPLICATION (supprime et VALIDE) : ajoutez -v valider=oui
--
-- =============================================================================

\set ON_ERROR_STOP on

-- Valeurs par défaut (mode essai à blanc si rien n'est fourni).
\if :{?workspace_id} \else \set workspace_id '' \endif
\if :{?marques}      \else \set marques      '' \endif
\if :{?sauvegarde}   \else \set sauvegarde   '' \endif
\if :{?confirmer}    \else \set confirmer    '' \endif
\if :{?valider}      \else \set valider      '' \endif

-- ── Refus si aucun filtre ────────────────────────────────────────────────────
SELECT CASE
  WHEN NULLIF(:'workspace_id','') IS NULL AND NULLIF(:'marques','') IS NULL
  THEN 'off' ELSE 'on' END AS a_un_filtre \gset
\if :a_un_filtre
\else
  \echo '✗ reset-pilote · aucun filtre. Fournissez -v workspace_id=... et/ou -v marques=''Nom A,Nom B''.'
  \echo '  Refus de cibler TOUTES les marques.'
  \quit
\endif

-- ── Cible · marques résolues par espace et/ou par noms (pas d'ids en dur) ────
DROP TABLE IF EXISTS cible_marques;
CREATE TEMP TABLE cible_marques AS
SELECT b.id, b.workspace_id, b.name
FROM brands b
WHERE (NULLIF(:'workspace_id','') IS NULL OR b.workspace_id = :'workspace_id'::uuid)
  AND (NULLIF(:'marques','')      IS NULL OR b.name = ANY (string_to_array(:'marques', ',')));

\echo ''
\echo '── Marques ciblées (essai à blanc) ─────────────────────────────────────────'
SELECT workspace_id, id AS brand_id, name FROM cible_marques ORDER BY workspace_id, name;

\echo ''
\echo '── Lignes qui seraient supprimées, par table ───────────────────────────────'
SELECT t AS "table", n AS "lignes" FROM (
  SELECT 1 ord, 'brands'                  t, count(*) n FROM brands                 WHERE id       IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 2,  'products',                count(*) FROM products                WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 3,  'personas',                count(*) FROM personas                WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 4,  'assets (médias)',         count(*) FROM assets                  WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 5,  'creatives',               count(*) FROM creatives               WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 6,  'generations',             count(*) FROM generations             WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 7,  'adsmap_batches (lots)',   count(*) FROM adsmap_batches          WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 8,  'adsmap_concepts',         count(*) FROM adsmap_concepts c WHERE c.angle_id IN (
                 SELECT a.id FROM adsmap_angles a JOIN adsmap_desires d ON d.id=a.desire_id
                 JOIN personas p ON p.id=d.persona_id WHERE p.brand_id IN (SELECT id FROM cible_marques))
  UNION ALL SELECT 9,  'adsmap_ads',              count(*) FROM adsmap_ads a WHERE a.concept_id IN (
                 SELECT c.id FROM adsmap_concepts c JOIN adsmap_angles an ON an.id=c.angle_id
                 JOIN adsmap_desires d ON d.id=an.desire_id JOIN personas p ON p.id=d.persona_id
                 WHERE p.brand_id IN (SELECT id FROM cible_marques))
  UNION ALL SELECT 10, 'studio_projects',         count(*) FROM studio_projects         WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 11, 'studio_project_versions', count(*) FROM studio_project_versions WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 12, 'studio_variants',         count(*) FROM studio_variants         WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 13, 'studio_assets (médias)',  count(*) FROM studio_assets           WHERE brand_id IN (SELECT id FROM cible_marques)
) q ORDER BY ord;

-- ── Mode essai à blanc : on s'arrête là, rien n'est touché ───────────────────
SELECT CASE WHEN :'confirmer' = 'oui-vider' THEN 'on' ELSE 'off' END AS confirme \gset
\if :confirme
\else
  \echo ''
  \echo 'Mode ESSAI À BLANC · aucune suppression.'
  \echo 'Pour supprimer dans une transaction annulable : -v sauvegarde=<dump> -v confirmer=oui-vider'
  \quit
\endif

-- ── Barrière de sauvegarde · pas de dump ⇒ pas de suppression ────────────────
SELECT CASE WHEN NULLIF(:'sauvegarde','') IS NULL THEN 'off' ELSE 'on' END AS a_sauvegarde \gset
\if :a_sauvegarde
\else
  \echo '✗ reset-pilote · aucune sauvegarde déclarée. Prenez le pg_dump (voir README) puis passez -v sauvegarde=<chemin>.'
  \quit
\endif
\echo ''
\echo 'Sauvegarde déclarée :' :'sauvegarde'

-- =============================================================================
--  SUPPRESSION · dans UNE transaction. Les comptes sont affichés AVANT la
--  décision COMMIT/ROLLBACK · un ROLLBACK est toujours possible si les comptes
--  surprennent (valider≠oui ⇒ ROLLBACK automatique).
-- =============================================================================
BEGIN;

-- Six tables Studios sont « en ajout seul » · un déclencheur BEFORE DELETE y
-- refuse toute suppression (STUDIO_IMMUABLE · versions, plans d'impact, devis,
-- approbations, grand livre de budget, journal d'audit). Ce verrou protège les
-- données VIVES d'une mutation applicative ; il n'est pas fait pour empêcher une
-- remise à zéro délibérée du propriétaire. On neutralise donc ces déclencheurs
-- UTILISATEUR le temps de la suppression ciblée, PUIS on les rétablit. Les
-- déclencheurs système d'intégrité (FK) restent actifs · l'ordre et l'absence
-- d'orphelin sont donc toujours garantis. ALTER TABLE est transactionnel : un
-- ROLLBACK rétablit aussi ces déclencheurs.
ALTER TABLE studio_project_versions DISABLE TRIGGER USER;
ALTER TABLE studio_impact_plans     DISABLE TRIGGER USER;
ALTER TABLE studio_quotes           DISABLE TRIGGER USER;
ALTER TABLE studio_approvals        DISABLE TRIGGER USER;
ALTER TABLE studio_budget_ledger    DISABLE TRIGGER USER;
ALTER TABLE studio_audit_events     DISABLE TRIGGER USER;

-- Boucle de FK · studio_projects.current_version_id pointe une version, et la
-- version pointe le projet. On détache d'abord le pointeur « version courante »
-- pour pouvoir supprimer les versions avant les projets.
UPDATE studio_projects SET current_version_id = NULL WHERE brand_id IN (SELECT id FROM cible_marques);

-- Sous-arbre Studios · FK en ON DELETE RESTRICT, donc supprimé AVANT les marques,
-- des feuilles vers la racine. (Les tables auto-référencées · jobs, variants,
-- assets, versions · se vident en un seul DELETE : la vérification RESTRICT voit
-- les lignes filles déjà retirées dans le même ordre de dépendance.)
DELETE FROM studio_test_links      WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_variants        WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_budget_ledger   WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_prompt_runs     WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_job_attempts    WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_jobs            WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_approvals       WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_quotes          WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_impact_plans    WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_proposals       WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_layouts         WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_audit_events    WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_assets          WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_project_versions WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_projects        WHERE brand_id IN (SELECT id FROM cible_marques);
DELETE FROM studio_member_brand_scopes WHERE brand_id IN (SELECT id FROM cible_marques);

-- Médias de la bibliothèque · assets.brand_id est ON DELETE SET NULL, donc on
-- les supprime EXPLICITEMENT (sinon ils resteraient, orphelins de marque).
DELETE FROM assets WHERE brand_id IN (SELECT id FROM cible_marques);

-- Les marques · la cascade emporte le reste (produits, personas → désirs →
-- angles → concepts → ads → verdicts/éléments/edges/learnings/décisions, lots,
-- offres, pages, créatives → instances → métriques, générations → validations,
-- insights, briefs, reviews, boards, veille, sauvegardes, presets, jarvis…).
DELETE FROM brands WHERE id IN (SELECT id FROM cible_marques);

-- Rétablissement des protections « ajout seul » (même transaction).
ALTER TABLE studio_project_versions ENABLE TRIGGER USER;
ALTER TABLE studio_impact_plans     ENABLE TRIGGER USER;
ALTER TABLE studio_quotes           ENABLE TRIGGER USER;
ALTER TABLE studio_approvals        ENABLE TRIGGER USER;
ALTER TABLE studio_budget_ledger    ENABLE TRIGGER USER;
ALTER TABLE studio_audit_events     ENABLE TRIGGER USER;

\echo ''
\echo '── Après suppression · doit être 0 partout (vérification) ───────────────────'
SELECT t AS "table", n AS "reste" FROM (
  SELECT 1 ord, 'brands'                  t, count(*) n FROM brands                 WHERE id       IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 2,  'products',                count(*) FROM products                WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 3,  'personas',                count(*) FROM personas                WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 4,  'assets (médias)',         count(*) FROM assets                  WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 5,  'creatives',               count(*) FROM creatives               WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 6,  'generations',             count(*) FROM generations             WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 7,  'studio_projects',         count(*) FROM studio_projects         WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 8,  'studio_project_versions', count(*) FROM studio_project_versions WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 9,  'studio_variants',         count(*) FROM studio_variants         WHERE brand_id IN (SELECT id FROM cible_marques)
  UNION ALL SELECT 10, 'studio_assets (médias)',  count(*) FROM studio_assets           WHERE brand_id IN (SELECT id FROM cible_marques)
) q ORDER BY ord;

-- ── Décision · COMMIT seulement si -v valider=oui, sinon ROLLBACK ────────────
SELECT CASE WHEN :'valider' = 'oui' THEN 'on' ELSE 'off' END AS valide \gset
\if :valide
  \echo ''
  \echo '✓ valider=oui · VALIDATION de la suppression.'
  COMMIT;
\else
  \echo ''
  \echo '↩ valider≠oui · ROLLBACK · rien n''a été supprimé (essai transactionnel). Ajoutez -v valider=oui pour appliquer.'
  ROLLBACK;
\endif
