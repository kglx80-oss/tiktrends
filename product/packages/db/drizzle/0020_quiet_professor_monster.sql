ALTER TABLE "assets" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "drive_refresh_token_enc" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "drive_folder_name" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "drive_synced_at" timestamp with time zone;