-- Tour de contrôle · INCIDENTS DÉCLARÉS (migration ADDITIVE · lot 14 V5 · RJ IN01, IN02).
--
-- Générée par drizzle-kit (0.24, `drizzle-kit generate` contre un instantané du
-- schéma de main à 0074) · à la main, seulement ce commentaire, les cinq
-- contraintes de la table neuve (comme 0069, 0072 et 0074), la fonction et les
-- deux déclencheurs qui refusent la suppression (comme 0054).
--   · `platform_incidents` · un incident déclaré par l'équipe plateforme ·
--     titre (1 à 140 caractères), gravité (`mineure`, `majeure`, `critique`),
--     cause du journal des échecs (`error_log.family`, facultative), constat
--     (1 à 2 000), `notes` (tableau jsonb · texte, auteur par identifiant,
--     date), statut `ouvert` ou `clos` · un incident clos porte sa date ET sa
--     résolution (`platform_incidents_cloture_ck`), un incident ouvert n'en
--     porte aucune. Les règles vivent au noyau (`incidents-declares.ts`).
--   · JAMAIS supprimé · `platform_incidents_sans_suppression` (DELETE) et
--     `platform_incidents_sans_vidage` (TRUNCATE) lèvent une erreur. Ouvrir,
--     annoter, clore restent possibles.
-- Portée plateforme · aucune colonne d'espace, aucune lecture depuis un écran
-- client (porte `porteAdmin`).
--
-- Aucune donnée existante lue ni modifiée, aucune destruction, aucune table
-- existante touchée (les clés étrangères partent de la table neuve), aucun DROP
-- ni RENAME. Rejouable · table et index « IF NOT EXISTS », clés étrangères dans
-- un bloc qui ignore l'objet déjà présent, fonction et déclencheurs « OR REPLACE ».
CREATE TABLE IF NOT EXISTS "platform_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"severity" text DEFAULT 'majeure' NOT NULL,
	"cause" text,
	"description" text NOT NULL,
	"status" text DEFAULT 'ouvert' NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opened_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_incidents_titre_ck" CHECK (char_length("title") BETWEEN 1 AND 140),
	CONSTRAINT "platform_incidents_gravite_ck" CHECK ("severity" IN ('mineure', 'majeure', 'critique')),
	CONSTRAINT "platform_incidents_textes_ck" CHECK (char_length("description") BETWEEN 1 AND 2000 AND ("resolution" IS NULL OR char_length("resolution") BETWEEN 1 AND 2000)),
	CONSTRAINT "platform_incidents_notes_ck" CHECK (jsonb_typeof("notes") = 'array'),
	CONSTRAINT "platform_incidents_cloture_ck" CHECK (("status" = 'ouvert' AND "closed_at" IS NULL AND "resolution" IS NULL) OR ("status" = 'clos' AND "closed_at" IS NOT NULL AND "resolution" IS NOT NULL))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_incidents" ADD CONSTRAINT "platform_incidents_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_incidents" ADD CONSTRAINT "platform_incidents_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_incidents_statut_idx" ON "platform_incidents" USING btree ("status","created_at");
--> statement-breakpoint
-- Un incident se clôt, il ne se supprime pas · DELETE et TRUNCATE refusés.
CREATE OR REPLACE FUNCTION "platform_incident_jamais_supprime"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'INCIDENT_JAMAIS_SUPPRIME · % refusé sur %, un incident se clôt, il ne se supprime pas', TG_OP, TG_TABLE_NAME;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "platform_incidents_sans_suppression" BEFORE DELETE ON "platform_incidents" FOR EACH ROW EXECUTE FUNCTION "platform_incident_jamais_supprime"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "platform_incidents_sans_vidage" BEFORE TRUNCATE ON "platform_incidents" FOR EACH STATEMENT EXECUTE FUNCTION "platform_incident_jamais_supprime"();
