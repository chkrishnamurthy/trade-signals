-- Hand-written. Alerts v1: per-user crossing rules on closed daily data.
-- The earlier single-user `alerts` / `alert_events` tables were dropped in 0011;
-- these are new tables with an owner on every row.

CREATE TABLE "alerts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"metric" text NOT NULL,
	"comparator" text NOT NULL,
	"threshold" double precision NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"last_evaluated_date" date,
	CONSTRAINT "alerts_metric_check" CHECK ("alerts"."metric" in ('close', 'rsi14')),
	CONSTRAINT "alerts_comparator_check" CHECK ("alerts"."comparator" in ('crosses_above', 'crosses_below')),
	CONSTRAINT "alerts_threshold_positive" CHECK ("alerts"."threshold" > 0)
);
--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"alert_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"observed_value" double precision NOT NULL,
	"message" text NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emailed_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_owner_idx" ON "alerts" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alerts_enabled_instrument_idx" ON "alerts" USING btree ("enabled","instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_alert_date_idx" ON "alert_events" USING btree ("alert_id","trading_date");--> statement-breakpoint
CREATE INDEX "alert_events_owner_idx" ON "alert_events" USING btree ("owner_id","triggered_at" DESC NULLS LAST);
