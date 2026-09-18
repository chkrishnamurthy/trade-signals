-- Hand-written (the drizzle-kit snapshot chain stops at 0017). Per-user paper
-- trading: docs/planning/paper-trading-plan.md §7.2, Phase 1.
--
-- Money is integer paise (bigint). Orders, fills, position events, ledger
-- entries and audit events are append-only; positions and settings are the
-- mutable projections, with their identity columns frozen by trigger.

CREATE TABLE "paper_portfolios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_portfolios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"starting_capital_paise" bigint NOT NULL,
	"reset_generation" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "paper_portfolios_capital_positive" CHECK ("paper_portfolios"."starting_capital_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "paper_settings" (
	"portfolio_id" integer PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"entries_paused" boolean DEFAULT false NOT NULL,
	"entries_paused_at" timestamp with time zone,
	"risk_bps" integer NOT NULL,
	"max_open_positions" integer NOT NULL,
	"max_trades_per_day" integer NOT NULL,
	"max_position_exposure_bps" integer NOT NULL,
	"max_portfolio_exposure_bps" integer NOT NULL,
	"max_stock_exposure_bps" integer NOT NULL,
	"max_sector_exposure_bps" integer NOT NULL,
	"daily_loss_halt_bps" integer NOT NULL,
	"max_drawdown_halt_bps" integer NOT NULL,
	"settings_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "paper_settings_bounds" CHECK ("paper_settings"."risk_bps" between 10 and 200 and "paper_settings"."max_open_positions" between 1 and 5 and "paper_settings"."max_trades_per_day" between 1 and 10 and "paper_settings"."max_position_exposure_bps" between 500 and 5000 and "paper_settings"."max_portfolio_exposure_bps" between 1000 and 10000 and "paper_settings"."max_stock_exposure_bps" between 500 and 5000 and "paper_settings"."max_sector_exposure_bps" between 1000 and 10000 and "paper_settings"."daily_loss_halt_bps" between 50 and 500 and "paper_settings"."max_drawdown_halt_bps" between 200 and 2000),
	CONSTRAINT "paper_settings_enabled_at" CHECK (("paper_settings"."enabled" = false) or ("paper_settings"."enabled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "paper_strategy_assignments" (
	"portfolio_id" integer NOT NULL,
	"strategy_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "paper_strategy_assignments_portfolio_id_strategy_id_pk" PRIMARY KEY("portfolio_id","strategy_id"),
	CONSTRAINT "paper_strategy_assignments_priority" CHECK ("paper_strategy_assignments"."priority" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "paper_orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"portfolio_id" integer NOT NULL,
	"intent_id" integer NOT NULL,
	"strategy_id" text NOT NULL,
	"strategy_version_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"direction" text NOT NULL,
	"side" text NOT NULL,
	"leg" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'MARKET_NEXT' NOT NULL,
	"requested_shares" integer NOT NULL,
	"status" text NOT NULL,
	"reason_code" text,
	"reason_text" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"settings_version" integer NOT NULL,
	"engine_revision" integer NOT NULL,
	"decision" jsonb NOT NULL,
	"intent" jsonb NOT NULL,
	"reset_generation" integer NOT NULL,
	CONSTRAINT "paper_orders_status" CHECK ("paper_orders"."status" in ('PENDING','ACCEPTED','FILLED','REJECTED','EXPIRED','CANCELLED')),
	CONSTRAINT "paper_orders_reason" CHECK ("paper_orders"."status" <> 'REJECTED' or "paper_orders"."reason_code" is not null),
	CONSTRAINT "paper_orders_side" CHECK ("paper_orders"."side" in ('ENTRY','EXIT') and "paper_orders"."leg" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "paper_fills" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_fills_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"portfolio_id" integer NOT NULL,
	"position_id" integer NOT NULL,
	"leg" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"price_paise" integer NOT NULL,
	"shares" integer NOT NULL,
	"charges_paise" bigint NOT NULL,
	"resolution" text NOT NULL,
	"observation_id" bigint,
	CONSTRAINT "paper_fills_valid" CHECK ("paper_fills"."price_paise" > 0 and "paper_fills"."shares" > 0 and "paper_fills"."charges_paise" >= 0 and "paper_fills"."leg" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "paper_positions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_positions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"portfolio_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"intent_id" integer NOT NULL,
	"strategy_id" text NOT NULL,
	"strategy_version_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"sector" text,
	"direction" text NOT NULL,
	"trading_date" date NOT NULL,
	"status" text NOT NULL,
	"projection" jsonb NOT NULL,
	"decided_shares" integer NOT NULL,
	"reserve_paise" bigint NOT NULL,
	"locked_paise" bigint DEFAULT 0 NOT NULL,
	"gross_realised_paise" bigint DEFAULT 0 NOT NULL,
	"charges_paise" bigint DEFAULT 0 NOT NULL,
	"net_realised_paise" bigint DEFAULT 0 NOT NULL,
	"initial_risk_paise" bigint,
	"exit_reason" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"square_off_at" timestamp with time zone,
	"reset_generation" integer NOT NULL,
	CONSTRAINT "paper_positions_status" CHECK ("paper_positions"."status" in ('OPEN','EXIT_PENDING','CLOSED')),
	CONSTRAINT "paper_positions_closed" CHECK (("paper_positions"."closed_at" is null) = ("paper_positions"."status" <> 'CLOSED')),
	CONSTRAINT "paper_positions_money" CHECK ("paper_positions"."locked_paise" >= 0 and "paper_positions"."charges_paise" >= 0 and "paper_positions"."reserve_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "paper_position_events" (
	"position_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"price_paise" integer,
	"shares" integer,
	"explanation" text NOT NULL,
	"observation_id" bigint,
	CONSTRAINT "paper_position_events_position_id_sequence_pk" PRIMARY KEY("position_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "paper_ledger_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_ledger_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"portfolio_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"cash_after_paise" bigint NOT NULL,
	"reserved_after_paise" bigint NOT NULL,
	"locked_after_paise" bigint NOT NULL,
	"locked_delta_paise" bigint DEFAULT 0 NOT NULL,
	"ref_kind" text NOT NULL,
	"ref_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"reset_generation" integer NOT NULL,
	CONSTRAINT "paper_ledger_nonnegative" CHECK ("paper_ledger_entries"."cash_after_paise" >= 0 and "paper_ledger_entries"."reserved_after_paise" >= 0 and "paper_ledger_entries"."locked_after_paise" >= 0),
	CONSTRAINT "paper_ledger_kind" CHECK ("paper_ledger_entries"."kind" in ('OPENING_BALANCE','RESERVE','RELEASE','ENTRY','EXIT','CHARGES','ADJUSTMENT_RECONCILE'))
);
--> statement-breakpoint
CREATE TABLE "paper_equity_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_equity_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"portfolio_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"cash_paise" bigint NOT NULL,
	"reserved_paise" bigint NOT NULL,
	"locked_paise" bigint NOT NULL,
	"unrealised_paise" bigint,
	"equity_paise" bigint,
	"peak_equity_paise" bigint NOT NULL,
	"drawdown_paise" bigint,
	"exposure_paise" bigint NOT NULL,
	"marks_complete" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_risk_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_risk_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"portfolio_id" integer,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"detail" jsonb NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "paper_audit_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone NOT NULL,
	"user_id" integer,
	"portfolio_id" integer,
	"event" text NOT NULL,
	"detail" jsonb NOT NULL,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "worker_checkpoints" (
	"job" text PRIMARY KEY NOT NULL,
	"cursor" jsonb NOT NULL,
	"run_id" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_sessions" (
	"exchange" text NOT NULL,
	"trading_date" date NOT NULL,
	"kind" text NOT NULL,
	"open_at" timestamp with time zone,
	"close_at" timestamp with time zone,
	"entry_cutoff_at" timestamp with time zone,
	"square_off_at" timestamp with time zone,
	"source" text NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exchange_sessions_exchange_trading_date_pk" PRIMARY KEY("exchange","trading_date"),
	CONSTRAINT "exchange_sessions_kind" CHECK ("exchange_sessions"."kind" in ('NORMAL','HOLIDAY','SPECIAL','MUHURAT','CLOSED_UNSCHEDULED','WEEKEND'))
);
--> statement-breakpoint
CREATE TABLE "instrument_provider_refs" (
	"instrument_id" integer NOT NULL,
	"provider_id" text NOT NULL,
	"provider_ref" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "instrument_provider_refs_instrument_id_provider_id_pk" PRIMARY KEY("instrument_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "paper_portfolios" ADD CONSTRAINT "paper_portfolios_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_settings" ADD CONSTRAINT "paper_settings_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_strategy_assignments" ADD CONSTRAINT "paper_strategy_assignments_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_intent_id_strategy_signals_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."strategy_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_fills" ADD CONSTRAINT "paper_fills_order_id_paper_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."paper_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_fills" ADD CONSTRAINT "paper_fills_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_order_id_paper_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."paper_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_intent_id_strategy_signals_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."strategy_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_position_events" ADD CONSTRAINT "paper_position_events_position_id_paper_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."paper_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_ledger_entries" ADD CONSTRAINT "paper_ledger_entries_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_equity_snapshots" ADD CONSTRAINT "paper_equity_snapshots_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_risk_events" ADD CONSTRAINT "paper_risk_events_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument_provider_refs" ADD CONSTRAINT "instrument_provider_refs_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paper_portfolios_user_idx" ON "paper_portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_orders_idempotency_idx" ON "paper_orders" USING btree ("portfolio_id","intent_id","side","leg");--> statement-breakpoint
CREATE INDEX "paper_orders_portfolio_decided_idx" ON "paper_orders" USING btree ("portfolio_id","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_fills_position_leg_idx" ON "paper_fills" USING btree ("position_id","leg");--> statement-breakpoint
CREATE INDEX "paper_fills_portfolio_at_idx" ON "paper_fills" USING btree ("portfolio_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_positions_intent_idx" ON "paper_positions" USING btree ("portfolio_id","intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_positions_one_live_idx" ON "paper_positions" USING btree ("portfolio_id","instrument_id") WHERE "paper_positions"."status" <> 'CLOSED';--> statement-breakpoint
CREATE INDEX "paper_positions_portfolio_status_idx" ON "paper_positions" USING btree ("portfolio_id","status");--> statement-breakpoint
CREATE INDEX "paper_positions_portfolio_date_idx" ON "paper_positions" USING btree ("portfolio_id","trading_date");--> statement-breakpoint
CREATE INDEX "paper_positions_version_idx" ON "paper_positions" USING btree ("strategy_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_ledger_sequence_idx" ON "paper_ledger_entries" USING btree ("portfolio_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_ledger_idempotency_idx" ON "paper_ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_equity_snapshots_at_idx" ON "paper_equity_snapshots" USING btree ("portfolio_id","at");--> statement-breakpoint
CREATE INDEX "paper_equity_snapshots_date_idx" ON "paper_equity_snapshots" USING btree ("portfolio_id","trading_date");--> statement-breakpoint
CREATE INDEX "paper_risk_events_portfolio_idx" ON "paper_risk_events" USING btree ("portfolio_id","at");--> statement-breakpoint
CREATE INDEX "paper_audit_events_portfolio_idx" ON "paper_audit_events" USING btree ("portfolio_id","at");--> statement-breakpoint
-- Append-only: fills, position events, ledger entries, audit events (reject_mutation from 0002).
CREATE TRIGGER "paper_fills_no_update" BEFORE UPDATE ON "paper_fills" FOR EACH ROW EXECUTE FUNCTION reject_mutation();--> statement-breakpoint
CREATE TRIGGER "paper_position_events_no_update" BEFORE UPDATE ON "paper_position_events" FOR EACH ROW EXECUTE FUNCTION reject_mutation();--> statement-breakpoint
CREATE TRIGGER "paper_ledger_entries_no_update" BEFORE UPDATE ON "paper_ledger_entries" FOR EACH ROW EXECUTE FUNCTION reject_mutation();--> statement-breakpoint
CREATE TRIGGER "paper_audit_events_no_update" BEFORE UPDATE ON "paper_audit_events" FOR EACH ROW EXECUTE FUNCTION reject_mutation();--> statement-breakpoint
-- Orders: only forward status transitions; everything else is frozen.
CREATE OR REPLACE FUNCTION paper_orders_forward_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.portfolio_id <> OLD.portfolio_id OR NEW.intent_id <> OLD.intent_id OR NEW.side <> OLD.side OR NEW.leg <> OLD.leg
     OR NEW.requested_shares <> OLD.requested_shares OR NEW.decision IS DISTINCT FROM OLD.decision OR NEW.intent IS DISTINCT FROM OLD.intent
     OR NEW.decided_at <> OLD.decided_at OR NEW.strategy_version_id <> OLD.strategy_version_id THEN
    RAISE EXCEPTION 'paper_orders: only status may change';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'PENDING'  AND NEW.status IN ('ACCEPTED','REJECTED','EXPIRED','CANCELLED'))
    OR (OLD.status = 'ACCEPTED' AND NEW.status IN ('FILLED','EXPIRED','CANCELLED'))) THEN
    RAISE EXCEPTION 'paper_orders: % -> % is not a forward transition', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "paper_orders_forward_only" BEFORE UPDATE ON "paper_orders" FOR EACH ROW EXECUTE FUNCTION paper_orders_forward_only();--> statement-breakpoint
-- Positions: identity and the strategy version that opened them never change.
CREATE OR REPLACE FUNCTION paper_positions_freeze_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.portfolio_id <> OLD.portfolio_id OR NEW.order_id <> OLD.order_id OR NEW.intent_id <> OLD.intent_id
     OR NEW.strategy_version_id <> OLD.strategy_version_id OR NEW.instrument_id <> OLD.instrument_id
     OR NEW.direction <> OLD.direction OR NEW.decided_shares <> OLD.decided_shares OR NEW.reserve_paise <> OLD.reserve_paise
     OR NEW.trading_date <> OLD.trading_date THEN
    RAISE EXCEPTION 'paper_positions: identity columns are immutable';
  END IF;
  IF OLD.status = 'CLOSED' AND NEW.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'paper_positions: a closed paper trade cannot reopen';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "paper_positions_freeze_identity" BEFORE UPDATE ON "paper_positions" FOR EACH ROW EXECUTE FUNCTION paper_positions_freeze_identity();
