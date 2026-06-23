CREATE TABLE "medical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cat_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"occurred_on" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaccinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cat_id" uuid NOT NULL,
	"name" text NOT NULL,
	"administered_on" timestamp with time zone NOT NULL,
	"next_due_on" timestamp with time zone,
	"vet" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_cat_id_cats_id_fk" FOREIGN KEY ("cat_id") REFERENCES "public"."cats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_cat_id_cats_id_fk" FOREIGN KEY ("cat_id") REFERENCES "public"."cats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medical_records_cat_idx" ON "medical_records" USING btree ("cat_id");--> statement-breakpoint
CREATE INDEX "vaccinations_cat_idx" ON "vaccinations" USING btree ("cat_id");