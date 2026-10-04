'use client';
import {
  formatPaise,
  type PaperOverview,
  type PaperSettingsResponse,
  paperSettingsResponseSchema,
} from '@equitywise/shared';
import { OctagonPauseIcon, PlayIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { API_ROUTES } from '@/lib/api-routes';
import { bps, time } from './format';
import { usePaperMutation } from './use-paper-mutation';

/**
 * The only three things a user can change (plan §4): the paper toggle, the
 * emergency stop for new entries, and which strategies run. Nothing here
 * creates, edits or closes a paper trade; every change is audited server-side.
 */
export function ControlsCard({
  data,
  onChanged,
}: {
  data: PaperOverview;
  onChanged: (next: PaperSettingsResponse) => void;
}) {
  const { settings, assignments, strategies, openTrades } = data;
  const { run, busy, error, clearError } = usePaperMutation(paperSettingsResponseSchema);
  const [confirmOn, setConfirmOn] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  const putSettings = async (patch: Record<string, unknown>) => {
    const next = await run(API_ROUTES.paperSettings, 'PUT', {
      expectedVersion: settings.settingsVersion,
      ...patch,
    });
    if (next) onChanged(next);
    return next !== null;
  };
  const stop = async (paused: boolean) => {
    const next = await run(API_ROUTES.paperEmergencyStop, 'POST', { paused });
    if (next) onChanged(next);
  };
  const setStrategy = async (strategyId: string, enabled: boolean, priority: number) => {
    const next = await run(API_ROUTES.paperStrategies, 'PUT', { strategyId, enabled, priority });
    if (next) onChanged(next);
  };
  const live = openTrades.length;
  const enabledStrategies = assignments.filter((a) => a.enabled);

  return (
    <Card aria-labelledby="paper-controls-title">
      <CardHeader>
        <CardHeading>
          <CardTitle id="paper-controls-title">Paper trading</CardTitle>
          <CardDescription>
            Simulated trades on {formatPaise(data.portfolio.startingCapitalPaise)} of virtual
            capital. No real orders are placed and no money moves.
          </CardDescription>
        </CardHeading>
        <Badge variant={settings.enabled ? 'bullish' : 'secondary'}>
          {settings.enabled ? 'ON' : 'OFF'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Change not saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!settings.enabled ? (
          <Alert>
            <AlertTitle>Paper trading is off</AlertTitle>
            <AlertDescription>
              No new trades will be taken.
              {live > 0
                ? ` ${live} open paper trade${live === 1 ? '' : 's'} will finish under the strategy's rules or at the ${time(data.session.squareOffAt)} square-off.`
                : ''}
            </AlertDescription>
          </Alert>
        ) : null}
        {settings.entriesPaused ? (
          <Alert variant="destructive">
            <AlertTitle>New entries are stopped</AlertTitle>
            <AlertDescription>
              You pressed the emergency stop. Open paper trades keep being managed; nothing new is
              entered until you resume.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border p-3">
            <Label htmlFor="paper-enabled" className="text-sm">
              Paper trading
              <span className="block text-xs font-normal text-muted-foreground">
                {settings.enabled && settings.enabledAt !== null
                  ? `On since ${time(settings.enabledAt)} IST · trades from the next signal after that`
                  : 'Trades start from the next signal after you switch on'}
              </span>
            </Label>
            <Switch
              id="paper-enabled"
              checked={settings.enabled}
              disabled={busy}
              onCheckedChange={(checked) => {
                clearError();
                if (checked) setConfirmOn(true);
                else void putSettings({ enabled: false });
              }}
              aria-label="Paper trading on or off"
            />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="text-sm">
              Emergency stop
              <span className="block text-xs text-muted-foreground">
                Stops new entries without changing your settings
              </span>
            </div>
            <Button
              variant={settings.entriesPaused ? 'default' : 'outline'}
              size="sm"
              className={
                settings.entriesPaused
                  ? ''
                  : 'border-destructive text-destructive hover:bg-destructive-soft'
              }
              disabled={busy}
              onClick={() => {
                clearError();
                if (settings.entriesPaused) void stop(false);
                else setConfirmStop(true);
              }}
            >
              {settings.entriesPaused ? (
                <PlayIcon className="size-4" aria-hidden />
              ) : (
                <OctagonPauseIcon className="size-4" aria-hidden />
              )}
              {settings.entriesPaused ? 'Resume entries' : 'Stop new entries'}
            </Button>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium">Strategies</h3>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {strategies.map((s) => {
              const a = assignments.find((x) => x.strategyId === s.id);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 p-3">
                  <Label htmlFor={`strategy-${s.id}`} className="text-sm">
                    {s.shortName} · {s.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      revision {s.revision} · {s.timeframe} candles · ties broken by {s.strength}
                    </span>
                  </Label>
                  <Switch
                    id={`strategy-${s.id}`}
                    checked={a?.enabled ?? false}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      void setStrategy(s.id, checked, a?.priority ?? 10)
                    }
                    aria-label={`${s.shortName} on or off`}
                  />
                </li>
              );
            })}
          </ul>
          {enabledStrategies.length === 0 ? (
            <p className="mt-2 text-xs text-warning-foreground">
              No strategy is enabled, so nothing will be traded even with paper trading on.
            </p>
          ) : null}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Item k="Risk per trade" v={`${bps(settings.riskBps)} of equity`} />
          <Item k="Max open paper trades" v={String(settings.maxOpenPositions)} />
          <Item k="Max trades a day" v={String(settings.maxTradesPerDay)} />
          <Item k="Daily loss halt" v={`−${bps(settings.dailyLossHaltBps)} of the day's start`} />
          <Item k="Per trade / per stock" v={`${bps(settings.maxPositionExposureBps)} of equity`} />
          <Item k="Per sector" v={`${bps(settings.maxSectorExposureBps)} of equity`} />
          <Item k="Drawdown halt" v={`−${bps(settings.maxDrawdownHaltBps)} from the peak`} />
          <Item
            k="Square-off"
            v={`${time(data.session.squareOffAt)} IST · nothing carries overnight`}
          />
        </dl>
      </CardContent>

      <Dialog open={confirmOn} onOpenChange={setConfirmOn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start paper trading?</DialogTitle>
            <DialogDescription>
              Everything here is simulated: trades, balances, profits and losses. No real orders are
              placed and no money moves.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 text-sm">
            <Item
              k="Virtual capital"
              v={
                data.balances.equityPaise === null
                  ? formatPaise(data.portfolio.startingCapitalPaise)
                  : `${formatPaise(data.balances.equityPaise)} (current equity)`
              }
            />
            <Item
              k="Strategies"
              v={
                enabledStrategies.length
                  ? enabledStrategies
                      .map(
                        (a) =>
                          strategies.find((s) => s.id === a.strategyId)?.shortName ?? a.strategyId,
                      )
                      .join(', ')
                  : 'none enabled'
              }
            />
            <Item
              k="Risk settings"
              v={`${bps(settings.riskBps)} per trade · max ${settings.maxOpenPositions} open · max ${settings.maxTradesPerDay} a day · daily loss halt ${bps(settings.dailyLossHaltBps)}`}
            />
            <Item k="Square-off" v={`${time(data.session.squareOffAt)} IST every session`} />
          </dl>
          <p className="text-sm">
            Trades start from the <strong>next signal after you switch on</strong>. Earlier signals
            today are not taken.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOn(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (await putSettings({ enabled: true })) setConfirmOn(false);
              }}
              disabled={busy}
            >
              Start paper trading
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmStop} onOpenChange={setConfirmStop}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop new entries?</DialogTitle>
            <DialogDescription>
              No new paper trades will be entered across all strategies until you resume. Open paper
              trades keep being managed to their targets, stops or the square-off. Your settings are
              not changed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStop(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await stop(true);
                setConfirmStop(false);
              }}
              disabled={busy}
            >
              Stop new entries
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
