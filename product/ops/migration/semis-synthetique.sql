-- Studios · L9 · semis SYNTHÉTIQUE d'une base au schéma de main (migrations 0000 à 0053).
--
-- Ce ne sont pas des données de production : aucun client, aucune marque réelle,
-- aucun montant réel. Les volumes ne sont PAS ceux de la production (la session
-- ne les connaît pas) : ils sont choisis pour exercer chaque table que 0054 et
-- 0055 touchent ou référencent (brands, adsmap_ads, ai_spend, workspaces,
-- workspace_members, users) et chaque écran historique (Pubs IA, Image, Vidéo,
-- Textes, Veille, Sauvegardes, Adsmap).
--
-- Déterministe : identifiants dérivés de md5 (même graine ⇒ mêmes lignes),
-- dates fixes. Deux semis donnent la même empreinte.
--
-- Refuse toute base dont le nom ne commence pas par l9_ : il n'écrit
-- jamais ailleurs qu'en recette locale.

\set ON_ERROR_STOP on

DO $$ BEGIN
  IF current_database() !~ '^l9_' THEN
    RAISE EXCEPTION 'L9 · semis synthétique refusé sur la base « % » (préfixe l9_ exigé)', current_database();
  END IF;
END $$;

BEGIN;

-- ── Espaces, comptes, membres ──────────────────────────────────────────────
INSERT INTO workspaces (id, name, plan, credits_balance, created_at, onboarded_at) VALUES
  ('a9000000-0000-4000-8000-000000000001', 'Espace L9 A', 'business', 5000, '2026-08-01T09:00:00Z', '2026-08-01T09:30:00Z'),
  ('a9000000-0000-4000-8000-000000000002', 'Espace L9 B', 'core', 800, '2026-08-02T09:00:00Z', '2026-08-02T09:30:00Z');

INSERT INTO users (id, email, name, created_at) VALUES
  ('a9000000-0000-4000-8000-000000000011', 'proprio-a@l9.exemple.test', 'Propriétaire A', '2026-08-01T09:00:00Z'),
  ('a9000000-0000-4000-8000-000000000012', 'membre-a@l9.exemple.test', 'Membre A', '2026-08-01T09:05:00Z'),
  ('a9000000-0000-4000-8000-000000000013', 'lecteur-a@l9.exemple.test', 'Lecteur A', '2026-08-01T09:10:00Z'),
  ('a9000000-0000-4000-8000-000000000014', 'proprio-b@l9.exemple.test', 'Propriétaire B', '2026-08-02T09:00:00Z');

INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
  ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000011', 'owner'),
  ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000012', 'member'),
  ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000013', 'client_viewer'),
  ('a9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000014', 'owner');

-- ── Marques ─────────────────────────────────────────────────────────────────
INSERT INTO brands (id, workspace_id, name, url, logo_url, tone, category, colors, created_at) VALUES
  ('a9000000-0000-4000-8000-000000000021', 'a9000000-0000-4000-8000-000000000001', 'Marque L9 Alpha', 'https://alpha.l9.exemple.test',
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjMjU2M0VCIi8+PC9zdmc+',
   'direct', 'maison', ARRAY['#2563EB','#F59E0B'], '2026-08-01T10:00:00Z'),
  ('a9000000-0000-4000-8000-000000000022', 'a9000000-0000-4000-8000-000000000001', 'Marque L9 Beta', 'https://beta.l9.exemple.test', NULL,
   'chaleureux', 'beauté', ARRAY['#DB2777'], '2026-08-01T10:05:00Z'),
  ('a9000000-0000-4000-8000-000000000023', 'a9000000-0000-4000-8000-000000000002', 'Marque L9 Gamma', 'https://gamma.l9.exemple.test', NULL,
   'sobre', 'sport', ARRAY['#059669'], '2026-08-02T10:00:00Z');

