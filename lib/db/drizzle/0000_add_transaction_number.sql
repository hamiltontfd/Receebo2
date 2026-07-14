CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"object_path" text NOT NULL,
	"original_file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"warranty" text,
	"merchant" text,
	"purchase_date" date,
	"total" double precision,
	"currency" text,
	"category" text,
	"summary" text,
	"ocr_text" text,
	"transaction_number" text,
	"products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notable_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
