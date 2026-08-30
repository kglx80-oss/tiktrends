-- Prompts de l'utilisateur · sa direction artistique, écrite par lui.
--
-- ── Pourquoi cette table existe ────────────────────────────────────────────
--
-- Le Studio composait ses visuels à partir de huit « univers visuels » écrits en
-- dur dans le code. On pouvait en CHOISIR un, jamais en écrire un. Une agence
-- qui a mis des années à trouver sa manière de filmer ne va pas l'abandonner
-- parce que notre menu ne la contient pas.
--
-- ── Ce qui la distingue d'un champ de texte ────────────────────────────────
--
-- Un prompt tapé une fois produit une image et disparaît. Ici il est nommé,
-- réutilisable, et surtout RATTACHÉ aux créas qu'il produit · on finit donc par
-- savoir combien de tests il a nourris et combien ont gagné.
--
-- Le rattachement ne vit pas dans cette table : il est écrit dans
-- `generations.input_json`, comme la trace de mémoire, et se relit par le même
-- pont `concepts.source_ref -> generation_id` que l'attribution. Une colonne de
-- plus ici aurait dupliqué un lien qui existe déjà.
CREATE TABLE IF NOT EXISTS "creative_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  -- `null` = disponible pour toutes les marques de l'espace. Une DA maison
  -- traverse souvent plusieurs marques d'une même agence.
  "brand_id" uuid REFERENCES "brands"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'both',        -- image | video | both
  "prompt" text NOT NULL,
  "negative" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  -- On archive au lieu de supprimer : les créas déjà produites continuent de
  -- pointer dessus, et un bilan qui perd son intitulé devient illisible.
  "archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "creative_presets_name" UNIQUE ("workspace_id", "brand_id", "name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_presets_ws_idx"
  ON "creative_presets" ("workspace_id", "archived");
