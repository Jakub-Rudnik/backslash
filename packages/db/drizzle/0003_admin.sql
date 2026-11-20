CREATE TYPE "public"."compile_outcome" AS ENUM('success', 'error', 'timeout', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "compiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "compiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" text,
	"user_id" text,
	"outcome" "compile_outcome" NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "project_limit" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "storage_limit_mb" integer;--> statement-breakpoint
ALTER TABLE "compiles" ADD CONSTRAINT "compiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compiles" ADD CONSTRAINT "compiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compiles_created_at_idx" ON "compiles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "compiles_project_id_idx" ON "compiles" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "compiles_user_id_idx" ON "compiles" USING btree ("user_id");