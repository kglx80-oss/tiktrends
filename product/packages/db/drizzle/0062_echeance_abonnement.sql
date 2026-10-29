-- Échéance de l'abonnement Stripe en cours · migration ADDITIVE.
--
-- Décision du 29/10 (point 5) · un abonné actuel (Core, Plus, Business) garde
-- prix et droits jusqu'à sa prochaine échéance, puis bascule sur l'offre V2. Le
-- préavis (Réglages · Forfaits) dit la DATE de cette échéance · le webhook Stripe
-- la recopie ici (`current_period_end` de l'abonnement). Nullable · l'ancien
-- code ne l'écrit pas, un espace sans abonnement n'en a pas.
--
-- Rejouable : « ADD COLUMN IF NOT EXISTS ». Aucune donnée lue ni modifiée.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "subscription_period_end" timestamp with time zone;
