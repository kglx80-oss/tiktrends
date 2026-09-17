-- Dater la dernière synchro de CHAQUE connecteur · N09.
--
-- Il n'existait qu'une colonne `insights_synced_at`, partagée entre Shopify et
-- Meta. Une synchro Shopify l'écrasait à `now()`, alors même que les données
-- Meta dataient de plusieurs jours · l'écran Analytics et le Radar la lisaient
-- pourtant comme « performances Meta synchronisées à l'instant ». Un horodatage
-- partagé ne peut pas dire la fraîcheur de deux flux qui se rafraîchissent
-- séparément.
--
-- On sépare · une date par connecteur. On rétro-remplit les deux depuis la
-- valeur partagée existante · au pire elles sont trop optimistes d'un flux, la
-- prochaine synchro de chaque connecteur les recale sur la vérité.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS shopify_synced_at timestamptz;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS meta_synced_at timestamptz;

UPDATE brands
   SET shopify_synced_at = insights_synced_at
 WHERE shopify_synced_at IS NULL
   AND insights_synced_at IS NOT NULL
   AND commerce_insights_json IS NOT NULL;

UPDATE brands
   SET meta_synced_at = insights_synced_at
 WHERE meta_synced_at IS NULL
   AND insights_synced_at IS NOT NULL
   AND ads_insights_json IS NOT NULL;
