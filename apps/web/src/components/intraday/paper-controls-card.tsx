import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/**
 * Placeholder for per-user paper trading (plan §10, phase 4). Disabled on
 * purpose: today the shared paper book runs on the capital in versioned config.
 * Nothing here is an order control — it is a simulation switch.
 */
export function PaperControlsCard({ capital }: { capital: string }) {
  return (
    <Card aria-labelledby="paper-controls-title">
      <CardHeader>
        <CardHeading>
          <CardTitle id="paper-controls-title">Paper trading</CardTitle>
          <CardDescription>
            Coming soon — paper trading mode. Today&apos;s results use a shared simulated book of{' '}
            {capital}.
          </CardDescription>
        </CardHeading>
        <Badge variant="warning">Coming soon</Badge>
      </CardHeader>
      <CardContent>
        <fieldset disabled className="grid gap-4 opacity-60 sm:grid-cols-3">
          <legend className="sr-only">Paper trading controls (not yet available)</legend>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <Label htmlFor="paper-enabled" className="text-sm">
              Enable paper trading
            </Label>
            <Switch id="paper-enabled" checked={false} aria-readonly />
          </div>
          <div className="rounded-md border border-border p-3">
            <Label htmlFor="paper-capital" className="text-sm">
              Simulated capital (₹)
            </Label>
            <Input id="paper-capital" className="mt-1.5" value="5,00,000" readOnly />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <Label htmlFor="paper-follow" className="text-sm">
              Auto-follow signals
            </Label>
            <Switch id="paper-follow" checked={false} aria-readonly />
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
