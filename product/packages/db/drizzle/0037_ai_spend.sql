-- Plafond de dépense RÉELLE (dollars), à ne pas confondre avec les crédits.
--
-- Les crédits sont une comptabilité interne : ce qu'on facture au client. Cette
-- table parle de l'argent qui part vraiment chez Anthropic et chez fal, et qui
-- arrive sur une facture à la fin du mois. Le plafond s'applique à TOUT LE
-- MONDE, y compris aux comptes à crédits illimités.
CREATE TABLE IF NOT EXISTS "ai_spend" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid,
  "provider" text NOT NULL,
  "model" text,
  "action" text NOT NULL,
  -- Ce qu'on avait estimé AVANT l'appel · sert à comprendre les écarts.
  "estimated_usd" double precision NOT NULL DEFAULT 0,
  -- Ce que l'appel a réellement coûté, lu dans la réponse. C'est cette colonne
  -- qui fait foi pour le plafond.
  "actual_usd" double precision NOT NULL DEFAULT 0,
  "input_tokens" integer,
  "output_tokens" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Le plafond se lit en sommant sur une fenêtre · l'index porte la date.
CREATE INDEX IF NOT EXISTS "ai_spend_date_idx" ON "ai_spend" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_spend_ws_idx" ON "ai_spend" ("workspace_id", "created_at");
