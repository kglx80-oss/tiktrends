-- Créas CONCURRENTES décrites par l'agent A0.
--
-- Distinctes de `creatives`, qui porte nos propres assets : on n'a ici aucun
-- chiffre de performance, seulement des signaux de persistance (jours en ligne,
-- progression de portée). Les mélanger ferait croire à des verdicts là où il n'y
-- a que « cet annonceur continue de payer ».
CREATE TABLE IF NOT EXISTS "market_creatives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "brand_id" uuid REFERENCES "brands"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "external_id" text NOT NULL,
  "advertiser" text,
  -- Signaux de persistance · le seul indice de performance dont on dispose.
  "days_running" integer NOT NULL DEFAULT 0,
  "reach_delta_30d" double precision,
  "live_ads_count" integer,
  "format" text,
  -- Dimensions décrites · mêmes valeurs fermées que pour nos propres créas.
  "hook_type" text,
  "opening_type" text,
  "talent" text,
  "length_bucket" text,
  "analysis" jsonb,
  "analysis_confidence" double precision,
  "analyzed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- Une créa décrite deux fois fausserait toutes les parts · la clé l'empêche.
  CONSTRAINT "market_creatives_key" UNIQUE ("workspace_id", "platform", "external_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_creatives_brand_idx" ON "market_creatives" ("brand_id", "analyzed_at");
