ALTER TABLE "workspaces" ADD COLUMN "onboarding_json" jsonb;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
UPDATE "workspaces" SET "onboarded_at" = "created_at" WHERE "onboarded_at" IS NULL;
