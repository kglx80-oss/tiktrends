-- Studios · L9 · projets Studios SYNTHÉTIQUES créés APRÈS la migration 0054/0055.
--
-- Sert MIG-03 : ces lignes jouent « les nouveaux projets créés avec la nouvelle
-- application ». Le retour à l'ancienne application ne doit pas les perdre, et
-- la ré-avance ne doit ni les dupliquer ni les modifier.
--
-- Sert aussi MIG-02 : un média historique de la bibliothèque (`assets`) est
-- référencé tel qu'un import « legacy » le ferait · origine `legacy`, référence
-- `legacy_ref` vers sa ligne d'origine, octets hachés depuis la data URI,
-- AUCUN calque, AUCUNE consigne, AUCUN fournisseur, AUCUN parent.
--
-- Contenu des versions : `contenuVide()` du noyau, empreinte canonique
-- 222602f1… (le test l9-semis-studios.test.ts la recalcule et refuse un écart).
-- Même garde de nom que le semis principal : l9_* uniquement.

\set ON_ERROR_STOP on

DO $$ BEGIN
  IF current_database() !~ '^l9_' THEN
    RAISE EXCEPTION 'L9 · semis Studios refusé sur la base « % » (préfixe l9_ exigé)', current_database();
  END IF;
END $$;

BEGIN;

INSERT INTO studio_projects (id, workspace_id, brand_id, kind, title, status, owner_id, created_at, updated_at) VALUES
  ('a9000000-0000-4000-8000-0000000000a1', 'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000021', 'image', 'Projet Studios L9 · image', 'active', 'a9000000-0000-4000-8000-000000000011', '2026-10-01T08:00:00Z', '2026-10-01T08:00:00Z'),
  ('a9000000-0000-4000-8000-0000000000a2', 'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000021', 'video', 'Projet Studios L9 · vidéo', 'active', 'a9000000-0000-4000-8000-000000000012', '2026-10-01T09:00:00Z', '2026-10-01T09:00:00Z'),
  ('a9000000-0000-4000-8000-0000000000a3', 'a9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000023', 'ads', 'Projet Studios L9 · espace B', 'active', 'a9000000-0000-4000-8000-000000000014', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z');

INSERT INTO studio_project_versions (id, project_id, workspace_id, brand_id, parent_id, n, schema_version, content, content_hash, author_id, reason, created_at)
SELECT ('a9000000-0000-4000-8000-0000000000b' || right(p.id::text, 1))::uuid, p.id, p.workspace_id, p.brand_id, NULL, 1, 1,
       '{"brief": null, "productRef": null, "styleRef": null, "characterRefs": {}, "shots": {"order": [], "byId": {}}, "document": null, "timeline": null}'::jsonb,
       '222602f18f047ddfd7ab6b13bc65251ba4f0a0e596b5d948fac69cb2b4d772cc', p.owner_id, 'création', p.created_at
FROM studio_projects p WHERE p.id IN ('a9000000-0000-4000-8000-0000000000a1', 'a9000000-0000-4000-8000-0000000000a2', 'a9000000-0000-4000-8000-0000000000a3');

UPDATE studio_projects SET current_version_id = ('a9000000-0000-4000-8000-0000000000b' || right(id::text, 1))::uuid, row_version = 1
WHERE id IN ('a9000000-0000-4000-8000-0000000000a1', 'a9000000-0000-4000-8000-0000000000a2', 'a9000000-0000-4000-8000-0000000000a3');

INSERT INTO studio_layouts (project_id, workspace_id, brand_id, positions, row_version, updated_by)
VALUES ('a9000000-0000-4000-8000-0000000000a2', 'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000021', '{"s_ouverture": {"x": 40, "y": 80}}', 1, 'a9000000-0000-4000-8000-000000000012');

-- Média historique référencé comme legacy (MIG-02) : octets de la data URI d'origine.
INSERT INTO studio_assets (id, workspace_id, brand_id, project_id, storage_key, mime, bytes, width, height, sha256, origin, rights, parent_asset_id, legacy_ref, storage_state, created_by, created_at)
SELECT 'a9000000-0000-4000-8000-0000000000c1', a.workspace_id, a.brand_id, 'a9000000-0000-4000-8000-0000000000a1',
       'legacy/assets/' || a.id, 'image/svg+xml', length(decode(split_part(a.url, ',', 2), 'base64')), 96, 96,
       encode(sha256(decode(split_part(a.url, ',', 2), 'base64')), 'hex'), 'legacy', '{}'::jsonb, NULL,
       jsonb_build_object('table', 'assets', 'id', a.id), 'stored', NULL, '2026-10-01T08:30:00Z'
FROM assets a WHERE a.id = md5('l9-asset-1')::uuid;

INSERT INTO studio_audit_events (actor_id, effective_role, workspace_id, brand_id, action, target_type, target_id, version_after, reason, trace_id, occurred_at)
SELECT p.owner_id, 'member', p.workspace_id, p.brand_id, 'project.create', 'project', p.id::text, '1', 'semis L9', 'st_l9_' || right(p.id::text, 2), p.created_at
FROM studio_projects p WHERE p.id IN ('a9000000-0000-4000-8000-0000000000a1', 'a9000000-0000-4000-8000-0000000000a2', 'a9000000-0000-4000-8000-0000000000a3');

COMMIT;
