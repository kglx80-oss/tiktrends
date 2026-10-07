-- Studios v1.0 · L1 · fondations du modèle canonique (migration ADDITIVE).
--
-- Ce fichier n'efface, ne renomme et ne modifie AUCUNE donnée existante. Il
-- ajoute des tables préfixées `studio_`, deux contraintes d'unicité composites
-- sur des tables existantes (sans effet sur leurs lignes : `id` y est déjà
-- unique) et des déclencheurs qui rendent certaines tables immuables.
-- Mapping et décisions : docs/studios-v2/L1-MODELE.md.
--
-- Rejouable : chaque objet est créé « IF NOT EXISTS », « OR REPLACE » ou dans
-- un bloc qui ignore l'objet déjà présent. Deux passages laissent la base dans
-- le même état, sans doublon.
--
-- Choix : les valeurs fermées sont des `text` + CHECK, pas des enums Postgres.
-- Un ALTER TYPE ... ADD VALUE ne passe pas dans la transaction du migrateur ;
-- une contrainte CHECK se remplace dans une migration ordinaire.

-- ─── Unicités composites sur l'existant · supports des clés de portée ───────
-- Une ligne studio qui porte (brand_id, workspace_id) référence CE couple :
-- la base refuse une marque d'un autre espace, quelle que soit l'application.
DO $$ BEGIN
 ALTER TABLE "brands" ADD CONSTRAINT "brands_id_workspace_uq" UNIQUE ("id", "workspace_id");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ads" ADD CONSTRAINT "adsmap_ads_id_workspace_uq" UNIQUE ("id", "workspace_id");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
--> statement-breakpoint

