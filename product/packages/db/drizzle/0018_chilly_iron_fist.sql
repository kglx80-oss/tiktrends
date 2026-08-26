DO $$ BEGIN
 CREATE TYPE "public"."account_kind" AS ENUM('normal', 'beta', 'staff');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "account_kind" "account_kind" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "trial_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "trial_ends_at" timestamp with time zone;