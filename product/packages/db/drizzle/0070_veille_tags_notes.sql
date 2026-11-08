-- Veille · TAGS, NOTE et COLLECTIONS MULTIPLES des sauvegardes (migration ADDITIVE · lot 6 V5).
--
-- Générée par drizzle-kit (0.24, `drizzle-kit generate` contre un instantané du
-- schéma de main à 0069) · seul ce commentaire est ajouté à la main.
--   · `veille_tags` · le vocabulaire des tags posés à la main, par espace ET par
--     marque (`brand_id` NULL = les sauvegardes faites sans marque active) ·
--     `name_key` = la clé de comparaison du noyau (`cleTag` · casse, espaces et
--     accents fusionnés), unique dans son vocabulaire (deux index partiels, un
--     NULL ne heurtant jamais un autre NULL) ;
--   · `veille_tags_sauvegardes` · le lien sauvegarde ↔ tag · retirer un tag ne
--     supprime que ce lien · index sur `tag_id` pour les lectures filtrées ;
--   · `saved_ad_collections` · une ligne par collection d'une sauvegarde ·
--     `saved_ads.folder` reste écrit (= la première) · une sauvegarde d'avant
--     ce lot n'a aucune ligne ici, son dossier fait foi.
-- La note n'en demande pas · `saved_ads.note` existe depuis l'origine.
--
-- Aucune donnée existante lue ni modifiée, aucune destruction, aucune colonne
-- ajoutée à une table existante. Rejouable : tables et index « IF NOT EXISTS »,
-- contraintes dans un bloc qui ignore l'objet déjà présent. Tables CRÉÉES ici
-- (vides) · leurs contraintes sont validées d'emblée, sans scan.
CREATE TABLE IF NOT EXISTS "saved_ad_collections" (
	"saved_ad_id" uuid NOT NULL,
	"name" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_ad_collections_saved_ad_id_name_pk" PRIMARY KEY("saved_ad_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "veille_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "veille_tags_sauvegardes" (
	"saved_ad_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "veille_tags_sauvegardes_saved_ad_id_tag_id_pk" PRIMARY KEY("saved_ad_id","tag_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_ad_collections" ADD CONSTRAINT "saved_ad_collections_saved_ad_id_saved_ads_id_fk" FOREIGN KEY ("saved_ad_id") REFERENCES "public"."saved_ads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_ad_collections" ADD CONSTRAINT "saved_ad_collections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veille_tags" ADD CONSTRAINT "veille_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veille_tags" ADD CONSTRAINT "veille_tags_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veille_tags" ADD CONSTRAINT "veille_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veille_tags_sauvegardes" ADD CONSTRAINT "veille_tags_sauvegardes_saved_ad_id_saved_ads_id_fk" FOREIGN KEY ("saved_ad_id") REFERENCES "public"."saved_ads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veille_tags_sauvegardes" ADD CONSTRAINT "veille_tags_sauvegardes_tag_id_veille_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."veille_tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veille_tags_sauvegardes" ADD CONSTRAINT "veille_tags_sauvegardes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veille_tags_sauvegardes" ADD CONSTRAINT "veille_tags_sauvegardes_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_ad_collections_espace_idx" ON "saved_ad_collections" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "veille_tags_marque_cle_uniq" ON "veille_tags" USING btree ("workspace_id","brand_id","name_key") WHERE "veille_tags"."brand_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "veille_tags_espace_cle_uniq" ON "veille_tags" USING btree ("workspace_id","name_key") WHERE "veille_tags"."brand_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "veille_tags_sauvegardes_tag_idx" ON "veille_tags_sauvegardes" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "veille_tags_sauvegardes_espace_idx" ON "veille_tags_sauvegardes" USING btree ("workspace_id");