-- ─── Déclencheurs d'immuabilité ─────────────────────────────────────────────
-- Toute modification ou suppression refusée (versions, devis, plans d'impact,
-- registre budgétaire, journal d'audit).
CREATE OR REPLACE FUNCTION "studio_refuser_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'STUDIO_IMMUABLE · % refusé sur %, table en ajout seul', TG_OP, TG_TABLE_NAME;
END
$$;
--> statement-breakpoint
-- Seules les colonnes passées en argument peuvent changer ; DELETE refusé.
CREATE OR REPLACE FUNCTION "studio_colonnes_mobiles"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  avant jsonb;
  apres jsonb;
  i integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'STUDIO_IMMUABLE · DELETE refusé sur %', TG_TABLE_NAME;
  END IF;
  avant := to_jsonb(OLD);
  apres := to_jsonb(NEW);
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    avant := avant - TG_ARGV[i];
    apres := apres - TG_ARGV[i];
  END LOOP;
  IF avant IS DISTINCT FROM apres THEN
    RAISE EXCEPTION 'STUDIO_IMMUABLE · sur %, seules ces colonnes peuvent changer : %', TG_TABLE_NAME, array_to_string(TG_ARGV, ', ');
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Une approbation se consomme UNE fois, et rien d'autre ne bouge.
CREATE OR REPLACE FUNCTION "studio_approbation_consommee"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'STUDIO_IMMUABLE · DELETE refusé sur %', TG_TABLE_NAME;
  END IF;
  IF OLD.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'STUDIO_APPROBATION_CONSOMMEE · approbation % déjà consommée', OLD.id;
  END IF;
  IF NEW.consumed_at IS NULL OR NEW.consumed_job_id IS NULL THEN
    RAISE EXCEPTION 'STUDIO_IMMUABLE · une approbation ne change que pour être consommée par un job';
  END IF;
  IF (to_jsonb(OLD) - 'consumed_at' - 'consumed_job_id') IS DISTINCT FROM (to_jsonb(NEW) - 'consumed_at' - 'consumed_job_id') THEN
    RAISE EXCEPTION 'STUDIO_IMMUABLE · sur %, seule la consommation peut changer', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Version de prompt : brouillon modifiable ; validée, elle ne peut que passer
-- à « retired » ; retirée, plus rien. Seul un brouillon se supprime.
CREATE OR REPLACE FUNCTION "studio_prompt_version_figee"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'STUDIO_IMMUABLE · une version de prompt % ne se supprime pas', OLD.status;
  END IF;
  IF (to_jsonb(OLD) - 'content' - 'content_hash' - 'status' - 'validated_by' - 'validated_at' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(NEW) - 'content' - 'content_hash' - 'status' - 'validated_by' - 'validated_at' - 'updated_at') THEN
    RAISE EXCEPTION 'STUDIO_IMMUABLE · clé, version et portée d''un prompt ne changent pas';
  END IF;
  IF OLD.status = 'draft' THEN RETURN NEW; END IF;
  IF OLD.status = 'validated' AND NEW.status = 'retired'
     AND NEW.content IS NOT DISTINCT FROM OLD.content
     AND NEW.content_hash = OLD.content_hash
     AND NEW.validated_by IS NOT DISTINCT FROM OLD.validated_by
     AND NEW.validated_at IS NOT DISTINCT FROM OLD.validated_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'STUDIO_IMMUABLE · version de prompt % figée, en créer une nouvelle', OLD.status;
END
$$;
--> statement-breakpoint

-- ─── Restriction optionnelle de marque ──────────────────────────────────────
-- Aucune ligne pour (espace, utilisateur) = toutes les marques (droits acquis).
-- La marque est en RESTRICT : supprimer la seule marque d'une restriction
-- rendrait la personne non restreinte, donc toutes marques ouvertes.
CREATE TABLE IF NOT EXISTS "studio_member_brand_scopes" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_member_brand_scopes_pk" PRIMARY KEY ("workspace_id", "user_id", "brand_id"),
	CONSTRAINT "studio_member_brand_scopes_member_fk" FOREIGN KEY ("workspace_id", "user_id") REFERENCES "workspace_members"("workspace_id", "user_id") ON DELETE CASCADE,
	CONSTRAINT "studio_member_brand_scopes_brand_fk" FOREIGN KEY ("brand_id", "workspace_id") REFERENCES "brands"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_member_brand_scopes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ─── Registre de prompts (L2 s'en sert ; posé ici pour figer les interfaces) ─
CREATE TABLE IF NOT EXISTS "studio_prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL CHECK ("version" >= 1),
	"kind" text NOT NULL CHECK ("kind" IN ('template', 'style_recipe', 'common')),
	"scope" text NOT NULL CHECK ("scope" IN ('platform', 'workspace', 'brand')),
	"workspace_id" uuid,
	"brand_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL CHECK ("status" IN ('draft', 'validated', 'retired')),
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL CHECK ("content_hash" ~ '^[a-f0-9]{64}$'),
	"origin" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_prompt_versions_scope_ck" CHECK (
		("scope" = 'platform' AND "workspace_id" IS NULL AND "brand_id" IS NULL)
		OR ("scope" = 'workspace' AND "workspace_id" IS NOT NULL AND "brand_id" IS NULL)
		OR ("scope" = 'brand' AND "workspace_id" IS NOT NULL AND "brand_id" IS NOT NULL)),
	CONSTRAINT "studio_prompt_versions_brand_fk" FOREIGN KEY ("brand_id", "workspace_id") REFERENCES "brands"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_versions_uq" UNIQUE NULLS NOT DISTINCT ("key", "version", "scope", "workspace_id", "brand_id"),
	CONSTRAINT "studio_prompt_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_versions_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_prompt_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL CHECK ("scope" IN ('platform', 'workspace', 'brand')),
	"workspace_id" uuid,
	"brand_id" uuid,
	"entries" jsonb NOT NULL,
	"release_hash" text NOT NULL CHECK ("release_hash" ~ '^[a-f0-9]{64}$'),
	"status" text DEFAULT 'staged' NOT NULL CHECK ("status" IN ('staged', 'active', 'retired')),
	"evaluation" jsonb,
	"reason" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_prompt_releases_scope_ck" CHECK (
		("scope" = 'platform' AND "workspace_id" IS NULL AND "brand_id" IS NULL)
		OR ("scope" = 'workspace' AND "workspace_id" IS NOT NULL AND "brand_id" IS NULL)
		OR ("scope" = 'brand' AND "workspace_id" IS NOT NULL AND "brand_id" IS NOT NULL)),
	CONSTRAINT "studio_prompt_releases_brand_fk" FOREIGN KEY ("brand_id", "workspace_id") REFERENCES "brands"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_releases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_releases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