-- ── Produits et personas ────────────────────────────────────────────────────
INSERT INTO products (id, brand_id, name, description, usp, price, url, image_url)
SELECT md5('l9-produit-' || b.k || '-' || i)::uuid, b.id, 'Produit L9 ' || b.k || ' n°' || i,
       'Description synthétique du produit ' || i, 'Atout ' || i, 9.9 + i, 'https://' || b.k || '.l9.exemple.test/p/' || i,
       'data:image/svg+xml;base64,' || replace(encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text y="40">P' || i || '</text></svg>', 'UTF8'), 'base64'), E'\n', '')
FROM (VALUES ('a9000000-0000-4000-8000-000000000021'::uuid, 'alpha', 30), ('a9000000-0000-4000-8000-000000000022'::uuid, 'beta', 10), ('a9000000-0000-4000-8000-000000000023'::uuid, 'gamma', 10)) AS b(id, k, n)
CROSS JOIN LATERAL generate_series(1, b.n) AS i;

INSERT INTO personas (id, brand_id, name, description, pains, desires)
SELECT md5('l9-persona-' || b.k || '-' || i)::uuid, b.id, 'Persona ' || b.k || ' ' || i, 'Persona synthétique',
       ARRAY['douleur ' || i], ARRAY['désir ' || i]
FROM (VALUES ('a9000000-0000-4000-8000-000000000021'::uuid, 'alpha'), ('a9000000-0000-4000-8000-000000000022'::uuid, 'beta'), ('a9000000-0000-4000-8000-000000000023'::uuid, 'gamma')) AS b(id, k)
CROSS JOIN generate_series(1, 3) AS i;

-- ── Médias historiques (bibliothèque `assets`, data URI comme en production) ─
INSERT INTO assets (id, workspace_id, brand_id, uploader_user_id, name, kind, source, url, mime_type, size_bytes, tags, created_at)
SELECT md5('l9-asset-' || i)::uuid,
       CASE WHEN i % 10 = 0 THEN 'a9000000-0000-4000-8000-000000000002'::uuid ELSE 'a9000000-0000-4000-8000-000000000001'::uuid END,
       CASE WHEN i % 10 = 0 THEN 'a9000000-0000-4000-8000-000000000023'::uuid
            WHEN i % 7 = 0 THEN NULL
            WHEN i % 3 = 0 THEN 'a9000000-0000-4000-8000-000000000022'::uuid
            ELSE 'a9000000-0000-4000-8000-000000000021'::uuid END,
       'a9000000-0000-4000-8000-000000000011',
       'Média hérité L9 n°' || i,
       (CASE WHEN i % 9 = 0 THEN 'video' ELSE 'image' END)::asset_kind,
       'upload'::asset_source,
       'data:image/svg+xml;base64,' || replace(encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><text y="50">A' || i || '</text></svg>', 'UTF8'), 'base64'), E'\n', ''),
       'image/svg+xml', 120 + i, ARRAY['l9', 'herite'], timestamptz '2026-08-05T00:00:00Z' + (i || ' minutes')::interval
FROM generate_series(1, 400) AS i;

-- ── Créations historiques (Pubs IA, Image, Vidéo, Textes) ───────────────────
-- Pubs IA : recette de maquette complète, comme `generateAds` l'enregistre.
INSERT INTO generations (id, brand_id, kind, input_json, output_json, asset_urls, credits_cost, status, created_at)
SELECT md5('l9-pub-' || i)::uuid,
       CASE WHEN i % 5 = 0 THEN 'a9000000-0000-4000-8000-000000000022'::uuid ELSE 'a9000000-0000-4000-8000-000000000021'::uuid END,
       'ad',
       jsonb_build_object(
         'template', (ARRAY['problem_solution','testimonial','benefits','stat'])[1 + i % 4],
         'sceneUrl', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiLz4=',
         'kicker', 'L9', 'headline', 'Pub héritée L9 n°' || i, 'subhead', 'Sous-titre synthétique ' || i, 'cta', 'Je découvre',
         'badge', NULL, 'quote', NULL, 'author', NULL, 'rating', NULL, 'benefits', jsonb_build_array('Rapide', 'Solide'),
         'stat', NULL, 'statLabel', NULL, 'accent', '#2563EB', 'brandName', 'Marque L9 Alpha', 'logoUrl', NULL, 'variant', i % 3,
         'mode', CASE WHEN i % 4 = 0 THEN 'entiere' ELSE 'composee' END, 'lot', 'lot-l9-' || (i / 8)),
       jsonb_build_object('engine', 'synthetique'),
       NULL, 4, CASE WHEN i % 25 = 0 THEN 'archived' ELSE 'done' END,
       timestamptz '2026-08-10T00:00:00Z' + (i || ' hours')::interval
FROM generate_series(1, 400) AS i;

-- Image IA : 1 à 4 sorties par génération.
INSERT INTO generations (id, brand_id, kind, input_json, output_json, asset_urls, credits_cost, status, created_at)
SELECT md5('l9-image-' || i)::uuid, 'a9000000-0000-4000-8000-000000000021', 'image',
       jsonb_build_object('prompt', 'Image héritée L9 n°' || i, 'rating', CASE WHEN i % 6 = 0 THEN 'up' WHEN i % 11 = 0 THEN 'down' END),
       jsonb_build_object('engine', 'synthetique'),
       ARRAY(SELECT 'data:image/svg+xml;base64,' || replace(encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text y="30">I' || i || '-' || k || '</text></svg>', 'UTF8'), 'base64'), E'\n', '')
             FROM generate_series(1, 1 + i % 4) AS k),
       2, 'completed', timestamptz '2026-08-12T00:00:00Z' + (i || ' hours')::interval
FROM generate_series(1, 200) AS i;

-- Vidéo IA : terminées (aucune n'est « en cours » : l'écran ne sonde jamais de fournisseur).
INSERT INTO generations (id, brand_id, kind, input_json, output_json, asset_urls, credits_cost, status, job_id, created_at)
SELECT md5('l9-video-' || i)::uuid, 'a9000000-0000-4000-8000-000000000021', 'video',
       jsonb_build_object('prompt', 'Vidéo héritée L9 n°' || i, 'mode', CASE WHEN i % 2 = 0 THEN 'i2v' ELSE 't2v' END),
       CASE WHEN i % 10 = 0 THEN jsonb_build_object('error', 'échec synthétique') ELSE '{}'::jsonb END,
       CASE WHEN i % 10 = 0 THEN NULL ELSE ARRAY['https://medias.l9.exemple.test/video-' || i || '.mp4'] END,
       10, CASE WHEN i % 10 = 0 THEN 'failed' ELSE 'completed' END, 'job-l9-' || i,
       timestamptz '2026-08-15T00:00:00Z' + (i || ' hours')::interval
FROM generate_series(1, 80) AS i;

-- Textes IA : scripts.
INSERT INTO generations (id, brand_id, kind, input_json, output_json, credits_cost, status, created_at)
SELECT md5('l9-script-' || i)::uuid, 'a9000000-0000-4000-8000-000000000021', 'script',
       jsonb_build_object('brief', 'Brief synthétique ' || i),
       jsonb_build_object('scripts', jsonb_build_array(jsonb_build_object('hook', 'Accroche héritée L9 n°' || i, 'body', 'Corps synthétique', 'cta', 'Je teste'))),
       1, 'done', timestamptz '2026-08-20T00:00:00Z' + (i || ' hours')::interval
FROM generate_series(1, 60) AS i;

-- ── Dépense IA (ai_spend, colonne ajoutée par 0055) ─────────────────────────
INSERT INTO ai_spend (id, workspace_id, provider, model, action, estimated_usd, actual_usd, input_tokens, output_tokens, created_at)
SELECT md5('l9-spend-' || i)::uuid,
       CASE WHEN i % 13 = 0 THEN NULL WHEN i % 4 = 0 THEN 'a9000000-0000-4000-8000-000000000002'::uuid ELSE 'a9000000-0000-4000-8000-000000000001'::uuid END,
       (ARRAY['anthropic','fal','higgsfield'])[1 + i % 3], (ARRAY['claude-test','nano','gpt-image'])[1 + i % 3],
       (ARRAY['ads.generate','image.generate','copy.review','jarvis.chat'])[1 + i % 4],
       round((0.001 * (1 + i % 97))::numeric, 6)::float8,
       CASE WHEN i % 17 = 0 THEN 0 ELSE round((0.0009 * (1 + i % 97))::numeric, 6)::float8 END,
       100 + i % 900, 20 + i % 300,
       timestamptz '2026-08-01T00:00:00Z' + ((i * 7) || ' minutes')::interval
FROM generate_series(1, 6000) AS i;

INSERT INTO credit_ledger (id, workspace_id, delta, reason, ref_id, created_at)
SELECT md5('l9-credit-' || i)::uuid,
       CASE WHEN i % 4 = 0 THEN 'a9000000-0000-4000-8000-000000000002'::uuid ELSE 'a9000000-0000-4000-8000-000000000001'::uuid END,
       CASE WHEN i % 20 = 0 THEN 500 ELSE -(1 + i % 10) END,
       CASE WHEN i % 20 = 0 THEN 'recharge' ELSE 'generation' END, 'ref-l9-' || i,
       timestamptz '2026-08-01T00:00:00Z' + ((i * 30) || ' minutes')::interval
FROM generate_series(1, 600) AS i;

-- ── Veille et Sauvegardes ───────────────────────────────────────────────────
INSERT INTO market_creatives (id, workspace_id, brand_id, platform, external_id, advertiser, days_running, reach_delta_30d, live_ads_count, format, hook_type, created_at, provenance)
SELECT md5('l9-veille-' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000021',
       CASE WHEN i % 3 = 0 THEN 'tiktok' ELSE 'meta' END, 'ext-l9-' || i, 'Annonceur synthétique ' || (i % 40),
       1 + i % 120, (i % 50) / 10.0, 1 + i % 12, (ARRAY['video','image','carousel'])[1 + i % 3], (ARRAY['question','statement','number'])[1 + i % 3],
       timestamptz '2026-08-01T00:00:00Z' + (i || ' minutes')::interval, NULL
FROM generate_series(1, 1500) AS i;

INSERT INTO saved_ads (id, workspace_id, user_id, platform, external_id, snapshot_json, note, brand_id, folder, created_at)
SELECT md5('l9-sauvegarde-' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000011',
       'meta', 'sauv-l9-' || i,
       jsonb_build_object('advertiser', 'Annonceur synthétique ' || (i % 30), 'text', 'Texte de l’annonce sauvegardée L9 n°' || i, 'format', 'image'),
       CASE WHEN i % 5 = 0 THEN 'note ' || i END, 'a9000000-0000-4000-8000-000000000021', CASE WHEN i % 4 = 0 THEN 'Hooks' END,
       timestamptz '2026-08-03T00:00:00Z' + (i || ' hours')::interval
FROM generate_series(1, 200) AS i;

-- ── Adsmap (adsmap_ads reçoit une unicité composite en 0054) ────────────────
INSERT INTO adsmap_desires (id, workspace_id, persona_id, label, status)
SELECT md5('l9-desir-' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('l9-persona-alpha-' || (1 + i % 3))::uuid, 'Désir L9 ' || i, 'validated'
FROM generate_series(1, 4) AS i;

INSERT INTO adsmap_angles (id, workspace_id, desire_id, label, mechanism, status)
SELECT md5('l9-angle-' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('l9-desir-' || (1 + i % 4))::uuid, 'Angle L9 ' || i,
       (ARRAY['problem_agitate','demo','social_proof','story'])[1 + i % 4]::adsmap_angle_mechanism, 'validated'
FROM generate_series(1, 8) AS i;

INSERT INTO adsmap_concepts (id, workspace_id, angle_id, title, status)
SELECT md5('l9-concept-' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('l9-angle-' || (1 + i % 8))::uuid, 'Concept L9 ' || i, 'validated'
FROM generate_series(1, 24) AS i;

INSERT INTO adsmap_batches (id, workspace_id, brand_id, number, goal, status)
SELECT md5('l9-lot-' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000021', i, 'Objectif du lot ' || i,
       (ARRAY['planned','testing','analyzed'])[i]::adsmap_batch_status
FROM generate_series(1, 3) AS i;

INSERT INTO adsmap_ads (id, workspace_id, concept_id, batch_id, variant_code, format, hypothesis, status, created_at)
SELECT md5('l9-ad-' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('l9-concept-' || (1 + i % 24))::uuid, md5('l9-lot-' || (1 + i % 3))::uuid,
       'V' || i, (ARRAY['static','video_ugc','image_carousel'])[1 + i % 3]::adsmap_ad_format, 'Hypothèse L9 ' || i,
       (ARRAY['draft','proposed','done'])[1 + i % 3]::adsmap_ad_status,
       timestamptz '2026-08-20T00:00:00Z' + (i || ' hours')::interval
FROM generate_series(1, 120) AS i;

INSERT INTO app_settings (key, value) VALUES
  ('l9:semis', '{"synthetique": true, "graine": "l9"}'::jsonb);

COMMIT;
