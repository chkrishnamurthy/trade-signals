import { shortDate } from '@/lib/ipo-format';
import type { IpoDetailDto } from '@/lib/ipo-types';
import { ExternalLink, FactRow, ModuleCard } from '../module-card';
import { FactSource } from './fact-source';

/**
 * Where an applicant checks allotment: the registrar's and the exchanges' own
 * pages. EquityWise never looks an application up or fills those forms in.
 */
export function IpoAllotmentLinks({ ipo, today }: { ipo: IpoDetailDto; today: string }) {
  const allotment = ipo.timeline.find((e) => e.kind === 'allotment');
  const note =
    allotment === undefined
      ? 'Available once allotment is finalised.'
      : allotment.date <= today
        ? `Allotment was finalised ${shortDate(allotment.date)}.`
        : `Available after allotment, ${shortDate(allotment.date)}${allotment.expected ? ' (expected)' : ''}.`;
  return (
    <ModuleCard id="allotment" title="Check allotment" note={note}>
      {ipo.registrar !== null && (
        <FactRow label={ipo.registrar.name}>
          {ipo.registrar.allotmentUrl === null ? (
            <span className="text-muted-foreground text-xs">No link on file</span>
          ) : (
            <ExternalLink href={ipo.registrar.allotmentUrl}>Registrar</ExternalLink>
          )}
          {ipo.registrar.allotmentUrl !== null && ipo.registrar.allotmentChecked === null && (
            <span className="block text-2xs text-subtle-foreground">not confirmed recently</span>
          )}
        </FactRow>
      )}
      {ipo.exchangeAllotment.map((link) => {
        // "NSE bid verification" → "NSE" beside "Bid verification".
        const [exchange = link.label, ...rest] = link.label.split(' ');
        const what = rest.join(' ');
        return (
          <FactRow key={link.url} label={exchange}>
            <ExternalLink href={link.url}>
              {what === '' ? link.label : `${what.charAt(0).toUpperCase()}${what.slice(1)}`}
            </ExternalLink>
          </FactRow>
        );
      })}
    </ModuleCard>
  );
}

/** Who runs the issue. */
export function IpoParticipants({ ipo }: { ipo: IpoDetailDto }) {
  const s = ipo.fieldSources;
  return (
    <ModuleCard id="parties" title="Parties">
      <FactRow label={ipo.leadManagers.length > 1 ? 'Lead managers' : 'Lead manager'}>
        {ipo.leadManagers.length === 0 ? '—' : ipo.leadManagers.join(', ')}
      </FactRow>
      <FactRow label="Registrar">
        {ipo.registrar === null ? (
          '—'
        ) : (
          <>
            {ipo.registrar.name}
            <FactSource source={s.registrarName} />
            {ipo.registrar.contact !== null && (
              <span className="block text-2xs text-muted-foreground">{ipo.registrar.contact}</span>
            )}
          </>
        )}
      </FactRow>
      {(ipo.board === 'sme' || ipo.marketMaker !== null) && (
        <FactRow label="Market maker">{ipo.marketMaker ?? '—'}</FactRow>
      )}
      {ipo.sponsorBanks.length > 0 && (
        <FactRow label="Sponsor bank">{ipo.sponsorBanks.join(', ')}</FactRow>
      )}
    </ModuleCard>
  );
}
