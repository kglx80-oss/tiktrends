-- Radar de veille · la nuit qui vient à toi.
--
-- ── Pourquoi c'est ÉTEINT par défaut ────────────────────────────────────────
--
-- C'est la première fonction du produit qui dépense en arrière-plan, sans que
-- personne n'ait cliqué. Une dépense qu'on n'a pas déclenchée est une dépense
-- qu'on ne surveille pas · elle doit donc être armée explicitement, marque par
-- marque, et jamais héritée d'un réglage global.
--
-- `radar_cap` est un nombre de créas par nuit, pas un budget en euros : un
-- plafond en euros se traduit mal en décision (« il reste 0,03 $, on analyse ou
-- pas ? »), là où un plafond en unités est vérifiable avant de dépenser.
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "radar_armed" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "radar_cap" integer NOT NULL DEFAULT 3;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "radar_last_run_at" timestamp with time zone;
--> statement-breakpoint

-- Ce qui a fait entrer cette créa dans la mémoire de marché.
--
-- `null` = analyse déclenchée à la main. Les valeurs viennent de `RadarSignal` :
-- crossed_proven, reach_growing, advertiser_scaling. On la garde pour pouvoir
-- dire POURQUOI on a payé cette description-là · sans elle, la sélection
-- nocturne serait une boîte noire six mois plus tard.
ALTER TABLE "market_creatives" ADD COLUMN IF NOT EXISTS "radar_signal" text;
--> statement-breakpoint

-- Quand on l'a signalée à l'utilisateur.
--
-- Une créa qui reste en ligne franchit son cap une seule fois · la resignaler
-- chaque nuit transformerait le radar en bruit, et un fil de bruit ne se lit
-- plus. `null` = jamais signalée.
ALTER TABLE "market_creatives" ADD COLUMN IF NOT EXISTS "reported_at" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "market_creatives_radar_idx"
  ON "market_creatives" ("workspace_id", "reported_at");
