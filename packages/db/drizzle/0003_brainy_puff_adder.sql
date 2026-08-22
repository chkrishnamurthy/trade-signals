CREATE TABLE "intraday_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "intraday_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"trading_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"regime" text,
	"symbols_requested" integer DEFAULT 0 NOT NULL,
	"symbols_evaluated" integer DEFAULT 0 NOT NULL,
	"signals_created" integer DEFAULT 0 NOT NULL,
	"signals_updated" integer DEFAULT 0 NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "intraday_signal_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "intraday_signal_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"signal_id" bigint NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"detail" text,
	"score" integer NOT NULL,
	"state" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intraday_signal_factors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "intraday_signal_factors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"signal_id" bigint NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"score" double precision NOT NULL,
	"weight" double precision NOT NULL,
	"points" double precision NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intraday_signal_reasons" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "intraday_signal_reasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"signal_id" bigint NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"detail" text NOT NULL,
	"category" text NOT NULL,
	"polarity" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intraday_signals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "intraday_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"strategy_version_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"setup_key" text NOT NULL,
	"kind" text NOT NULL,
	"direction" text NOT NULL,
	"strategy" text NOT NULL,
	"state" text NOT NULL,
	"regime" text NOT NULL,
	"score" integer NOT NULL,
	"quality" text NOT NULL,
	"entry_low" integer NOT NULL,
	"entry_high" integer NOT NULL,
	"invalidation_level" integer NOT NULL,
	"target1" integer NOT NULL,
	"target2" integer NOT NULL,
	"risk_paise" integer NOT NULL,
	"reward_paise" integer NOT NULL,
	"risk_reward" double precision,
	"reference_price" integer,
	"trigger_minutes" smallint NOT NULL,
	"setup_minutes" smallint NOT NULL,
	"trend_minutes" smallint NOT NULL,
	"invalidations" jsonb NOT NULL,
	"indicator_snapshot" jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"holds" integer DEFAULT 0 NOT NULL,
	"max_favourable" integer DEFAULT 0 NOT NULL,
	"max_adverse" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intraday_signal_events" ADD CONSTRAINT "intraday_signal_events_signal_id_intraday_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."intraday_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intraday_signal_factors" ADD CONSTRAINT "intraday_signal_factors_signal_id_intraday_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."intraday_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intraday_signal_reasons" ADD CONSTRAINT "intraday_signal_reasons_signal_id_intraday_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."intraday_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intraday_signals" ADD CONSTRAINT "intraday_signals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intraday_signals" ADD CONSTRAINT "intraday_signals_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intraday_runs_date_idx" ON "intraday_runs" USING btree ("trading_date","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "intraday_signal_events_signal_idx" ON "intraday_signal_events" USING btree ("signal_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "intraday_signal_events_unique_idx" ON "intraday_signal_events" USING btree ("signal_id","at","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "intraday_signal_factors_unique_idx" ON "intraday_signal_factors" USING btree ("signal_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "intraday_signal_reasons_unique_idx" ON "intraday_signal_reasons" USING btree ("signal_id","key");--> statement-breakpoint
CREATE INDEX "intraday_signal_reasons_signal_idx" ON "intraday_signal_reasons" USING btree ("signal_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "intraday_signals_live_idx" ON "intraday_signals" USING btree ("instrument_id","trading_date","setup_key") WHERE "intraday_signals"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "intraday_signals_date_score_idx" ON "intraday_signals" USING btree ("trading_date","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "intraday_signals_date_state_idx" ON "intraday_signals" USING btree ("trading_date","state");--> statement-breakpoint
CREATE INDEX "intraday_signals_instrument_idx" ON "intraday_signals" USING btree ("instrument_id","trading_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "intraday_signals_updated_idx" ON "intraday_signals" USING btree ("updated_at" DESC NULLS LAST);