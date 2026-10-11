---
name: Public launch risk register
status: active
horizon: now
created: 2026-10-11
updated: 2026-10-11
area: [product, legal, security, operations]
summary: Ranked launch risks and stop conditions for EquityWise.
owner: krishna
---

# Public launch risk register

| Risk | Severity / likelihood | Evidence | Mitigation and closure | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| Core market-data use lacks a public-product licence | Critical / High | NSE agreement requirement; FYERS terms conflict with technical/paper use | Obtain written NSE/provider rights or replace/disable affected functionality | Owner + counsel | Open |
| Production provider credential is invalid | High / Current | Live app: indices unavailable/re-authorise; status unknown | Repair worker credential lifecycle, confirm self-heal and observe a full session | Operations | Open |
| Ungated or wrong-SHA production deploy | Critical / Medium | Old parallel workflow removed; remote forced script not verified | Install exact-SHA, build-before-migrate server contract; protect `main`; rehearse failure | Operations | Open |
| Admin account without MFA | High / Current | Production Account & Security shows Off | Enable and test TOTP/recovery for all admins | Owner | Open |
| No verified restore path | Critical / Medium | Runbook exists; no dated restore evidence available | Run restore drill, measure RTO/RPO, retain off-server copy | Operations | Open |
| Legal/grievance copy incomplete | High / High | Name/address and response commitments unresolved | Supply details and obtain professional review | Owner + counsel | Open |
| Third-party IPO/AMFI content used without permission | High / High | Published terms restrict copying/commercial use | Disable by default; obtain written permission or replace | Product + counsel | Open |
| Avatar metadata exposes location/device facts | High / Medium | Files are served byte-for-byte | Re-encode/strip metadata and remediate existing files | Engineering | Open |
| Worker feed/socket stopped or stale | High / Current | Admin paper page: no samples/socket stopped; unresolved alerts | Configure supported provider, alert on age, verify failure UI and recovery | Operations | Open |
| Backup-retention promise mismatches deletion behavior | High / Medium | Retention duration unverified | Document retention/purge/access and align privacy/support copy | Operations + counsel | Open |
| Public promotion overstates unverified features/data | High / Medium | Assets not yet created; rights incomplete | Claim-to-screen review; only approved demo dataset/assets | Marketing + reviewer | Controlled by phase gate |
| Mobile/other-exchange branch work leaks into release | Medium / Low | Explicitly excluded by owner | Keep current-main scope and separate future work | Release owner | Controlled |

## No-go conditions

Any Critical/High row above is a public-launch stop. Data rights, cross-user privacy, financial
correctness and recoverability cannot be waived informally.
