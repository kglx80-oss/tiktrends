-- Rétro-rattacher les ads dont on connaît la génération avec certitude.
--
-- ── Ce qu'on répare ─────────────────────────────────────────────────────────
--
-- 0044 a posé `adsmap_ads.source_ref_json` et rien n'a été rétro-rempli : on ne
-- SAIT pas quelle génération a produit quelle variante historique, et deviner
-- aurait faussé l'attribution dans le sens qui l'arrange (D134, D135).
--
-- Mais un lien certain existait déjà, dans l'autre sens. La passerelle Studio →
-- ADSMAP écrit `generations.input_json.adsmapAdId` au moment où elle crée l'ad ·
-- une génération qui porte cet identifiant a produit CETTE ad, il n'y a rien à
-- déduire. C'est une trace posée par le code, pas une reconstruction.
--
-- On peut donc rendre à l'attribution, à la mesure des presets et à la dimension
-- « mise en page » toutes les ads nées du Studio · le reste (imports, veille,
-- itérations, ads saisies à la main) reste sans lien, et c'est correct : elles
-- n'ont jamais eu de génération.
--
-- ── Trois précautions ───────────────────────────────────────────────────────
--
-- 1. `WHERE a.source_ref_json IS NULL` · on ne remplace jamais un lien existant.
--    Celui posé à l'insertion est plus fiable que celui déduit ici, et rejouer
--    la migration ne doit rien changer.
--
-- 2. Le `CASE` autour du cast · `input_json ->> 'adsmapAdId'` peut contenir
--    n'importe quoi. Sans lui, une seule valeur mal formée ferait échouer toute
--    la migration, et PostgreSQL ne garantit pas d'évaluer le filtre avant le
--    cast quand les deux sont dans un `WHERE`.
--
-- 3. `DISTINCT ON` · si deux générations revendiquaient la même ad, on garde la
--    plus ancienne, celle qui l'a réellement créée. La passerelle s'arrête dès
--    qu'un `adsmapAdId` existe, donc le cas ne devrait pas se produire · une
--    migration qui « ne devrait pas » rencontrer un cas doit quand même décider
--    ce qu'elle en fait.
WITH claims AS (
  SELECT
    g.id AS gen_id,
    g.created_at,
    CASE
      WHEN g.input_json ->> 'adsmapAdId'
           ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (g.input_json ->> 'adsmapAdId')::uuid
    END AS ad_id
  FROM generations g
  WHERE g.kind = 'ad'
    AND jsonb_typeof(g.input_json -> 'adsmapAdId') = 'string'
),
liens AS (
  SELECT DISTINCT ON (c.ad_id) c.ad_id, c.gen_id
  FROM claims c
  WHERE c.ad_id IS NOT NULL
  ORDER BY c.ad_id, c.created_at ASC
)
UPDATE adsmap_ads a
SET source_ref_json = jsonb_build_object('generationId', l.gen_id::text)
FROM liens l
WHERE a.id = l.ad_id
  AND a.source_ref_json IS NULL;
