CREATE TABLE "minute_candles" (
	"instrument_id" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"open" integer NOT NULL,
	"high" integer NOT NULL,
	"low" integer NOT NULL,
	"close" integer NOT NULL,
	"volume" bigint NOT NULL,
	"provider_id" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "minute_candles_instrument_id_ts_pk" PRIMARY KEY("instrument_id","ts"),
	CONSTRAINT "minute_candles_valid" CHECK ("minute_candles"."low">0 and "minute_candles"."high">=greatest("minute_candles"."open","minute_candles"."close") and "minute_candles"."low"<=least("minute_candles"."open","minute_candles"."close") and "minute_candles"."volume">=0)
);
--> statement-breakpoint
CREATE TABLE "paper_equity_marks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_equity_marks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"net_paise" bigint
);
--> statement-breakpoint
CREATE TABLE "paper_studies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_studies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"signal_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"capital_paise" bigint NOT NULL,
	"risk_bps" integer NOT NULL,
	"sizing" jsonb NOT NULL,
	"costs" jsonb NOT NULL,
	"move_to_breakeven" boolean NOT NULL,
	"projection" jsonb NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"net_paise" bigint,
	CONSTRAINT "paper_studies_budget_valid" CHECK ("paper_studies"."capital_paise">0 and "paper_studies"."risk_bps" between 1 and 500 and ("paper_studies"."sizing"->>'shares')::integer>0)
);
--> statement-breakpoint
CREATE TABLE "paper_study_events" (
	"study_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"projection" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"net_paise" bigint,
	CONSTRAINT "paper_study_events_study_id_sequence_pk" PRIMARY KEY("study_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "signal_observations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "signal_observations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"price" integer NOT NULL,
	"bid" integer,
	"ask" integer,
	"observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"continuous" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_quotes" (
	"instrument_id" integer PRIMARY KEY NOT NULL,
	"price" integer NOT NULL,
	"bid" integer,
	"ask" integer,
	"observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"continuous" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_scan_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "signal_scan_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vwap_signal_events" (
	"signal_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"state" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"price" integer,
	"resolution" text NOT NULL,
	CONSTRAINT "vwap_signal_events_signal_id_sequence_pk" PRIMARY KEY("signal_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "vwap_signals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vwap_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"strategy_version_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"dedupe_key" text NOT NULL,
	"symbol" text NOT NULL,
	"company_name" text NOT NULL,
	"sector" text,
	"published_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"evidence" jsonb NOT NULL,
	"projection" jsonb NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "vwap_signals_evidence_valid" CHECK (jsonb_typeof("vwap_signals"."evidence"->'factors')='array' and jsonb_array_length("vwap_signals"."evidence"->'factors')=7 and ("vwap_signals"."evidence"->>'score')::integer between 70 and 100)
);
--> statement-breakpoint
ALTER TABLE "minute_candles" ADD CONSTRAINT "minute_candles_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_equity_marks" ADD CONSTRAINT "paper_equity_marks_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_studies" ADD CONSTRAINT "paper_studies_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_studies" ADD CONSTRAINT "paper_studies_signal_id_vwap_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."vwap_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_study_events" ADD CONSTRAINT "paper_study_events_study_id_paper_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."paper_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_observations" ADD CONSTRAINT "signal_observations_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_quotes" ADD CONSTRAINT "signal_quotes_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vwap_signal_events" ADD CONSTRAINT "vwap_signal_events_signal_id_vwap_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."vwap_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vwap_signals" ADD CONSTRAINT "vwap_signals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vwap_signals" ADD CONSTRAINT "vwap_signals_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paper_equity_marks_user_date_idx" ON "paper_equity_marks" USING btree ("user_id","trading_date","at");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_studies_user_signal_idx" ON "paper_studies" USING btree ("user_id","signal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_studies_idempotency_idx" ON "paper_studies" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "paper_studies_owner_idx" ON "paper_studies" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "signal_observations_instrument_idx" ON "signal_observations" USING btree ("instrument_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vwap_signals_dedupe_idx" ON "vwap_signals" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vwap_signals_one_active_idx" ON "vwap_signals" USING btree ("instrument_id","trading_date") WHERE "vwap_signals"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "vwap_signals_date_idx" ON "vwap_signals" USING btree ("trading_date","id");--> statement-breakpoint
SELECT create_hypertable('minute_candles', 'ts', chunk_time_interval => interval '7 days', if_not_exists => TRUE);
--> statement-breakpoint
-- Self-hosted Timescale supports compression; Apache-only test/fallback hosts do not.
DO $$ BEGIN
 IF current_setting('timescaledb.license', true) = 'timescale' THEN
  ALTER TABLE minute_candles SET (timescaledb.compress, timescaledb.compress_segmentby = 'instrument_id', timescaledb.compress_orderby = 'ts DESC');
  PERFORM add_compression_policy('minute_candles', interval '14 days', if_not_exists => TRUE);
 END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION reject_research_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Research history is immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER minute_candles_no_update BEFORE UPDATE ON minute_candles FOR EACH ROW EXECUTE FUNCTION reject_research_mutation();
--> statement-breakpoint
CREATE TRIGGER vwap_events_immutable BEFORE UPDATE OR DELETE ON vwap_signal_events FOR EACH ROW EXECUTE FUNCTION reject_research_mutation();
--> statement-breakpoint
CREATE TRIGGER paper_events_immutable BEFORE UPDATE OR DELETE ON paper_study_events FOR EACH ROW EXECUTE FUNCTION reject_research_mutation();
--> statement-breakpoint
CREATE TRIGGER observations_immutable BEFORE UPDATE OR DELETE ON signal_observations FOR EACH ROW EXECUTE FUNCTION reject_research_mutation();
--> statement-breakpoint
CREATE TRIGGER scans_immutable BEFORE UPDATE OR DELETE ON signal_scan_runs FOR EACH ROW EXECUTE FUNCTION reject_research_mutation();
--> statement-breakpoint
CREATE TRIGGER equity_marks_immutable BEFORE UPDATE OR DELETE ON paper_equity_marks FOR EACH ROW EXECUTE FUNCTION reject_research_mutation();
--> statement-breakpoint
CREATE FUNCTION guard_vwap_signal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(801, NEW.instrument_id);
    IF (SELECT count(*) FROM vwap_signals WHERE instrument_id=NEW.instrument_id AND trading_date=NEW.trading_date) >= 2 THEN
      RAISE EXCEPTION 'Daily signal limit reached';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['projection','sequence','ended_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['projection','sequence','ended_at']) THEN
      RAISE EXCEPTION 'Published signal evidence is immutable';
    END IF;
    IF NEW.sequence < OLD.sequence OR (NEW.projection->>'cursor')::bigint < (OLD.projection->>'cursor')::bigint THEN RAISE EXCEPTION 'Projection cannot move backwards'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER vwap_signal_guard BEFORE INSERT OR UPDATE ON vwap_signals FOR EACH ROW EXECUTE FUNCTION guard_vwap_signal();
--> statement-breakpoint
CREATE FUNCTION guard_paper_study() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (to_jsonb(NEW) - ARRAY['projection','sequence','ended_at','net_paise']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['projection','sequence','ended_at','net_paise']) THEN RAISE EXCEPTION 'Paper enrolment and cost assumptions are immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER paper_study_guard BEFORE UPDATE ON paper_studies FOR EACH ROW EXECUTE FUNCTION guard_paper_study();
