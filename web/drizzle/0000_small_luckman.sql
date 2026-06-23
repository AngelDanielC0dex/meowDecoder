CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cat_priors" (
	"cat_id" uuid NOT NULL,
	"cls" text NOT NULL,
	"alpha" real DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cat_priors_cat_id_cls_pk" PRIMARY KEY("cat_id","cls")
);
--> statement-breakpoint
CREATE TABLE "cats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"birth_year" integer,
	"breed" text,
	"sex" text DEFAULT 'unknown' NOT NULL,
	"traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_pct" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verdict" text NOT NULL,
	"predicted_class" text NOT NULL,
	"corrected_class" text,
	"shared_for_training" boolean DEFAULT false NOT NULL,
	"audio_object_key" text
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"version" text PRIMARY KEY NOT NULL,
	"classes" jsonb NOT NULL,
	"macro_f1" real,
	"ece" real,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"primary_class" text NOT NULL,
	"primary_probability" real NOT NULL,
	"certainty" text NOT NULL,
	"ambiguous" boolean NOT NULL,
	"scores" jsonb NOT NULL,
	"engine_id" text NOT NULL,
	"model_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cat_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"recording_duration_s" real NOT NULL,
	"features" jsonb NOT NULL,
	"segment_start_s" real NOT NULL,
	"segment_end_s" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"provider_customer_id" text,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"email_verified" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cat_priors" ADD CONSTRAINT "cat_priors_cat_id_cats_id_fk" FOREIGN KEY ("cat_id") REFERENCES "public"."cats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cats" ADD CONSTRAINT "cats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cat_id_cats_id_fk" FOREIGN KEY ("cat_id") REFERENCES "public"."cats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_name_time_idx" ON "analytics_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "cats_user_idx" ON "cats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_training_idx" ON "feedback" USING btree ("shared_for_training");--> statement-breakpoint
CREATE INDEX "sessions_user_created_idx" ON "sessions" USING btree ("user_id","created_at");