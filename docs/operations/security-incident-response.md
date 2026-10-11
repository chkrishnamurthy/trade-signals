# Security and privacy incident response

Use this runbook for suspected account compromise, cross-user access, portfolio-data exposure,
secret leakage, malicious uploads, data-source misuse or a materially misleading market-data
incident. Preserve evidence without copying private portfolio values into tickets or chat.

## Severity and first response

| Severity | Example | First action target |
| --- | --- | --- |
| Critical | Cross-user access, auth bypass, leaked production secret, destructive database event | Stop exposure immediately; owner paged now |
| High | Account takeover, public private-data URL, wrong live financial data, disabled security gate | Contain within 30 minutes |
| Medium | Limited control weakness with no observed exposure | Same business day |
| Low | Hardening or documentation defect | Scheduled triage |

## Contain

1. Name one incident lead and start a timestamped private record.
2. If user data may be exposed, disable the affected route/feature or restrict access; do not wait
   for full root-cause certainty.
3. For a provider/data incident, stop the affected ingestion job and show data as unavailable.
4. Revoke affected sessions or credentials. Rotate a secret only through its owning provider and
   the VPS `.env`; never paste the replacement into an issue, log or chat.
5. Preserve a bounded log/database snapshot with access restricted to the incident lead. Never log
   holdings, shares, cost, password/reset tokens, TOTP secrets or OAuth tokens.

## Investigate

- Record first known occurrence, affected routes/accounts/datasets and the last known safe release.
- Determine whether access crossed an `owner_id` boundary and whether logs/backups contain the data.
- Identify the exact commit, migration, credential or provider response involved.
- Use account IDs or incident-local aliases, not email addresses, in the general timeline.
- Treat provider/exchange directions as evidence, not as authority to disclose user data.

## Recover

1. Fix and test the root cause on the release candidate.
2. Run the full required CI/DB/browser gates.
3. Restore only from a verified backup; measure recovery time and reconcile immutable/event data.
4. Deploy the exact approved commit, run `scripts/post-deploy-smoke.sh`, then verify worker and data
   freshness from the operator views.
5. Keep enhanced monitoring through the agreed observation window.

## Notify and document

- The owner, legal reviewer and affected provider are contacted through pre-approved private
  channels.
- User/regulator notification timing and content must be decided with qualified counsel based on
  verified scope. Do not speculate publicly.
- A public status note must state observable impact, current availability and next update time;
  never include user identifiers, portfolio facts, secrets or exploit details.
- Complete a post-incident review with cause, timeline, detection gap, corrective actions, owners
  and dates. Track durable fixes separately from the private evidence record.

## Secret-rotation checklist

- [ ] Determine the secret's owner and every consumer.
- [ ] Create/rotate through the provider or operating system; do not expose it to shell history.
- [ ] Update `/opt/equitywise/repo/.env` with mode `600`.
- [ ] Restart only affected processes and verify health.
- [ ] Revoke the old secret and confirm it no longer works.
- [ ] Search bounded logs for accidental disclosure and apply the retention decision.
- [ ] Record secret name, rotation time and operator—never the value.

## Vulnerability reports

Until a dedicated address is approved, route reports through the published support contact with
the subject `Security report`. Acknowledge receipt without asking the reporter to send production
personal data or secrets. The public contact and response commitment must be aligned with the
approved legal/support policy before launch.
