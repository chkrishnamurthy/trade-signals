/**
 * The ONLY place mock stocks live for stories.
 *
 * Never inline fake prices in a story — they drift from the real DTO shape.
 * Every price here is INTEGER PAISE (the app's hard money rule): ₹2,985.50 is
 * `298550`. Format for display with `formatPaise` from `@equitywise/shared`,
 * exactly as the app does. Stories never reach the network or a provider; this
 * is where their data comes from.
 */

export interface MockStock {
  readonly symbol: string;
  readonly name: string;
  /** Last traded price, in integer paise. */
  readonly lastPaise: number;
  /** Day change, in integer paise (signed). */
  readonly changePaise: number;
  /** Day change, in percent (already computed; signed). */
  readonly changePct: number;
  readonly rsi: number;
  readonly atrPaise: number;
}

export const MOCK_STOCKS: readonly MockStock[] = [
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    lastPaise: 298550,
    changePaise: 4210,
    changePct: 1.43,
    rsi: 62.4,
    atrPaise: 1820,
  },
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    lastPaise: 411030,
    changePaise: -3125,
    changePct: -0.75,
    rsi: 48.1,
    atrPaise: 2650,
  },
  {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank',
    lastPaise: 167840,
    changePaise: 980,
    changePct: 0.59,
    rsi: 55.7,
    atrPaise: 1140,
  },
  {
    symbol: 'INFY',
    name: 'Infosys',
    lastPaise: 189220,
    changePaise: -5410,
    changePct: -2.78,
    rsi: 39.2,
    atrPaise: 1560,
  },
  {
    symbol: 'ITC',
    name: 'ITC',
    lastPaise: 47615,
    changePaise: 0,
    changePct: 0.0,
    rsi: 50.0,
    atrPaise: 420,
  },
] as const;
