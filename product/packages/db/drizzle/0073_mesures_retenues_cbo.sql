-- Adsmap · la priorité des mesures ÉCRITE, et le CBO gardé sur l'instance
-- (migration ADDITIVE · lecture rapide des fenêtres de mesures).
--
-- Générée par drizzle-kit (0.24, `drizzle-kit generate` contre un instantané du
-- schéma de main à 0072) · à la main, seulement ce commentaire et « IF NOT
-- EXISTS » sur les deux ajouts de colonne (rejouables, comme 0068, 0069, 0071
-- et 0072).
--   · `adsmap_mesures_csv.retenue` · la décision de priorité (la connexion Meta
--     l'emporte le même jour, la journée l'emporte sur la période) écrite par
--     entrée à chaque import, synchro ou recalcul · `true` compte, `false`
--     écartée · NULLABLE, NULL pour les entrées d'avant (la lecture relit alors
--     leur ad entrée par entrée, par la même règle du noyau · aucun backfill) ;
--   · `ad_instances.campaign_budget_optimization` · le CBO lu chez Meta par la
--     synchro · NULLABLE, NULL pour les instances d'avant (le contrôle du lot
--     se rabat sur le relais `protocol_check_json.cboMeta`) ;
--   · `adsmap_mesures_csv_retenue_idx` (partiel, entrées retenues) · la somme
--     d'une fenêtre par premier jour · `adsmap_mesures_csv_a_marquer_idx`
--     (partiel, entrées sans marque) · les ads à relire une à une.
--
-- Aucune donnée existante lue ni modifiée, aucune destruction, aucune colonne
-- NOT NULL ni défaut ajoutés, aucun DROP ni RENAME. Rejouable · colonnes
-- « ADD COLUMN IF NOT EXISTS », index « IF NOT EXISTS ».
ALTER TABLE "ad_instances" ADD COLUMN IF NOT EXISTS "campaign_budget_optimization" boolean;--> statement-breakpoint
ALTER TABLE "adsmap_mesures_csv" ADD COLUMN IF NOT EXISTS "retenue" boolean;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_mesures_csv_retenue_idx" ON "adsmap_mesures_csv" USING btree ("brand_id","date_debut") WHERE "adsmap_mesures_csv"."retenue" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_mesures_csv_a_marquer_idx" ON "adsmap_mesures_csv" USING btree ("brand_id","ad_id") WHERE "adsmap_mesures_csv"."retenue" is null;
