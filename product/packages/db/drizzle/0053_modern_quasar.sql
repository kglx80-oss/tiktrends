-- Équipe interne (plateforme) · rôles + matrice des droits éditable.
-- Migration réduite à ses SEULS objets nouveaux · le snapshot drizzle était
-- figé à 0035 (les migrations 0036-0052 n'y étaient pas), ce qui faisait
-- ré-émettre par `generate` des tables déjà en base. Le snapshot régénéré est
-- désormais complet ; ici on n'applique que le nouveau.

DO $$ BEGIN
 CREATE TYPE "public"."platform_role" AS ENUM('adminplus', 'admin', 'manager', 'dev', 'moderateur', 'membre', 'freelance', 'lecture');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_role_rights" (
	"role" "platform_role" PRIMARY KEY NOT NULL,
	"rubriques_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_staff" (
	"email" text PRIMARY KEY NOT NULL,
	"role" "platform_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Amorçage · les deux fondateurs, pour que l'écran d'équipe les montre d'emblée.
-- kguilbaux = Admin+ (sommet) ; marine = Admin (accès total aussi). Idempotent.
INSERT INTO "platform_staff" ("email", "role") VALUES
 ('kguilbaux@agence-glx.fr', 'adminplus'),
 ('marine@agence-melie.fr', 'admin')
ON CONFLICT ("email") DO NOTHING;
