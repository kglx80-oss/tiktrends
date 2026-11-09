-- Marque · OFFRES et ALLÉGATIONS (migration ADDITIVE · lot 9 bis V5 · VB M07, PR04).
--
-- Générée par drizzle-kit (0.24, `drizzle-kit generate` contre un instantané du
-- schéma de main à 0071) · à la main, seulement ce commentaire, « IF NOT
-- EXISTS » sur les trois ajouts de colonne (rejouables, comme 0068, 0069 et
-- 0071) et la contrainte de statut dans la table neuve (comme 0069).
--   · `adsmap_offers` (la table des offres qui existe depuis 0033, déjà citée
--     par `adsmap_ads.offer_id` · il n'y a qu'une table d'offres) gagne
--     `kind` (le type · remise, bundle, garantie, livraison… · liste au noyau,
--     `TYPES_OFFRE`), `conditions` (en clair) et `updated_at` · NULLABLES, NULL
--     pour les offres d'avant. « Archiver » réutilise `active` (déjà là) ·
--     rien ne se supprime ;
--   · `brand_claims` · les allégations de la marque · texte, preuve ou source,
--     statut `a_prouver` (défaut) ou `prouvee` (contrainte), `archived_at`
--     (archivée, jamais supprimée) · la règle (une allégation prouvée cite sa
--     preuve) vit au noyau (`validerAllegation`).
-- Le lien d'une offre aux tests se LIT (l'offre de l'ad Adsmap et le fait
-- d'offre du brief du projet), sans colonne nouvelle.
--
-- Aucune donnée existante lue ni modifiée, aucune destruction, aucune colonne
-- NOT NULL ajoutée à une table existante, aucun DROP ni RENAME. Rejouable :
-- table et index « IF NOT EXISTS », colonnes « ADD COLUMN IF NOT EXISTS »,
-- clés étrangères dans un bloc qui ignore l'objet déjà présent.
CREATE TABLE IF NOT EXISTS "brand_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"text" text NOT NULL,
	"proof" text,
	"status" text DEFAULT 'a_prouver' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_claims_status_ck" CHECK ("status" IN ('a_prouver', 'prouvee'))
);
--> statement-breakpoint
ALTER TABLE "adsmap_offers" ADD COLUMN IF NOT EXISTS "kind" text;--> statement-breakpoint
ALTER TABLE "adsmap_offers" ADD COLUMN IF NOT EXISTS "conditions" text;--> statement-breakpoint
ALTER TABLE "adsmap_offers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_claims" ADD CONSTRAINT "brand_claims_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_claims" ADD CONSTRAINT "brand_claims_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_claims_brand_idx" ON "brand_claims" USING btree ("brand_id");