CREATE TABLE "paper_trades" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "paper_trades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"signal_id" bigint NOT NULL,
	"instrument_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"kind" text NOT NULL,
	"strategy" text NOT NULL,
	"direction" text NOT NULL,
	"regime" text NOT NULL,
	"score" integer NOT NULL,
	"quality" text NOT NULL,
	"entry_at" timestamp with time zone NOT NULL,
	"entry_price" integer NOT NULL,
	"exit_at" timestamp with time zone NOT NULL,
	"exit_price" integer NOT NULL,
	"exit_reason" text NOT NULL,
	"gross_paise" integer NOT NULL,
	"cost_paise" integer NOT NULL,
	"net_paise" integer NOT NULL,
	"r_multiple" double precision NOT NULL,
	"max_favourable" integer DEFAULT 0 NOT NULL,
	"max_adverse" integer DEFAULT 0 NOT NULL,
	"bars_held" integer DEFAULT 0 NOT NULL,
	"reached_target2" text DEFAULT 'false' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_signal_id_intraday_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."intraday_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paper_trades_signal_idx" ON "paper_trades" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "paper_trades_date_idx" ON "paper_trades" USING btree ("trading_date");--> statement-breakpoint
CREATE INDEX "paper_trades_score_idx" ON "paper_trades" USING btree ("trading_date","score");