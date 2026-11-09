-- Marque · RANG et SEGMENT des personas (migration ADDITIVE · lot 9 V5).
--
-- Générée par drizzle-kit (0.24, `drizzle-kit generate` contre un instantané du
-- schéma de main à 0070) · à la main, seulement ce commentaire et « IF NOT
-- EXISTS » sur les deux ajouts de colonne (rejouables, comme 0068 et 0069).
--   · `personas.rank` · le rang du persona dans sa marque (1, 2, 3… sans trou,
--     NULL = sans rang) · la règle vit au noyau (`rangsApres`,
--     packages/core/src/spatial/marque/personas-edition.ts) ;
--   · `personas.segment` · le segment en clair (« Jeunes parents »…) ;
--   · `personas_brand_rank_idx` · l'ordre de lecture d'une marque.
-- Une seule table de personas (décision D2 · le modèle « Avatar » d'Adsmap) ·
-- rien n'est fusionné, rien n'est recopié · le lien d'un persona aux tests se
-- LIT (carte Adsmap et brief du projet), sans colonne.
--
-- Aucune donnée existante lue ni modifiée (les personas d'avant restent à NULL,
-- « sans rang »), aucune destruction, aucune colonne NOT NULL, aucun DROP ni
-- RENAME. Rejouable : « ADD COLUMN IF NOT EXISTS », index « IF NOT EXISTS ».
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "rank" integer;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "segment" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personas_brand_rank_idx" ON "personas" USING btree ("brand_id","rank");
