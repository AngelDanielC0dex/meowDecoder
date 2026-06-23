ALTER TABLE "cats" ADD COLUMN "birth_date" text;--> statement-breakpoint
ALTER TABLE "cats" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "cats" ADD COLUMN "card_template" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "cats" ADD COLUMN "show_horoscope" boolean DEFAULT false NOT NULL;