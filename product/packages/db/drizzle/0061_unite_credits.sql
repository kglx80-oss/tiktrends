-- Unité du crédit ÷ 10 (décision du 29/10) · migration ADDITIVE.
--
-- Un ancien crédit vaut dix nouveaux. Le barème, les allocations et l'essai
-- passent ×10 dans le code de la même PR ; les SOLDES doivent suivre, sinon le
-- nouveau barème débiterait dix fois trop. La conversion n'est PAS faite ici :
-- une écriture de données au passage de la migration casserait la fenêtre
-- inverse (l'ancien code tourne pendant la migration, garde `d1-deploiement`).
-- Ici on ne fait qu'ajouter de quoi la suivre :
--   · `credit_unit` · 1 = compteurs en ancienne unité (défaut : toutes les
--     lignes existantes, et celles que l'ancien code crée pendant la fenêtre) ;
--   · `credit_unit_converted_at` · quand la ligne est passée à 10.
-- Le nouveau code convertit chaque espace une fois, par un UPDATE conditionnel
-- `WHERE credit_unit = 1` (`packages/db/src/unite-credits.ts`) : balayage au
-- démarrage des workers, et avant toute écriture de solde.
--
-- Rejouable : « ADD COLUMN IF NOT EXISTS ». Aucune donnée lue ni modifiée.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "credit_unit" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "credit_unit_converted_at" timestamp with time zone;
