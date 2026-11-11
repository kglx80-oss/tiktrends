-- Canvas de lignée · NOTES sur un nœud (migration ADDITIVE · lot 11 V5 · PC E11).
--
-- Générée par drizzle-kit (0.24, `drizzle-kit generate` contre un instantané du
-- schéma de main à 0075) · à la main, seulement ce commentaire, les quatre
-- contraintes de la table neuve (comme 0069, 0072, 0074 et 0075), la fonction
-- et les deux déclencheurs qui refusent la suppression (comme 0054 et 0075).
--   · `studio_lineage_notes` · une note attachée à UN NŒUD de la lignée d'un
--     projet (clé composée avec l'espace et la marque du projet) · `node_key`
--     · l'identifiant de lignée du nœud (`brief:<version>`, `creation:<variante>`,
--     `marque`…), fait du type et de la clé primaire de la donnée projetée ·
--     jamais un lien (`studio_lineage_notes_noeud_ck` refuse `>` et les
--     espaces, 200 caractères au plus) · `node_label` · le libellé du nœud au
--     moment de l'écriture (1 à 300), qui garde la note lisible quand la
--     donnée disparaît (« Notes sans nœud ») · texte de 1 à 2 000 caractères
--     (`studio_lineage_notes_longueur_ck`, la règle des commentaires au noyau)
--     · `history` garde les textes remplacés (un tableau) · résolue ou
--     rouverte (`resolved_at` / `resolved_by`).
--   · JAMAIS supprimée · `studio_lineage_notes_sans_suppression` (DELETE) et
--     `studio_lineage_notes_sans_vidage` (TRUNCATE) lèvent une erreur.
--
-- Aucune donnée existante lue ni modifiée, aucune destruction, aucune table
-- existante touchée (les clés étrangères partent de la table neuve), aucun DROP
-- ni RENAME. Rejouable · table et index « IF NOT EXISTS », clés étrangères dans
-- un bloc qui ignore l'objet déjà présent, fonction et déclencheurs « OR REPLACE ».
CREATE TABLE IF NOT EXISTS "studio_lineage_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"node_label" text NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_lineage_notes_noeud_ck" CHECK (char_length("node_key") BETWEEN 1 AND 200 AND "node_key" ~ '^(marque|[a-z]+(-[a-z]+)?:[^>[:space:]]+)$'),
	CONSTRAINT "studio_lineage_notes_libelle_ck" CHECK (char_length("node_label") BETWEEN 1 AND 300),
	CONSTRAINT "studio_lineage_notes_longueur_ck" CHECK (char_length("body") BETWEEN 1 AND 2000),
	CONSTRAINT "studio_lineage_notes_historique_ck" CHECK (jsonb_typeof("history") = 'array')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studio_lineage_notes" ADD CONSTRAINT "studio_lineage_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studio_lineage_notes" ADD CONSTRAINT "studio_lineage_notes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studio_lineage_notes" ADD CONSTRAINT "studio_lineage_notes_projet_fk" FOREIGN KEY ("project_id","workspace_id","brand_id") REFERENCES "public"."studio_projects"("id","workspace_id","brand_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_lineage_notes_projet_idx" ON "studio_lineage_notes" USING btree ("workspace_id","brand_id","project_id","created_at");
--> statement-breakpoint
-- Une note se résout, elle ne se supprime pas · DELETE et TRUNCATE refusés.
CREATE OR REPLACE FUNCTION "studio_lineage_note_jamais_supprimee"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'NOTE_JAMAIS_SUPPRIMEE · % refusé sur %, une note se résout, elle ne se supprime pas', TG_OP, TG_TABLE_NAME;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_lineage_notes_sans_suppression" BEFORE DELETE ON "studio_lineage_notes" FOR EACH ROW EXECUTE FUNCTION "studio_lineage_note_jamais_supprimee"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "studio_lineage_notes_sans_vidage" BEFORE TRUNCATE ON "studio_lineage_notes" FOR EACH STATEMENT EXECUTE FUNCTION "studio_lineage_note_jamais_supprimee"();
