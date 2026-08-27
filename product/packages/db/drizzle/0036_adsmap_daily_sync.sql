-- ADSMAP · synchro quotidienne des métriques.
--
-- `ad_instances` et `metrics_daily` étaient déclarées mais jamais écrites. La
-- synchro les réveille, et un upsert quotidien a besoin d'une clé : sans elle,
-- chaque passage insérerait un doublon d'annonce et les agrégats gonfleraient
-- silencieusement d'un jour sur l'autre.
CREATE UNIQUE INDEX IF NOT EXISTS "ad_instances_external_uk"
  ON "ad_instances" ("platform", "external_ad_id");
--> statement-breakpoint
-- La fenêtre d'évaluation lit toujours par annonce ET par date.
CREATE INDEX IF NOT EXISTS "metrics_daily_date_idx" ON "metrics_daily" ("date");
--> statement-breakpoint
-- Quand la carte a-t-elle été mesurée pour la dernière fois. Affiché tel quel :
-- un verdict de la semaine dernière présenté sans date se lit comme un verdict
-- d'aujourd'hui.
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "adsmap_synced_at" timestamp with time zone;
