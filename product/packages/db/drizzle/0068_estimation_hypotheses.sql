-- Hypothèses libres · ESTIMATION D'ÉQUIPE de la priorité (migration ADDITIVE).
--
-- Le tableau des hypothèses (Résultats · Hypothèses, lot 1 V5) range une
-- hypothèse libre · une ad en brouillon de son concept, sa phrase dans
-- `hypothesis`. La maquette porte une jauge « Priorité estimée (impact,
-- confiance, effort) » · une estimation saisie par l'équipe, que rien en base
-- ne portait (la priorité venait du pré-score du concept ou du rang d'une
-- suite). `source_ref_json` dit d'où vient l'ad · une note qu'on corrige n'y a
-- pas sa place.
--
-- Trois colonnes `smallint` NULLABLES sur `adsmap_ads`, chacune bornée de 1 à 3
-- par une contrainte de colonne posée DANS l'ajout (rejouable avec lui : la
-- colonne existe déjà ⇒ l'instruction entière est sautée). Les ads existantes
-- restent à NULL · « à évaluer » ou pré-score du concept, comme avant. La règle
-- de priorité (moyenne, effort inversé) vit au noyau (`prioriteEstimee`,
-- packages/core/src/spatial/resultats/hypotheses-libres.ts).
--
-- Aucune donnée lue ni modifiée, aucune destruction, aucune colonne NOT NULL.
-- Rejouable : « ADD COLUMN IF NOT EXISTS ».
ALTER TABLE "adsmap_ads" ADD COLUMN IF NOT EXISTS "ice_impact" smallint CHECK ("ice_impact" BETWEEN 1 AND 3);
--> statement-breakpoint
ALTER TABLE "adsmap_ads" ADD COLUMN IF NOT EXISTS "ice_confidence" smallint CHECK ("ice_confidence" BETWEEN 1 AND 3);
--> statement-breakpoint
ALTER TABLE "adsmap_ads" ADD COLUMN IF NOT EXISTS "ice_effort" smallint CHECK ("ice_effort" BETWEEN 1 AND 3);
