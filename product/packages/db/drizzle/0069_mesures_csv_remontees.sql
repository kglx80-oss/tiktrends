-- Résultats · MESURES IMPORTÉES (export Ads Manager) et JOURNAL DES REMONTÉES (migration ADDITIVE).
--
-- Lot 4 V5 · sans mesures, aucun lot ne se conclut. `metrics_daily` dépend des
-- instances synchronisées (`ad_instances`) et seule la synchro Meta l'écrit ·
-- on n'y touche pas. Les mesures d'un fichier se posent À CÔTÉ :
--   · `adsmap_mesures_csv` · une ligne par ad et par période (journée ou bloc
--     exporté), clé (ad, début, fin) · réimporter le même fichier réécrit les
--     mêmes lignes, rien ne double. La priorité face à la connexion Meta (la
--     journée Meta l'emporte) se décide au noyau (`retenirMesures`) ;
--   · `adsmap_remontees` · le journal des passages (connexion Meta la nuit ou au
--     bouton, import d'un fichier), réussis ou non · un CODE d'échec, jamais le
--     message brut. Connexions y lit la dernière remontée et son erreur ;
--   · `brands.adsmap_remontee_suspendue_le` · NULLABLE · NULL = remontée
--     nocturne active, comme aujourd'hui pour toutes les marques.
--
-- Aucune donnée existante lue ni modifiée, aucune destruction, aucune colonne
-- NOT NULL ajoutée à une table existante. Rejouable : tables, index « IF NOT
-- EXISTS », colonne « ADD COLUMN IF NOT EXISTS », contraintes dans un bloc qui
-- ignore l'objet déjà présent. Les tables sont CRÉÉES ici (vides) · leurs
-- contraintes sont validées d'emblée, sans scan.
CREATE TABLE IF NOT EXISTS "adsmap_mesures_csv" (
	"ad_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"spend" double precision NOT NULL,
	"impressions" integer NOT NULL,
	"link_clicks" integer DEFAULT 0 NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"reach" integer,
	"clicks" integer,
	"purchase_value" double precision,
	"video_3s" integer,
	"thruplays" integer,
	"video_p50" integer,
	"add_to_cart" integer,
	"landing_views" integer,
	"meta_ad_id" text,
	"nom_annonce" text,
	"campagne" text,
	"campagne_id" text,
	"ensemble" text,
	"ensemble_id" text,
	"budget_jour" double precision,
	"cbo" boolean DEFAULT false NOT NULL,
	"fichier" text,
	"importe_par" uuid,
	"importe_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adsmap_mesures_csv_ad_id_date_debut_date_fin_pk" PRIMARY KEY("ad_id","date_debut","date_fin"),
	CONSTRAINT "adsmap_mesures_csv_periode_ck" CHECK ("date_fin" >= "date_debut")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_remontees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" text NOT NULL,
	"declencheur" text NOT NULL,
	"le" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"motif" text,
	"resume_json" jsonb,
	CONSTRAINT "adsmap_remontees_source_ck" CHECK ("source" IN ('meta', 'csv')),
	CONSTRAINT "adsmap_remontees_declencheur_ck" CHECK ("declencheur" IN ('nuit', 'bouton', 'import')),
	CONSTRAINT "adsmap_remontees_motif_ck" CHECK ("motif" IS NULL OR "motif" IN ('non_connecte', 'jeton', 'droits', 'limite', 'reseau', 'autre'))
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "adsmap_remontee_suspendue_le" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_mesures_csv" ADD CONSTRAINT "adsmap_mesures_csv_ad_id_adsmap_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."adsmap_ads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_mesures_csv" ADD CONSTRAINT "adsmap_mesures_csv_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_mesures_csv" ADD CONSTRAINT "adsmap_mesures_csv_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_mesures_csv" ADD CONSTRAINT "adsmap_mesures_csv_importe_par_users_id_fk" FOREIGN KEY ("importe_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_remontees" ADD CONSTRAINT "adsmap_remontees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_remontees" ADD CONSTRAINT "adsmap_remontees_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_mesures_csv_brand_idx" ON "adsmap_mesures_csv" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_remontees_brand_idx" ON "adsmap_remontees" USING btree ("brand_id","le");
