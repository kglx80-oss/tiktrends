-- Provenance factuelle d'une créa de marché · CDC v8 · N03.
--
-- « Ce que fait le marché » mêlait, sous une même marque, des concurrents suivis
-- délibérément et des créas croisées au hasard d'un balayage radar (rasage,
-- pieds, coloriage, électronique proposés à Klorea sans dire d'où ils venaient).
-- Le lecteur ne pouvait pas comprendre pourquoi une inspiration hors catégorie
-- lui était montrée, ni l'écarter en connaissance de cause.
--
-- On stocke la provenance FACTUELLE · comment la créa est entrée POUR cette
-- marque. `followed` = marque suivie · `radar` = repérée au balayage · `null` =
-- historique sans preuve, non qualifié. La pertinence (concurrent direct /
-- inspiration adjacente) s'en déduit par marque, elle n'est jamais figée
-- globalement · la même pub peut être un concurrent suivi pour l'une et une
-- inspiration adjacente pour l'autre, car chaque ligne est PAR marque.
--
-- Colonne nullable, sans défaut · rétro-compatible. On qualifie les anciennes
-- créas UNIQUEMENT sur un fait déjà stocké · un `radar_signal` présent prouve
-- une entrée au radar. Les autres restent `null` · on n'invente pas leur
-- provenance, et « non qualifié » est une réponse valable.
ALTER TABLE market_creatives ADD COLUMN IF NOT EXISTS provenance text;

UPDATE market_creatives
   SET provenance = 'radar'
 WHERE provenance IS NULL
   AND radar_signal IS NOT NULL;
