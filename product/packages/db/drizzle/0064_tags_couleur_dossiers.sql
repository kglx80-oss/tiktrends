-- Bibliothèque · TAGS DE COULEUR des dossiers (migration ADDITIVE).
--
-- La maquette V5 pose un tag de couleur sur un DOSSIER (« Validé », « À
-- valider », « Campagne »…), le montre dans l'arbre et sur la carte, et filtre
-- l'écran par tag. Une colonne `color_tag` sur `library_folders` · nullable
-- (aucun tag), clé du catalogue du noyau (`TAGS_COULEUR`,
-- packages/core/src/spatial/bibliotheque/tags-couleur.ts). `assets.tags` reste
-- aux tags posés par l'analyse IA · rien n'est détourné.
--
-- Aucune donnée lue ni modifiée, aucune destruction, aucune colonne NOT NULL ·
-- les dossiers existants restent sans tag. Rejouable : « ADD COLUMN IF NOT
-- EXISTS », contrainte dans un bloc qui ignore l'objet déjà présent.
--
-- Le CHECK borne la colonne au catalogue (NULL permis) · posé « NOT VALID »
-- (inscription sans scan sous ACCESS EXCLUSIVE, le timer déploie chaque minute)
-- puis validé sous SHARE UPDATE EXCLUSIVE, non bloquant pour les écritures.
-- Les lignes existantes ont `color_tag` à NULL : rien à rejeter. Valider une
-- contrainte déjà valide est un no-op · rejouable.
ALTER TABLE "library_folders" ADD COLUMN IF NOT EXISTS "color_tag" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_color_tag_ck" CHECK ("color_tag" IN ('rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose', 'gris')) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "library_folders" VALIDATE CONSTRAINT "library_folders_color_tag_ck";
