DO $$ BEGIN
 CREATE TYPE "public"."adsmap_ad_format" AS ENUM('video_ugc', 'video_vsl', 'video_demo', 'video_story', 'static', 'image_carousel', 'gif');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_ad_status" AS ENUM('draft', 'proposed', 'ready', 'live', 'paused', 'done');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_ad_type" AS ENUM('ideation', 'iteration', 'imitation', 'new');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_agent" AS ENUM('a0_tagger', 'a1_research', 'a2_concept', 'a3_brief', 'a4_analyst', 'a5_iteration', 'a6_coverage', 'a7_prelaunch', 'a8_report');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_angle_mechanism" AS ENUM('problem_agitate', 'demo', 'social_proof', 'comparison', 'story', 'curiosity', 'authority', 'scarcity', 'reverse', 'statistic_shock', 'diagnostic', 'us_vs_them', 'listicle');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_awareness" AS ENUM('unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_batch_status" AS ENUM('planned', 'in_production', 'ready', 'testing', 'analyzed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_cro_status" AS ENUM('ok', 'to_audit', 'in_optimization');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_decision_status" AS ENUM('open', 'done', 'dismissed', 'snoozed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_decision_type" AS ENUM('validate_verdict', 'review_learning', 'accept_iteration', 'kill_suggested', 'coverage_gap', 'unmapped_ad', 'protocol_violation', 'cro_handoff', 'prelaunch_warning', 'budget_exhausted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_desire_type" AS ENUM('gain', 'pain_relief', 'status', 'control', 'belonging', 'safety');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_element_origin" AS ENUM('extracted', 'authored', 'ai_proposed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_element_type" AS ENUM('hook_spoken', 'hook_text', 'opening_visual', 'proof', 'cta', 'offer_line', 'sound');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_funnel_stage" AS ENUM('hook', 'hold', 'click', 'convert');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_hook_type" AS ENUM('question', 'statement', 'callout', 'number', 'negative', 'curiosity', 'command');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_iteration_mode" AS ENUM('more', 'better', 'new');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_kill_reason" AS ENUM('hook', 'click', 'convert', 'cost');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_learning_scope" AS ENUM('ad', 'concept', 'angle', 'desire', 'avatar', 'format', 'element', 'landing', 'offer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_node_status" AS ENUM('proposed', 'validated', 'rejected', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_opening_type" AS ENUM('face_talking', 'product', 'problem_scene', 'text_card', 'before_after', 'pattern_interrupt');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_page_type" AS ENUM('pdp', 'collection', 'advertorial', 'listicle', 'quiz', 'home');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_protocol_structure" AS ENUM('abo_one_adset_per_ad', 'abo_single_adset', 'cbo_tolerated');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_stat_dimension" AS ENUM('mechanism', 'hook_type', 'format', 'length_bucket', 'awareness', 'avatar', 'talent', 'opening_type', 'element');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_talent_type" AS ENUM('ugc_creator', 'founder', 'actor', 'voice_over_only', 'none');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_tested_variable" AS ENUM('hook', 'opening_visual', 'body', 'length', 'cta', 'format', 'offer', 'landing', 'avatar_on_screen', 'proof', 'audio', 'angle', 'desire', 'none_control');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_valence" AS ENUM('negative', 'positive', 'neutral');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_verdict_status" AS ENUM('computed', 'validated');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adsmap_verdict_value" AS ENUM('winner', 'baby_winner', 'loser', 'inconclusive', 'insufficient_delivery', 'relative_winner');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_ad_elements" (
	"ad_id" uuid NOT NULL,
	"element_id" uuid NOT NULL,
	"position" integer,
	CONSTRAINT "adsmap_ad_elements_ad_id_element_id_pk" PRIMARY KEY("ad_id","element_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"batch_id" uuid,
	"creative_id" uuid,
	"variant_code" text NOT NULL,
	"format" "adsmap_ad_format" DEFAULT 'video_ugc' NOT NULL,
	"ad_type" "adsmap_ad_type" DEFAULT 'ideation' NOT NULL,
	"hypothesis" text,
	"tested_variable" "adsmap_tested_variable",
	"variable_value" text,
	"offer_id" uuid,
	"landing_page_id" uuid,
	"brief_url" text,
	"asset_url" text,
	"platform" "platform" DEFAULT 'meta' NOT NULL,
	"external_ids_json" jsonb,
	"generated_name" text,
	"launched_at" timestamp with time zone,
	"status" "adsmap_ad_status" DEFAULT 'draft' NOT NULL,
	"legacy_flags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adsmap_ads_variant" UNIQUE("concept_id","batch_id","variant_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"agent" "adsmap_agent" NOT NULL,
	"input_ref_json" jsonb,
	"output_json" jsonb,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"credits" integer DEFAULT 0 NOT NULL,
	"accepted" boolean,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_angles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"desire_id" uuid NOT NULL,
	"label" text NOT NULL,
	"mechanism" "adsmap_angle_mechanism" NOT NULL,
	"valence" "adsmap_valence" DEFAULT 'neutral' NOT NULL,
	"value_score_json" jsonb,
	"status" "adsmap_node_status" DEFAULT 'proposed' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"author_id" uuid,
	"goal" text,
	"status" "adsmap_batch_status" DEFAULT 'planned' NOT NULL,
	"launched_at" timestamp with time zone,
	"planned_end_at" timestamp with time zone,
	"test_campaign_ids_json" jsonb,
	"protocol_check_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adsmap_batches_brand_number" UNIQUE("brand_id","number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_brand_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"dimension" "adsmap_stat_dimension" NOT NULL,
	"key" text NOT NULL,
	"n_ads" integer DEFAULT 0 NOT NULL,
	"n_conclusive" integer DEFAULT 0 NOT NULL,
	"n_winners" integer DEFAULT 0 NOT NULL,
	"n_baby" integer DEFAULT 0 NOT NULL,
	"hit_rate" double precision,
	"hook_rate_median" double precision,
	"hold_rate_median" double precision,
	"ctr_median" double precision,
	"cpa_median" double precision,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adsmap_brand_stats_key" UNIQUE("brand_id","dimension","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_client_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"token" text NOT NULL,
	"scopes_json" jsonb,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adsmap_client_share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"angle_id" uuid NOT NULL,
	"title" text NOT NULL,
	"callout" text,
	"value_block" text,
	"cta" text,
	"hook_options" text[],
	"ad_type" "adsmap_ad_type" DEFAULT 'ideation' NOT NULL,
	"source_ref_json" jsonb,
	"prelaunch_score_json" jsonb,
	"status" "adsmap_node_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_creative_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"type" "adsmap_element_type" NOT NULL,
	"content" text NOT NULL,
	"fingerprint" text NOT NULL,
	"origin" "adsmap_element_origin" DEFAULT 'extracted' NOT NULL,
	"embedding" vector(1536),
	"stats_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adsmap_elements_fingerprint" UNIQUE("brand_id","type","fingerprint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_decision_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"type" "adsmap_decision_type" NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"payload_json" jsonb,
	"spend_at_stake" double precision,
	"status" "adsmap_decision_status" DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_desires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"awareness_stage" "adsmap_awareness" DEFAULT 'problem_aware' NOT NULL,
	"label" text NOT NULL,
	"type" "adsmap_desire_type" DEFAULT 'gain' NOT NULL,
	"intensity" integer DEFAULT 3 NOT NULL,
	"status" "adsmap_node_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "error_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"family" text NOT NULL,
	"detail" text NOT NULL,
	"workspace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_iteration_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"child_ad_id" uuid NOT NULL,
	"parent_ad_id" uuid NOT NULL,
	"mode" "adsmap_iteration_mode" DEFAULT 'better' NOT NULL,
	"changed_variable" "adsmap_tested_variable" NOT NULL,
	"stage_targeted" "adsmap_funnel_stage",
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adsmap_iteration_child" UNIQUE("child_ad_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_landing_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"url" text NOT NULL,
	"label" text NOT NULL,
	"page_type" "adsmap_page_type" DEFAULT 'pdp' NOT NULL,
	"cvr_30d" double precision,
	"aov_30d" double precision,
	"cro_status" "adsmap_cro_status" DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"ad_id" uuid,
	"concept_id" uuid,
	"angle_id" uuid,
	"element_id" uuid,
	"scope" "adsmap_learning_scope" NOT NULL,
	"stage" "adsmap_funnel_stage",
	"statement" text NOT NULL,
	"evidence_json" jsonb,
	"confidence" integer DEFAULT 3 NOT NULL,
	"refuted" boolean DEFAULT false NOT NULL,
	"status" "adsmap_node_status" DEFAULT 'proposed' NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"label" text NOT NULL,
	"price" double precision,
	"discount" text,
	"guarantee" text,
	"bundle" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_portfolio_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical" text,
	"dimension" "adsmap_stat_dimension" NOT NULL,
	"key" text NOT NULL,
	"n_brands" integer NOT NULL,
	"n_ads" integer NOT NULL,
	"hit_rate" double precision,
	"hook_rate_median" double precision,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adsmap_portfolio_key" UNIQUE("vertical","dimension","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_test_protocols" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"structure" "adsmap_protocol_structure" DEFAULT 'abo_one_adset_per_ad' NOT NULL,
	"daily_budget_per_ad" double precision DEFAULT 20 NOT NULL,
	"duration_days" integer DEFAULT 7 NOT NULL,
	"audience_rule" text DEFAULT 'broad, même audience pour toutes les ads du batch' NOT NULL,
	"campaign_name_pattern" text DEFAULT '[ADSMAP] TEST {brand} B{batch}' NOT NULL,
	"budget_variance_tolerance" double precision DEFAULT 0.2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_verdict_configs" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"config_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adsmap_verdicts" (
	"ad_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"computed" "adsmap_verdict_value" NOT NULL,
	"validated" "adsmap_verdict_value",
	"status" "adsmap_verdict_status" DEFAULT 'computed' NOT NULL,
	"comparable" boolean DEFAULT false NOT NULL,
	"metrics_agg_json" jsonb,
	"failed_stage" "adsmap_funnel_stage",
	"kill_flag" "adsmap_kill_reason",
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_by" uuid,
	"override_reason" text
);
--> statement-breakpoint
ALTER TABLE "ad_instances" ADD COLUMN "external_adset_id" text;--> statement-breakpoint
ALTER TABLE "ad_instances" ADD COLUMN "external_campaign_id" text;--> statement-breakpoint
ALTER TABLE "ad_instances" ADD COLUMN "adset_daily_budget" double precision;--> statement-breakpoint
ALTER TABLE "ad_instances" ADD COLUMN "platform" "platform" DEFAULT 'meta' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "vertical" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "naming_pattern" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "portfolio_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "analysis_json" jsonb;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "hook_type" text;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "opening_type" text;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "talent" text;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "product_first_sec" double precision;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "cta_first_sec" double precision;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "cuts_first_10s" integer;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "has_captions" boolean;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "analysis_model" text;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "analysis_confidence" double precision;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "thruplays" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "link_clicks" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "landing_views" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "add_to_cart" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "objections" text[];--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "sources_json" jsonb;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "status" text DEFAULT 'validated' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ad_elements" ADD CONSTRAINT "adsmap_ad_elements_ad_id_adsmap_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."adsmap_ads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ad_elements" ADD CONSTRAINT "adsmap_ad_elements_element_id_adsmap_creative_elements_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."adsmap_creative_elements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ads" ADD CONSTRAINT "adsmap_ads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ads" ADD CONSTRAINT "adsmap_ads_concept_id_adsmap_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."adsmap_concepts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ads" ADD CONSTRAINT "adsmap_ads_batch_id_adsmap_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."adsmap_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ads" ADD CONSTRAINT "adsmap_ads_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ads" ADD CONSTRAINT "adsmap_ads_offer_id_adsmap_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."adsmap_offers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_ads" ADD CONSTRAINT "adsmap_ads_landing_page_id_adsmap_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."adsmap_landing_pages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_agent_runs" ADD CONSTRAINT "adsmap_agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_agent_runs" ADD CONSTRAINT "adsmap_agent_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_angles" ADD CONSTRAINT "adsmap_angles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_angles" ADD CONSTRAINT "adsmap_angles_desire_id_adsmap_desires_id_fk" FOREIGN KEY ("desire_id") REFERENCES "public"."adsmap_desires"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_batches" ADD CONSTRAINT "adsmap_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_batches" ADD CONSTRAINT "adsmap_batches_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_batches" ADD CONSTRAINT "adsmap_batches_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_brand_stats" ADD CONSTRAINT "adsmap_brand_stats_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_client_share_links" ADD CONSTRAINT "adsmap_client_share_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_client_share_links" ADD CONSTRAINT "adsmap_client_share_links_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_client_share_links" ADD CONSTRAINT "adsmap_client_share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_concepts" ADD CONSTRAINT "adsmap_concepts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_concepts" ADD CONSTRAINT "adsmap_concepts_angle_id_adsmap_angles_id_fk" FOREIGN KEY ("angle_id") REFERENCES "public"."adsmap_angles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_creative_elements" ADD CONSTRAINT "adsmap_creative_elements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_creative_elements" ADD CONSTRAINT "adsmap_creative_elements_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_decision_items" ADD CONSTRAINT "adsmap_decision_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_decision_items" ADD CONSTRAINT "adsmap_decision_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_decision_items" ADD CONSTRAINT "adsmap_decision_items_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_desires" ADD CONSTRAINT "adsmap_desires_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_desires" ADD CONSTRAINT "adsmap_desires_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "error_log" ADD CONSTRAINT "error_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_iteration_edges" ADD CONSTRAINT "adsmap_iteration_edges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_iteration_edges" ADD CONSTRAINT "adsmap_iteration_edges_child_ad_id_adsmap_ads_id_fk" FOREIGN KEY ("child_ad_id") REFERENCES "public"."adsmap_ads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_iteration_edges" ADD CONSTRAINT "adsmap_iteration_edges_parent_ad_id_adsmap_ads_id_fk" FOREIGN KEY ("parent_ad_id") REFERENCES "public"."adsmap_ads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_landing_pages" ADD CONSTRAINT "adsmap_landing_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_landing_pages" ADD CONSTRAINT "adsmap_landing_pages_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_learnings" ADD CONSTRAINT "adsmap_learnings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_learnings" ADD CONSTRAINT "adsmap_learnings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_learnings" ADD CONSTRAINT "adsmap_learnings_ad_id_adsmap_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."adsmap_ads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_learnings" ADD CONSTRAINT "adsmap_learnings_concept_id_adsmap_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."adsmap_concepts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_learnings" ADD CONSTRAINT "adsmap_learnings_angle_id_adsmap_angles_id_fk" FOREIGN KEY ("angle_id") REFERENCES "public"."adsmap_angles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_learnings" ADD CONSTRAINT "adsmap_learnings_element_id_adsmap_creative_elements_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."adsmap_creative_elements"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_offers" ADD CONSTRAINT "adsmap_offers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_offers" ADD CONSTRAINT "adsmap_offers_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_test_protocols" ADD CONSTRAINT "adsmap_test_protocols_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_test_protocols" ADD CONSTRAINT "adsmap_test_protocols_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_verdict_configs" ADD CONSTRAINT "adsmap_verdict_configs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_verdict_configs" ADD CONSTRAINT "adsmap_verdict_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_verdicts" ADD CONSTRAINT "adsmap_verdicts_ad_id_adsmap_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."adsmap_ads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_verdicts" ADD CONSTRAINT "adsmap_verdicts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adsmap_verdicts" ADD CONSTRAINT "adsmap_verdicts_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_ads_batch_idx" ON "adsmap_ads" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_ads_status_idx" ON "adsmap_ads" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_agent_runs_ws_idx" ON "adsmap_agent_runs" USING btree ("workspace_id","agent");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_angles_desire_idx" ON "adsmap_angles" USING btree ("desire_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_concepts_angle_idx" ON "adsmap_concepts" USING btree ("angle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_decisions_inbox_idx" ON "adsmap_decision_items" USING btree ("brand_id","status","priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_desires_persona_idx" ON "adsmap_desires" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_log_at_idx" ON "error_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_log_family_idx" ON "error_log" USING btree ("family");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_iteration_parent_idx" ON "adsmap_iteration_edges" USING btree ("parent_ad_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_landing_brand_idx" ON "adsmap_landing_pages" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_learnings_brand_idx" ON "adsmap_learnings" USING btree ("brand_id","scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_offers_brand_idx" ON "adsmap_offers" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adsmap_verdicts_ws_idx" ON "adsmap_verdicts" USING btree ("workspace_id","computed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_instances_external_idx" ON "ad_instances" USING btree ("external_ad_id");--> statement-breakpoint
-- ADSMAP · invariants du §2.4 exprimables en SQL.
-- Le reste (absence de cycle dans ITERATES, verdict validé exigeant un learning)
-- est gardé côté applicatif dans packages/core, avec ses tests.

-- Pas d'ad lancée sans hypothèse falsifiable, ni sans offre ni page de destination.
DO $$ BEGIN
 ALTER TABLE "adsmap_ads" ADD CONSTRAINT "adsmap_ads_ready_requires_test_setup" CHECK (
   "status" NOT IN ('ready', 'live')
   OR ("hypothesis" IS NOT NULL AND "tested_variable" IS NOT NULL
       AND "offer_id" IS NOT NULL AND "landing_page_id" IS NOT NULL)
 );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Une itération change forcément quelque chose.
DO $$ BEGIN
 ALTER TABLE "adsmap_iteration_edges" ADD CONSTRAINT "adsmap_iteration_changes_something"
   CHECK ("changed_variable" <> 'none_control');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Un verdict non comparable ne peut pas être un WINNER absolu (au mieux RELATIVE_WINNER).
DO $$ BEGIN
 ALTER TABLE "adsmap_verdicts" ADD CONSTRAINT "adsmap_verdict_winner_requires_comparable"
   CHECK ("comparable" OR "computed" <> 'winner');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Une ad ne peut pas être sa propre itération.
DO $$ BEGIN
 ALTER TABLE "adsmap_iteration_edges" ADD CONSTRAINT "adsmap_iteration_no_self"
   CHECK ("child_ad_id" <> "parent_ad_id");
EXCEPTION WHEN duplicate_object THEN null; END $$;
