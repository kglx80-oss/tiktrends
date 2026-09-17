-- La preuve d'un fait porté par une pub · N04-suite.
--
-- Le badge « Prête à diffuser » se voyait refusé dès qu'une pub portait un fait
-- (témoignage, offre, chiffre) · mais rien ne permettait de VÉRIFIER ce fait, ni
-- de savoir contre quoi. Cette table relie chaque fait à une preuve consultable :
-- une source, une version du contenu validé, un validateur, une date.
--
-- Elle est APPEND-ONLY · vérifier ajoute une ligne, ne remplace jamais. La
-- validation ACTIVE d'un couple (rendu, fait) est la plus récente. Modifier le
-- contenu (prix, citation, référence) ne touche AUCUNE ligne : la signature
-- enregistrée ne colle simplement plus au contenu actuel, la validation devient
-- caduque, et l'historique approuvé reste intact. Ré-valider ajoute une ligne.
CREATE TABLE IF NOT EXISTS ad_fact_validations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  generation_id  uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  fact_cle       text NOT NULL,
  source         text NOT NULL,
  signature      text NOT NULL,
  version        text NOT NULL,
  validated_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  validated_at   timestamptz NOT NULL DEFAULT now()
);

-- Lire la preuve ACTIVE d'un fait · la plus récente par (rendu, fait).
CREATE INDEX IF NOT EXISTS ad_fact_validations_latest_idx
  ON ad_fact_validations (generation_id, fact_cle, validated_at DESC);

CREATE INDEX IF NOT EXISTS ad_fact_validations_ws_idx
  ON ad_fact_validations (workspace_id);
