'use client';
import { PAPER_COSTS, sizePaperStudy } from '@equitywise/core';
import { formatPaise, type SignalDto } from '@equitywise/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_ROUTES } from '@/lib/api-routes';
import { redirectToLoginIfUnauthenticated } from '@/lib/session-guard';

/** Decimal text to paise without introducing floating-point rupees. */
export function decimalPaise(value: string): number | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) return null;
  const [whole = '', fractional = ''] = value.split('.');
  const n = Number(BigInt(whole) * 100n + BigInt(fractional.padEnd(2, '0')));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
export function PaperStudyForm({ signal, onSaved }: { signal: SignalDto; onSaved: () => void }) {
  const [capital, setCapital] = useState('100000');
  const [risk, setRisk] = useState('1');
  const [breakeven, setBreakeven] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const capitalPaise = decimalPaise(capital);
  const riskBps = decimalPaise(risk);
  const sizing =
    capitalPaise && riskBps && riskBps <= 500
      ? sizePaperStudy(signal.evidence.levels, signal.evidence.direction, capitalPaise, riskBps)
      : null;
  const eligible =
    signal.projection.state === 'ENTRY_PENDING' &&
    signal.projection.resolution === 'OBSERVED' &&
    Date.now() < signal.expiresAt &&
    signal.quoteAt !== null &&
    Date.now() >= signal.quoteAt &&
    Date.now() - signal.quoteAt <= 15_000;
  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-muted/20 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!eligible || !capitalPaise || !riskBps || !sizing?.shares || saving || saved) return;
        setSaving(true);
        setMessage(null);
        const idempotencyKey = key ?? crypto.randomUUID();
        setKey(idempotencyKey);
        try {
          const response = await fetch(API_ROUTES.paperStudies, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signalId: signal.id,
              capitalPaise,
              riskBps,
              moveToBreakeven: breakeven,
              idempotencyKey,
            }),
          });
          if (redirectToLoginIfUnauthenticated(response)) return;
          const result: unknown = await response.json();
          if (!response.ok)
            throw new Error(
              typeof result === 'object' && result !== null && 'error' in result
                ? String(result.error)
                : 'Unable to save study.',
            );
          setSaved(true);
          setMessage('Added to your private paper journal. Tracking starts now.');
          onSaved();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Unable to save study.');
        } finally {
          setSaving(false);
        }
      }}
    >
      <div>
        <h3 className="font-semibold text-sm">Private paper journal</h3>
        <p className="text-muted-foreground text-xs">
          Simulated research using sampled observations. No broker action.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor="paper-capital" className="text-xs">
          Research capital (₹)
          <Input
            inputMode="decimal"
            id="paper-capital"
            value={capital}
            disabled={saving || saved}
            onChange={(e) => {
              setCapital(e.target.value);
              setKey(null);
            }}
          />
        </label>
        <label htmlFor="paper-risk" className="text-xs">
          Risk per study (%)
          <Input
            inputMode="decimal"
            id="paper-risk"
            value={risk}
            disabled={saving || saved}
            onChange={(e) => {
              setRisk(e.target.value);
              setKey(null);
            }}
          />
        </label>
      </div>
      {sizing ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {[
            ['Simulated shares', String(sizing.shares)],
            ['Capital reserved', formatPaise(sizing.capitalRequired)],
            ['Estimated loss at invalidation', formatPaise(sizing.maxLoss)],
            ['Estimated charges', formatPaise(sizing.charges)],
            ['Net at target 1', formatPaise(sizing.target1Net)],
            ['Net at target 2', formatPaise(sizing.target2Net)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs">Enter valid capital and risk between 0.01% and 5%.</p>
      )}
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={breakeven}
          disabled={saving || saved}
          onChange={(e) => {
            setBreakeven(e.target.checked);
            setKey(null);
          }}
        />
        Move invalidation to simulated fill after target 1
      </label>
      <p className="text-muted-foreground text-xs">
        {PAPER_COSTS.slippageBps} bps adverse slippage per side, rounded to the tick. Costs:{' '}
        {PAPER_COSTS.version}. No partial exit at target 1. Existing reservations may reduce the
        final share count. Gaps can increase the loss beyond this estimate.
      </p>
      {!eligible && !saved && (
        <p className="text-muted-foreground text-xs">
          Only fresh, pending setups can be added prospectively.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <Button type="submit" size="sm" disabled={!eligible || !sizing?.shares || saving || saved}>
        {saved ? 'Added to journal' : saving ? 'Saving…' : 'Add paper study'}
      </Button>
    </form>
  );
}
