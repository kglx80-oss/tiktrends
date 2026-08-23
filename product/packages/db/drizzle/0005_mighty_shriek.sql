ALTER TABLE "followed_brands" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_ads" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "followed_brands" ADD CONSTRAINT "followed_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_ads" ADD CONSTRAINT "saved_ads_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
