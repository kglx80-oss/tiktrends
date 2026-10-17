-- Bibliothèque V5 · fondation des DOSSIERS et des DROITS (migration ADDITIVE).
--
-- Une table `library_folders` (arborescence par espace, éventuellement par
-- marque, corbeille réversible, dossiers système verrouillés) et trois colonnes
-- sur `assets` : `folder_id` (rangement, FK ON DELETE SET NULL · supprimer un
-- dossier DÉCLASSE ses médias, il ne les détruit pas), `rights` (droit d'usage,
-- clé parmi le catalogue normatif du noyau) et `deleted_at` (corbeille).
--
-- Aucune écriture de données, aucune destruction, aucune colonne NOT NULL
-- ajoutée à une table existante. Rejouable : table et index « IF NOT EXISTS »,
-- colonnes « ADD COLUMN IF NOT EXISTS », contraintes dans un bloc qui ignore
-- l'objet déjà présent. Aucune donnée existante n'est lue ni modifiée : les
-- médias déjà là restent non classés (`folder_id`, `rights`, `deleted_at` nuls).
--
-- Le CHECK sur `rights` borne la colonne au catalogue normatif
-- (`DROITS_ASSET`, packages/core/src/bibliotheque-dossiers.ts) · NULL reste
-- permis (non classé). La règle « quels droits passent en pub » vit au noyau.
CREATE TABLE IF NOT EXISTS "library_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"parent_id" uuid,
	"name" text NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "rights" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."library_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_folders_portee_idx" ON "library_folders" USING btree ("workspace_id","brand_id","parent_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_folder_id_library_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."library_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_folder_idx" ON "assets" USING btree ("folder_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_rights_ck" CHECK ("rights" IN ('photo_marque', 'ugc_accord', 'banque_images', 'a_preciser'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
