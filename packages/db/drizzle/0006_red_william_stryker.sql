ALTER TABLE "intraday_signals" ADD COLUMN "cost_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "intraday_signals" ADD COLUMN "net_reward_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "intraday_signals" ADD COLUMN "net_risk_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "intraday_signals" ADD COLUMN "net_risk_reward" double precision;