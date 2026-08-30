-- Conversation avec Jarvis.
--
-- ── Pourquoi ça vit en base et pas dans le navigateur ───────────────────────
--
-- Un fil qu'on perd en rechargeant la page n'est pas une conversation, c'est un
-- formulaire. Et l'intérêt d'échanger avec la mémoire d'une marque tient
-- justement à la continuité : « tu me disais que le listicle marchait » n'a de
-- sens que si le fil survit à la nuit.
--
-- ── Un fil par (marque, personne) ───────────────────────────────────────────
--
-- Pas de fils multiples pour l'instant. Jarvis parle d'UNE marque · ouvrir
-- plusieurs conversations sur le même sujet crée surtout la charge de choisir
-- laquelle reprendre. La clé est donc implicite, portée par l'index.
--
-- `user_id` sépare les membres d'un même espace : deux personnes qui travaillent
-- sur la même marque n'ont pas à lire les brouillons de réflexion l'une de
-- l'autre.
CREATE TABLE IF NOT EXISTS "jarvis_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  -- 'user' ou 'assistant' · pas de 'system', la consigne est recomposée à chaque
  -- tour depuis la mémoire vivante. La figer ici la rendrait périmée dès le
  -- lendemain.
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jarvis_messages_fil_idx"
  ON "jarvis_messages" ("brand_id", "user_id", "created_at");
