-- ADSMAP · addendum v2.1 (C2) : plafond de dépense IA de l'orchestrateur nocturne.
-- Note : 'budget_exhausted', posé en 0033, reste dans l'enum (Postgres ne sait pas
-- retirer une valeur). Il n'est plus référencé côté TypeScript.
ALTER TYPE "adsmap_decision_type" ADD VALUE 'ai_budget_reached';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_ai_budgets" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"monthly_cap_eur" double precision DEFAULT 40 NOT NULL,
	"nightly_cap_eur" double precision DEFAULT 3 NOT NULL,
	"soft_warn_ratio" double precision DEFAULT 0.8 NOT NULL,
	"spent_month_eur" double precision DEFAULT 0 NOT NULL,
	"spent_night_eur" double precision DEFAULT 0 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"period_month" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adsmap_agent_runs" ADD COLUMN "cost_eur" double precision;--> statement-breakpoint
ALTER TABLE "adsmap_agent_runs" ADD COLUMN "estimated_eur" double precision;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ai_budgets" ADD CONSTRAINT "adsmap_ai_budgets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ai_budgets" ADD CONSTRAINT "adsmap_ai_budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
