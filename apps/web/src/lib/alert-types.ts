import type { AlertComparator, AlertMetric } from '@equitywise/core';

/** What the alerts page and its API exchange. Prices are integer paise (rule 3). */
export interface AlertDto {
  id: number;
  symbol: string;
  name: string;
  metric: AlertMetric;
  comparator: AlertComparator;
  /** Paise for `close`; 0–100 for `rsi14`. Converted for display in the component only. */
  threshold: number;
  enabled: boolean;
  oneShot: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
}

export interface AlertEventDto {
  id: number;
  alertId: number;
  symbol: string;
  tradingDate: string;
  message: string;
  triggeredAt: string;
  acknowledged: boolean;
}

export interface AlertsOverviewDto {
  alerts: AlertDto[];
  events: AlertEventDto[];
  unacknowledged: number;
  /** The most rules one account may hold. */
  limit: number;
}
