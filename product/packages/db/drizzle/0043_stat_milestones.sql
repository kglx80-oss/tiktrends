-- Quand la mémoire d'une marque a appris quelque chose.
--
-- On savait à tout moment ce qu'une marque avait mesuré · on ne savait pas
-- QUAND elle l'avait su. Un état sans historique répond à « où en est-on » et à
-- rien d'autre : ni « ta mémoire vient de trancher sur l'UGC », ni « est-ce que
-- Jarvis s'améliore », qui demandent tous deux de comparer deux dates.
--
-- Une ligne par (marque, dimension, clé), posée la PREMIÈRE fois que la
-- dimension franchit le seuil de conclusion. Elle ne bouge plus ensuite : ce
-- qu'on veut savoir est quand elle a commencé à compter, pas quand elle a
-- grossi.
--
-- `backfilled` marque les jalons du premier passage sur une marque. Six mois de
-- tests franchissent alors le seuil le même jour · les annoncer présenterait
-- une lecture de base comme un apprentissage. On perd la date exacte de ce qui
-- s'est produit avant qu'on regarde, et c'est le prix honnête de ne pas l'avoir
-- enregistré à l'époque.
CREATE TABLE IF NOT EXISTS adsmap_stat_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id      uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  dimension     text NOT NULL,
  key           text NOT NULL,
  n_conclusive  integer NOT NULL DEFAULT 0,
  hit_rate      double precision,
  backfilled    boolean NOT NULL DEFAULT false,
  reached_at    timestamptz NOT NULL DEFAULT now()
);

-- Le jalon est unique par axe · l'écriture est idempotente (ON CONFLICT DO
-- NOTHING), ce qui garantit que `reached_at` reste la première date vue.
CREATE UNIQUE INDEX IF NOT EXISTS adsmap_stat_milestones_uniq
  ON adsmap_stat_milestones (brand_id, dimension, key);

CREATE INDEX IF NOT EXISTS adsmap_stat_milestones_brand_idx
  ON adsmap_stat_milestones (brand_id, reached_at);
