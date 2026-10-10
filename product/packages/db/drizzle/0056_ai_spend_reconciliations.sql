-- R5 · réconciliation d'une dépense incertaine (migration ADDITIVE, une table).
--
-- Une ligne `ai_spend` « à réconcilier » (0055) reste comptée au MAXIMUM
-- réservé jusqu'à ce qu'un humain la rapproche de la facture du fournisseur.
-- Ce rapprochement n'efface rien : il AJOUTE une ligne ici (montant facturé en
-- micro-unités, devise, identifiant de la preuve fournisseur, motif, auteur,
-- date, clé d'idempotence). La ligne `ai_spend` garde son montant réservé et sa
-- cause ; le plafond retient le montant facturé d'ici (`depenseDepuis`).
--
-- Ajout seul : modification, suppression et vidage refusés (déclencheurs sur
-- `studio_refuser_mutation`, créée par 0054). Une ligne `ai_spend` réconciliée
-- ne peut plus être supprimée (clé étrangère RESTRICT). Ces colonnes sont
-- l'audit du geste · aucune table d'audit plateforme n'existe.
--
-- Rejouable : table, contraintes, index et déclencheurs « IF NOT EXISTS »,
-- « OR REPLACE » ou dans un bloc qui ignore l'objet déjà présent. Aucune
-- donnée existante n'est lue ni modifiée.
CREATE TABLE IF NOT EXISTS "ai_spend_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_spend_id" uuid NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"billed_micros" bigint NOT NULL,
	"currency" text NOT NULL,
	"provider_ref" text NOT NULL,
	"reason" text NOT NULL,
	"author_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_spend_reconciliations_ligne_uq" UNIQUE("ai_spend_id"),
	CONSTRAINT "ai_spend_reconciliations_cle_uq" UNIQUE("idempotency_key"),
	-- Une devise non gérée est REFUSÉE, jamais convertie à un taux inventé.
	CONSTRAINT "ai_spend_reconciliations_devise_ck" CHECK ("currency" IN ('USD')),
	CONSTRAINT "ai_spend_reconciliations_montants_ck" CHECK ("billed_micros" >= 0 AND "reserved_micros" >= 0),
	CONSTRAINT "ai_spend_reconciliations_preuve_ck" CHECK (length(btrim("provider_ref")) >= 3),
	CONSTRAINT "ai_spend_reconciliations_motif_ck" CHECK (length(btrim("reason")) >= 3),
	CONSTRAINT "ai_spend_reconciliations_cle_ck" CHECK (length("idempotency_key") >= 8)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_spend_reconciliations" ADD CONSTRAINT "ai_spend_reconciliations_ai_spend_id_ai_spend_id_fk" FOREIGN KEY ("ai_spend_id") REFERENCES "public"."ai_spend"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_spend_reconciliations" ADD CONSTRAINT "ai_spend_reconciliations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_spend_reconciliations_date_idx" ON "ai_spend_reconciliations" USING btree ("created_at");
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "ai_spend_reconciliations_ajout_seul" BEFORE UPDATE OR DELETE ON "ai_spend_reconciliations" FOR EACH ROW EXECUTE FUNCTION "studio_refuser_mutation"();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "ai_spend_reconciliations_sans_vidage" BEFORE TRUNCATE ON "ai_spend_reconciliations" FOR EACH STATEMENT EXECUTE FUNCTION "studio_refuser_mutation"();
