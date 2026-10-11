# Public launch integration failure-mode matrix

| Dependency / failure | Expected system behavior | User-visible behavior | Alert / evidence | Status |
| --- | --- | --- | --- | --- |
| Provider credential rejected | Invalidate credential, bounded refresh/retry, no fabricated data | Explicit unavailable/stale banner | Worker error plus credential-refresh event | Failure state visible; recovery currently failing |
| Provider rate limit | Back off within request budget; avoid retry storm | Delayed/unavailable with last observation time | Rate-limit metric/log without token/body | Unit-tested; live drill open |
| Provider partial response | Validate boundary and reject/mark missing fields | Partial/unavailable, never zero-filled | Structured source/job failure | Unit-tested; route audit open |
| Worker stopped | Web remains read-only; freshness ages naturally | Stale/unavailable state on affected surfaces | Process/freshness alert | VPS alert path open |
| Missing candle / interrupted feed | No forming candle, trigger backfill or invented outcome | Gap/unavailable explanation | Ingestion run and risk event | Core/DB tests pass |
| Email provider failure | Do not leak account existence; bounded retry where safe | Generic accepted message for reset; support route for prolonged outage | Status/error only, no recipient/body | Code remediated; live drill open |
| Google OAuth callback error | Reject invalid state/code; keep password access available | Safe sign-in error and retry | Redacted auth event | Unit-tested; production re-login open |
| Database unavailable | Connection retry/backoff; no partial write acknowledgement | Service unavailable response | PM2/DB alert | Worker tests exist; production drill open |
| Migration failure | Stop before restart; old app continues against compatible schema | Existing release remains available | CI/deploy failure | Remote script unverified |
| New app fails post-deploy | Smoke fails and release operator invokes rollback | Short maintenance/error state only if unavoidable | GitHub deploy failure | Smoke exists; rollback rehearsal open |
| SSE proxy buffering/disconnect | Reconnect/fallback sweep without duplicate state | Freshness indicator changes honestly | Connection logs/metric | Nginx verification open |
| IPO source unavailable | Continue independent sources; record partial run | Source-specific unavailable/last-sync state | Admin IPO feed health | Technically implemented; rights open |
| Unlicensed source | Disable ingestion/display; retain no promotional copy | Feature absent with no implied coverage | Rights matrix + config decision | Open blocker |
| Backup or restore failure | Stop launch/deploy; preserve current service and investigate | No public claim of recoverability | Restore drill output and alert | No evidence obtained |
