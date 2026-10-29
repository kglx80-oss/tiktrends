-- Facturation annuelle de l'offre V2 · migration ADDITIVE.
--
-- Un abonné annuel paie une fois par an (`invoice.paid`), mais ses crédits sont
-- MENSUELS (décision du 29/10) · il faut savoir qu'il est annuel et quand lui
-- verser l'allocation suivante :
--   · `billing_interval` · « mensuel » ou « annuel », recopié par le webhook ;
--   · `next_allocation_at` · date de la prochaine allocation mensuelle d'un annuel.
-- Nullables · l'ancien code ne les lit ni ne les écrit ; un espace sans
-- abonnement V2 n'en a pas.
--
-- Rejouable : « ADD COLUMN IF NOT EXISTS ». Aucune donnée lue ni modifiée.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "billing_interval" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "next_allocation_at" timestamp with time zone;
