-- UX V5 · plusieurs conversations Jarvis par (marque, personne) · migration ADDITIVE.
--
-- Jarvis n'avait qu'un fil par (marque, personne) · ouvrir une piste neuve
-- effaçait la précédente. On AJOUTE une table de conversations nommées, portée
-- espace + marque + personne (même portée que `jarvis_messages`), et une colonne
-- `conversation_id` NULLABLE sur `jarvis_messages` pour y rattacher les messages.
--
-- Fenêtre de migration INVERSE (l'ancien code tourne encore pendant la
-- migration) · rien ne le casse :
--   · la nouvelle table et ses index sont neufs · aucun déclencheur ni
--     contrainte posés sur une table EXISTANTE ;
--   · `conversation_id` est NULLABLE et SANS clé étrangère · l'ancien code
--     continue d'écrire dans `jarvis_messages` sans la connaître, et une FK vers
--     `jarvis_conversations` serait une contrainte ajoutée à une table existante
--     (interdite en fenêtre inverse). Un message sans `conversation_id` est un
--     message du fil historique (conversation implicite « par défaut »).
--
-- Rejouable : table, colonne et index en « IF NOT EXISTS ». Aucune donnée
-- existante n'est lue ni modifiée (aucun backfill).
-- `brand_id` est NULLABLE · une conversation d'onboarding (compte neuf, sans
-- marque) n'est portée que par l'espace et la personne.
CREATE TABLE IF NOT EXISTS "jarvis_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"brand_id" uuid REFERENCES "brands"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"titre" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Le fil d'onboarding (sans marque) · `jarvis_messages.brand_id` étant NOT NULL,
-- un compte sans marque écrit ici (portée espace + personne), pas là-bas.
CREATE TABLE IF NOT EXISTS "jarvis_onboarding_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jarvis_messages" ADD COLUMN IF NOT EXISTS "conversation_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jarvis_conversations_liste_idx" ON "jarvis_conversations" ("brand_id","user_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jarvis_messages_conv_idx" ON "jarvis_messages" ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jarvis_onboarding_fil_idx" ON "jarvis_onboarding_messages" ("workspace_id","user_id","created_at");