-- Pointeur actif par portée · activation et retour arrière = un compare-and-set
-- sur row_version, les releases elles-mêmes ne bougent pas.
CREATE TABLE IF NOT EXISTS "studio_prompt_active" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL CHECK ("scope" IN ('platform', 'workspace', 'brand')),
	"workspace_id" uuid,
	"brand_id" uuid,
	"release_id" uuid NOT NULL,
	"previous_release_id" uuid,
	"row_version" integer DEFAULT 0 NOT NULL,
	"activated_by" uuid,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_prompt_active_scope_ck" CHECK (
		("scope" = 'platform' AND "workspace_id" IS NULL AND "brand_id" IS NULL)
		OR ("scope" = 'workspace' AND "workspace_id" IS NOT NULL AND "brand_id" IS NULL)
		OR ("scope" = 'brand' AND "workspace_id" IS NOT NULL AND "brand_id" IS NOT NULL)),
	CONSTRAINT "studio_prompt_active_brand_fk" FOREIGN KEY ("brand_id", "workspace_id") REFERENCES "brands"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_active_uq" UNIQUE NULLS NOT DISTINCT ("scope", "workspace_id", "brand_id"),
	CONSTRAINT "studio_prompt_active_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_active_release_id_studio_prompt_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "studio_prompt_releases"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_active_previous_release_id_studio_prompt_releases_id_fk" FOREIGN KEY ("previous_release_id") REFERENCES "studio_prompt_releases"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_active_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_prompt_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid,
	"prompt_version_id" uuid,
	"kind" text NOT NULL CHECK ("kind" IN ('structural', 'benchmark', 'manual')),
	"passed" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"evaluator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_prompt_evaluations_cible_ck" CHECK ("release_id" IS NOT NULL OR "prompt_version_id" IS NOT NULL),
	CONSTRAINT "studio_prompt_evaluations_release_id_studio_prompt_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "studio_prompt_releases"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_evaluations_prompt_version_id_studio_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "studio_prompt_versions"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_evaluations_evaluator_id_users_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ─── Projet et versions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "studio_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" text NOT NULL CHECK ("kind" IN ('image', 'video', 'ads', 'text', 'campaign')),
	"title" text NOT NULL CHECK (char_length("title") BETWEEN 1 AND 200),
	"status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('active', 'archived')),
	"owner_id" uuid,
	"current_version_id" uuid,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"test_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_projects_brand_fk" FOREIGN KEY ("brand_id", "workspace_id") REFERENCES "brands"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_projects_portee_uq" UNIQUE ("id", "workspace_id", "brand_id"),
	CONSTRAINT "studio_projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_projects_portee_idx" ON "studio_projects" ("workspace_id", "brand_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"parent_id" uuid,
	"n" integer NOT NULL CHECK ("n" >= 1),
	"schema_version" integer NOT NULL CHECK ("schema_version" >= 1),
	"content" jsonb NOT NULL,
	"prompt_release_id" uuid,
	"content_hash" text NOT NULL CHECK ("content_hash" ~ '^[a-f0-9]{64}$'),
	"author_id" uuid,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_project_versions_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_project_versions_n_uq" UNIQUE ("project_id", "n"),
	CONSTRAINT "studio_project_versions_projet_uq" UNIQUE ("id", "project_id"),
	CONSTRAINT "studio_project_versions_parent_fk" FOREIGN KEY ("parent_id", "project_id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_project_versions_prompt_release_id_studio_prompt_releases_id_fk" FOREIGN KEY ("prompt_release_id") REFERENCES "studio_prompt_releases"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_project_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_project_versions_portee_idx" ON "studio_project_versions" ("workspace_id", "brand_id", "project_id");
--> statement-breakpoint
-- La version courante appartient au MÊME projet (clé composite).
DO $$ BEGIN
 ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_current_version_fk" FOREIGN KEY ("current_version_id", "id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_project_versions_immuables" BEFORE UPDATE OR DELETE ON "studio_project_versions" FOR EACH ROW EXECUTE FUNCTION "studio_refuser_mutation"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_project_versions_sans_vidage" BEFORE TRUNCATE ON "studio_project_versions" FOR EACH STATEMENT EXECUTE FUNCTION "studio_refuser_mutation"();
--> statement-breakpoint
-- Positions du canvas · séparées des données, sans effet sur l'ordre des plans.
CREATE TABLE IF NOT EXISTS "studio_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"positions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"viewport" jsonb,
	"row_version" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_layouts_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_layouts_projet_uq" UNIQUE ("project_id"),
	CONSTRAINT "studio_layouts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_layouts_portee_idx" ON "studio_layouts" ("workspace_id", "brand_id");
--> statement-breakpoint

-- ─── Médias ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "studio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL CHECK ("bytes" >= 0),
	"width" integer CHECK ("width" > 0),
	"height" integer CHECK ("height" > 0),
	"duration_ms" integer CHECK ("duration_ms" >= 0),
	"fps_num" integer,
	"fps_den" integer,
	"has_audio" boolean,
	"sha256" text NOT NULL CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
	"origin" text NOT NULL CHECK ("origin" IN ('upload', 'generated', 'legacy', 'import', 'render')),
	"rights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_asset_id" uuid,
	"legacy_ref" jsonb,
	"storage_state" text DEFAULT 'pending' NOT NULL CHECK ("storage_state" IN ('pending', 'stored', 'failed', 'deleted')),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_assets_fps_ck" CHECK (("fps_num" IS NULL AND "fps_den" IS NULL) OR ("fps_num" > 0 AND "fps_den" > 0)),
	CONSTRAINT "studio_assets_brand_fk" FOREIGN KEY ("brand_id", "workspace_id") REFERENCES "brands"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_assets_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_assets_portee_uq" UNIQUE ("id", "workspace_id", "brand_id"),
	CONSTRAINT "studio_assets_parent_fk" FOREIGN KEY ("parent_asset_id", "workspace_id", "brand_id") REFERENCES "studio_assets"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_assets_storage_uq" UNIQUE ("workspace_id", "storage_key"),
	CONSTRAINT "studio_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_assets_portee_idx" ON "studio_assets" ("workspace_id", "brand_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_assets_sha_idx" ON "studio_assets" ("workspace_id", "sha256");
--> statement-breakpoint

-- ─── Propositions, impacts, devis, approbations ─────────────────────────────
CREATE TABLE IF NOT EXISTS "studio_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"target" text NOT NULL,
	"base_version_id" uuid NOT NULL,
	"allowed_paths" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_costs" jsonb,
	"state" text DEFAULT 'draft' NOT NULL CHECK ("state" IN ('draft', 'proposed', 'approved', 'rejected', 'expired')),
	"applied_version_id" uuid,
	"expires_at" timestamp with time zone,
	"origin" text NOT NULL CHECK ("origin" IN ('jarvis', 'agent', 'human')),
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	CONSTRAINT "studio_proposals_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_proposals_base_fk" FOREIGN KEY ("base_version_id", "project_id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_proposals_appliquee_fk" FOREIGN KEY ("applied_version_id", "project_id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_proposals_portee_uq" UNIQUE ("id", "workspace_id", "brand_id"),
	CONSTRAINT "studio_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
	CONSTRAINT "studio_proposals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_proposals_portee_idx" ON "studio_proposals" ("workspace_id", "brand_id", "project_id", "state");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_impact_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_id" uuid,
	"from_version_id" uuid NOT NULL,
	"to_version_id" uuid,
	"changed_inputs" jsonb NOT NULL,
	"reused" jsonb NOT NULL,
	"obsolete" jsonb NOT NULL,
	"redo" jsonb NOT NULL,
	"plan_hash" text NOT NULL CHECK ("plan_hash" ~ '^[a-f0-9]{64}$'),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_impact_plans_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_impact_plans_proposal_fk" FOREIGN KEY ("proposal_id", "workspace_id", "brand_id") REFERENCES "studio_proposals"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_impact_plans_depuis_fk" FOREIGN KEY ("from_version_id", "project_id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_impact_plans_vers_fk" FOREIGN KEY ("to_version_id", "project_id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_impact_plans_portee_uq" UNIQUE ("id", "workspace_id", "brand_id"),
	CONSTRAINT "studio_impact_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_impact_plans_portee_idx" ON "studio_impact_plans" ("workspace_id", "brand_id", "project_id");
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_impact_plans_immuables" BEFORE UPDATE OR DELETE ON "studio_impact_plans" FOR EACH ROW EXECUTE FUNCTION "studio_refuser_mutation"();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_version_id" uuid NOT NULL,
	"impact_plan_id" uuid,
	"impact_plan_hash" text NOT NULL CHECK ("impact_plan_hash" ~ '^[a-f0-9]{64}$'),
	"input_hash" text NOT NULL CHECK ("input_hash" ~ '^[a-f0-9]{64}$'),
	"prompt_release_id" uuid,
	"pricing_version" text NOT NULL,
	"lines" jsonb NOT NULL,
	"maximum_credits" integer NOT NULL CHECK ("maximum_credits" >= 0),
	"maximum_usd_micros" bigint NOT NULL CHECK ("maximum_usd_micros" >= 0),
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_quotes_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_quotes_version_fk" FOREIGN KEY ("project_version_id", "project_id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_quotes_impact_fk" FOREIGN KEY ("impact_plan_id", "workspace_id", "brand_id") REFERENCES "studio_impact_plans"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_quotes_portee_uq" UNIQUE ("id", "workspace_id", "brand_id"),
	CONSTRAINT "studio_quotes_prompt_release_id_studio_prompt_releases_id_fk" FOREIGN KEY ("prompt_release_id") REFERENCES "studio_prompt_releases"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_quotes_portee_idx" ON "studio_quotes" ("workspace_id", "brand_id", "project_id");
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_quotes_immuables" BEFORE UPDATE OR DELETE ON "studio_quotes" FOR EACH ROW EXECUTE FUNCTION "studio_refuser_mutation"();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"input_hash" text NOT NULL CHECK ("input_hash" ~ '^[a-f0-9]{64}$'),
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_job_id" uuid,
	CONSTRAINT "studio_approvals_quote_fk" FOREIGN KEY ("quote_id", "workspace_id", "brand_id") REFERENCES "studio_quotes"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_approvals_quote_uq" UNIQUE ("quote_id"),
	CONSTRAINT "studio_approvals_portee_uq" UNIQUE ("id", "workspace_id", "brand_id"),
	CONSTRAINT "studio_approvals_consommation_ck" CHECK (("consumed_at" IS NULL) = ("consumed_job_id" IS NULL)),
	CONSTRAINT "studio_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_approvals_consommation_unique" BEFORE UPDATE OR DELETE ON "studio_approvals" FOR EACH ROW EXECUTE FUNCTION "studio_approbation_consommee"();
--> statement-breakpoint

-- ─── Jobs ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "studio_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_version_id" uuid NOT NULL,
	"quote_id" uuid,
	"approval_id" uuid,
	"operation" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL CHECK ("state" IN ('queued', 'claimed', 'running', 'persisting', 'completed', 'failed', 'cancel_requested', 'cancelled', 'reconciliation_required')),
	"quality_status" text DEFAULT 'pending' NOT NULL CHECK ("quality_status" IN ('pending', 'passed', 'requires_review', 'rejected')),
	"idempotency_key" text NOT NULL CHECK (char_length("idempotency_key") BETWEEN 1 AND 160),
	"input_hash" text NOT NULL CHECK ("input_hash" ~ '^[a-f0-9]{64}$'),
	"snapshot" jsonb NOT NULL,
	"prompt_release_id" uuid,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"provider" text,
	"provider_request_id" text,
	"parent_job_id" uuid,
	"result" jsonb,
	"error" jsonb,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "studio_jobs_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_jobs_version_fk" FOREIGN KEY ("project_version_id", "project_id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_jobs_quote_fk" FOREIGN KEY ("quote_id", "workspace_id", "brand_id") REFERENCES "studio_quotes"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_jobs_approval_fk" FOREIGN KEY ("approval_id", "workspace_id", "brand_id") REFERENCES "studio_approvals"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_jobs_approval_uq" UNIQUE ("approval_id"),
	CONSTRAINT "studio_jobs_idempotence_uq" UNIQUE ("workspace_id", "idempotency_key"),
	CONSTRAINT "studio_jobs_portee_uq" UNIQUE ("id", "workspace_id", "brand_id"),
	CONSTRAINT "studio_jobs_parent_fk" FOREIGN KEY ("parent_job_id", "workspace_id", "brand_id") REFERENCES "studio_jobs"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_jobs_prompt_release_id_studio_prompt_releases_id_fk" FOREIGN KEY ("prompt_release_id") REFERENCES "studio_prompt_releases"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_jobs_portee_idx" ON "studio_jobs" ("workspace_id", "brand_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_jobs_file_idx" ON "studio_jobs" ("state", "lease_expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"n" integer NOT NULL CHECK ("n" >= 1),
	"worker_id" text NOT NULL,
	"state" text NOT NULL CHECK ("state" IN ('started', 'submitted', 'succeeded', 'failed', 'uncertain', 'abandoned')),
	"provider_request_id" text,
	"provider_idempotency_key" text,
	"error" jsonb,
	"cost" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "studio_job_attempts_job_fk" FOREIGN KEY ("job_id", "workspace_id", "brand_id") REFERENCES "studio_jobs"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_job_attempts_n_uq" UNIQUE ("job_id", "n")
);
--> statement-breakpoint

-- ─── Registre budgétaire et outbox ──────────────────────────────────────────
-- Unités entières (crédits, micro-dollars) ; jamais de flottant.
CREATE TABLE IF NOT EXISTS "studio_budget_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"project_id" uuid,
	"job_id" uuid,
	"quote_id" uuid,
	"kind" text NOT NULL CHECK ("kind" IN ('reserve', 'settle', 'release', 'adjustment')),
	"credits" integer NOT NULL,
	"usd_micros" bigint NOT NULL,
	"ref" text NOT NULL CHECK (char_length("ref") BETWEEN 1 AND 200),
	"reason" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_budget_ledger_ref_uq" UNIQUE ("ref"),
	CONSTRAINT "studio_budget_ledger_signe_ck" CHECK ("kind" = 'adjustment' OR ("credits" >= 0 AND "usd_micros" >= 0)),
	CONSTRAINT "studio_budget_ledger_brand_fk" FOREIGN KEY ("brand_id", "workspace_id") REFERENCES "brands"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_budget_ledger_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_budget_ledger_job_fk" FOREIGN KEY ("job_id", "workspace_id", "brand_id") REFERENCES "studio_jobs"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_budget_ledger_quote_fk" FOREIGN KEY ("quote_id", "workspace_id", "brand_id") REFERENCES "studio_quotes"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_budget_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_budget_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_budget_ledger_portee_idx" ON "studio_budget_ledger" ("workspace_id", "brand_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_budget_ledger_job_idx" ON "studio_budget_ledger" ("job_id");
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_budget_ledger_ajout_seul" BEFORE UPDATE OR DELETE ON "studio_budget_ledger" FOR EACH ROW EXECUTE FUNCTION "studio_refuser_mutation"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_budget_ledger_sans_vidage" BEFORE TRUNCATE ON "studio_budget_ledger" FOR EACH STATEMENT EXECUTE FUNCTION "studio_refuser_mutation"();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "studio_outbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_outbox_a_publier_idx" ON "studio_outbox" ("published_at", "id");
--> statement-breakpoint

-- ─── Traces d'exécution de prompt ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "studio_prompt_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid,
	"job_id" uuid,
	"template_key" text NOT NULL,
	"prompt_version_id" uuid,
	"prompt_release_id" uuid,
	"compiled_hash" text NOT NULL CHECK ("compiled_hash" ~ '^[a-f0-9]{64}$'),
	"context_snapshot_hash" text NOT NULL CHECK ("context_snapshot_hash" ~ '^[a-f0-9]{64}$'),
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"document_version_id" uuid,
	"output_hash" text CHECK ("output_hash" ~ '^[a-f0-9]{64}$'),
	"latency_ms" integer CHECK ("latency_ms" >= 0),
	"cost_usd_micros" bigint CHECK ("cost_usd_micros" >= 0),
	"credits" integer CHECK ("credits" >= 0),
	"status" text NOT NULL CHECK ("status" IN ('succeeded', 'failed', 'blocked', 'shadow')),
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_prompt_runs_brand_fk" FOREIGN KEY ("brand_id", "workspace_id") REFERENCES "brands"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_runs_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_runs_job_fk" FOREIGN KEY ("job_id", "workspace_id", "brand_id") REFERENCES "studio_jobs"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_runs_version_fk" FOREIGN KEY ("document_version_id", "project_id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_runs_prompt_version_id_studio_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "studio_prompt_versions"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_prompt_runs_prompt_release_id_studio_prompt_releases_id_fk" FOREIGN KEY ("prompt_release_id") REFERENCES "studio_prompt_releases"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_prompt_runs_portee_idx" ON "studio_prompt_runs" ("workspace_id", "brand_id", "created_at");
--> statement-breakpoint
-- Version de prompt figée après validation ; release figée hors statut/évaluation.
CREATE OR REPLACE TRIGGER "studio_prompt_versions_figees" BEFORE UPDATE OR DELETE ON "studio_prompt_versions" FOR EACH ROW EXECUTE FUNCTION "studio_prompt_version_figee"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_prompt_releases_figees" BEFORE UPDATE OR DELETE ON "studio_prompt_releases" FOR EACH ROW EXECUTE FUNCTION "studio_colonnes_mobiles"('status', 'evaluation', 'updated_at');
--> statement-breakpoint

-- ─── Variantes et liens de test ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "studio_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_version_id" uuid NOT NULL,
	"parent_variant_id" uuid,
	"media_asset_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"hypothesis" text,
	"tested_variable" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_variants_projet_fk" FOREIGN KEY ("project_id", "workspace_id", "brand_id") REFERENCES "studio_projects"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_variants_version_fk" FOREIGN KEY ("project_version_id", "project_id") REFERENCES "studio_project_versions"("id", "project_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_variants_media_fk" FOREIGN KEY ("media_asset_id", "workspace_id", "brand_id") REFERENCES "studio_assets"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_variants_portee_uq" UNIQUE ("id", "workspace_id", "brand_id"),
	CONSTRAINT "studio_variants_parent_fk" FOREIGN KEY ("parent_variant_id", "workspace_id", "brand_id") REFERENCES "studio_variants"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_variants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_variants_portee_idx" ON "studio_variants" ("workspace_id", "brand_id", "project_id");
--> statement-breakpoint
-- Une ad Adsmap teste UNE variante précise (média exact) · l'ad et la variante
-- appartiennent au même espace (clé composite sur adsmap_ads).
CREATE TABLE IF NOT EXISTS "studio_test_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"adsmap_ad_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_test_links_variant_fk" FOREIGN KEY ("variant_id", "workspace_id", "brand_id") REFERENCES "studio_variants"("id", "workspace_id", "brand_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_test_links_ad_fk" FOREIGN KEY ("adsmap_ad_id", "workspace_id") REFERENCES "adsmap_ads"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_test_links_ad_uq" UNIQUE ("adsmap_ad_id"),
	CONSTRAINT "studio_test_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_test_links_variant_idx" ON "studio_test_links" ("workspace_id", "brand_id", "variant_id");
--> statement-breakpoint

-- ─── Journal d'audit ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "studio_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"effective_role" text NOT NULL,
	"workspace_id" uuid,
	"brand_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"version_before" text,
	"version_after" text,
	"reason" text DEFAULT '' NOT NULL,
	"trace_id" text NOT NULL,
	"details" jsonb,
	CONSTRAINT "studio_audit_events_brand_fk" FOREIGN KEY ("brand_id", "workspace_id") REFERENCES "brands"("id", "workspace_id") ON DELETE RESTRICT,
	CONSTRAINT "studio_audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT,
	CONSTRAINT "studio_audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_audit_events_portee_idx" ON "studio_audit_events" ("workspace_id", "brand_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_audit_events_cible_idx" ON "studio_audit_events" ("target_type", "target_id");
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_audit_events_ajout_seul" BEFORE UPDATE OR DELETE ON "studio_audit_events" FOR EACH ROW EXECUTE FUNCTION "studio_refuser_mutation"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_audit_events_sans_vidage" BEFORE TRUNCATE ON "studio_audit_events" FOR EACH STATEMENT EXECUTE FUNCTION "studio_refuser_mutation"();
