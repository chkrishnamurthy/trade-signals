-- Database-level guards for intraday signals.
--
-- Hand-written, like 0002: drizzle-kit does not model CHECK constraints, and
-- these enforce invariants that a comment cannot. Each one exists because the
-- failure it prevents is silent — a nonsensical score or an inverted level
-- renders perfectly happily and is simply wrong.

-- A score is a 0-100 technical strength, and its band is one of four names.
ALTER TABLE intraday_signals
  ADD CONSTRAINT intraday_signals_score_range CHECK (score BETWEEN 0 AND 100);
--> statement-breakpoint

ALTER TABLE intraday_signals
  ADD CONSTRAINT intraday_signals_quality_known
  CHECK (quality IN ('exceptional', 'strong', 'good', 'watch'));
--> statement-breakpoint

-- `long` / `short` and nothing else. This is a decision-support tool: there is
-- no order side here, and no third value that could smuggle one in.
ALTER TABLE intraday_signals
  ADD CONSTRAINT intraday_signals_direction_known CHECK (direction IN ('long', 'short'));
--> statement-breakpoint

ALTER TABLE intraday_signals
  ADD CONSTRAINT intraday_signals_state_known
  CHECK (state IN (
    'watching', 'forming', 'triggered', 'confirmed', 'active',
    'invalidated', 'expired', 'target_met'
  ));
--> statement-breakpoint

-- Prices are integer paise and strictly positive (hard rule 3).
ALTER TABLE intraday_signals
  ADD CONSTRAINT intraday_signals_prices_positive
  CHECK (
    entry_low > 0 AND entry_high > 0 AND invalidation_level > 0
    AND target1 > 0 AND target2 > 0
    AND (reference_price IS NULL OR reference_price > 0)
  );
--> statement-breakpoint

ALTER TABLE intraday_signals
  ADD CONSTRAINT intraday_signals_entry_zone_ordered CHECK (entry_high >= entry_low);
--> statement-breakpoint

-- Zero risk would make every reward-to-risk figure infinite, and the filter
-- that is supposed to reject poor structures would pass everything.
ALTER TABLE intraday_signals
  ADD CONSTRAINT intraday_signals_risk_positive
  CHECK (risk_paise > 0 AND reward_paise > 0);
--> statement-breakpoint

-- Excursions are distances, so they are never negative.
ALTER TABLE intraday_signals
  ADD CONSTRAINT intraday_signals_excursions_nonnegative
  CHECK (max_favourable >= 0 AND max_adverse >= 0);
--> statement-breakpoint

-- A terminal state must carry an end time, and a live one must not. Without
-- this, a signal can be `invalidated` and still satisfy the "live" partial
-- unique index, which would let a duplicate slip in beside it.
ALTER TABLE intraday_signals
  ADD CONSTRAINT intraday_signals_terminal_has_end
  CHECK (
    (state IN ('invalidated', 'expired', 'target_met')) = (ended_at IS NOT NULL)
  );
--> statement-breakpoint

-- A factor's category score is a 0-1 fraction of its weight.
ALTER TABLE intraday_signal_factors
  ADD CONSTRAINT intraday_signal_factors_score_range CHECK (score BETWEEN 0 AND 1);
--> statement-breakpoint

ALTER TABLE intraday_signal_reasons
  ADD CONSTRAINT intraday_signal_reasons_polarity_known
  CHECK (polarity IN ('supporting', 'opposing', 'context'));
