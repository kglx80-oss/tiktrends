-- Projet · COMMENTAIRES (migration ADDITIVE · lot 10 V5 · PC D15, F15, F16).
--
-- Générée par drizzle-kit (0.24, `drizzle-kit generate` contre un instantané du
-- schéma de main à 0073) · à la main, seulement ce commentaire et les trois
-- contraintes de la table neuve (comme 0069 et 0072).
--   · `studio_comments` · un commentaire sur une VERSION du projet
--     (`version_id`, clé composée avec le projet · une version d'un autre
--     projet est refusée par Postgres) ou sur une CRÉATION (`asset_id`, clé
--     composée avec l'espace et la marque du projet) · jamais les deux
--     (`studio_comments_cible_ck`) · texte de 1 à 2 000 caractères
--     (`studio_comments_longueur_ck`, la règle vit au noyau,
--     `validerTexteCommentaire`) · `history` garde les textes remplacés
--     (`studio_comments_historique_ck` · un tableau) · `resolved_at` /
--     `resolved_by` · résolu ou rouvert, JAMAIS supprimé.
-- L'activité du projet (journal) ne s'écrit pas · elle se LIT dans
-- `studio_audit_events`, l'historique des versions, les tâches et ces
-- commentaires.
--
-- Aucune donnée existante lue ni modifiée, aucune destruction, aucune table
-- existante touchée (les clés étrangères partent de la table neuve), aucun DROP
-- ni RENAME. Rejouable · table et index « IF NOT EXISTS », clés étrangères dans
-- un bloc qui ignore l'objet déjà présent.
CREATE TABLE IF NOT EXISTS "studio_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"version_id" uuid,
	"asset_id" uuid,
	"author_id" uuid,
	"body" text NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_comments_cible_ck" CHECK (("target_type" = 'version' AND "version_id" IS NOT NULL AND "asset_id" IS NULL) OR ("target_type" = 'creation' AND "asset_id" IS NOT NULL AND "version_id" IS NULL)),
	CONSTRAINT "studio_comments_longueur_ck" CHECK (char_length("body") BETWEEN 1 AND 2000),
	CONSTRAINT "studio_comments_historique_ck" CHECK (jsonb_typeof("history") = 'array')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studio_comments" ADD CONSTRAINT "studio_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studio_comments" ADD CONSTRAINT "studio_comments_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studio_comments" ADD CONSTRAINT "studio_comments_projet_fk" FOREIGN KEY ("project_id","workspace_id","brand_id") REFERENCES "public"."studio_projects"("id","workspace_id","brand_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studio_comments" ADD CONSTRAINT "studio_comments_version_fk" FOREIGN KEY ("version_id","project_id") REFERENCES "public"."studio_project_versions"("id","project_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studio_comments" ADD CONSTRAINT "studio_comments_creation_fk" FOREIGN KEY ("asset_id","workspace_id","brand_id") REFERENCES "public"."studio_assets"("id","workspace_id","brand_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_comments_projet_idx" ON "studio_comments" USING btree ("workspace_id","brand_id","project_id","created_at");