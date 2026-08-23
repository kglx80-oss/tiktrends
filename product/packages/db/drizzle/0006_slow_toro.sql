CREATE TABLE IF NOT EXISTS "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"title" text NOT NULL,
	"context" text
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "usp" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "audience" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "category_needs" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "more_about" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "industry_tags" text[];--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "colors" text[];--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "fonts" text[];--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "preferred_words" text[];--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "avoid_words" text[];--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "competitors" text[];--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
