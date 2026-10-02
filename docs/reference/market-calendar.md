# Market calendar

The authenticated Market Calendar at `/calendar` presents stored NSE holidays,
company events, and corporate actions as an IST date-grouped timeline. Its data is
informational and configuration-backed; it is not a claim of exhaustive exchange
coverage.

## Event source

- Non-holiday events are maintained in `config/market-calendar.yaml`.
- NSE equity holidays are derived from `config/nse-calendar.yaml`.
- Each configured row has a stable `key`. The worker persists it as `source_key`
  and uses it for idempotent updates.
- Optional `event_time` values in YAML are `HH:mm` IST wall-clock times. The worker
  converts them to UTC before storing them in the `TIMESTAMPTZ` column.
- The worker runs the sync during normal startup, every day at 06:35 IST, and on
  demand as `--once market-calendar-sync`.

## `GET /api/market-calendar`

The endpoint is authenticated and returns `Cache-Control: no-store`.

| Parameter | Meaning |
| --- | --- |
| `from` | Optional inclusive IST date key in `YYYY-MM-DD`; must be supplied with `to`. |
| `to` | Optional inclusive IST date key in `YYYY-MM-DD`; must be supplied with `from`. |
| `eventType` | Optional supported event-type id. |
| `watchlistOnly` | Optional `true` or `false`; defaults to `false`. |

With no date parameters, the current calendar month in IST is used. Ranges
longer than 366 inclusive calendar days are rejected. Invalid queries use the shared
JSON error shape with code `INVALID_QUERY`.

The response contains:

- `events`, ordered by date, supplied time, importance, title, and id;
- fixed summary counts for today, this week's results, the next 30 days of corporate
  actions, and the next 30 days of watchlist-related events;
- explicit date-only timing copy: holidays say `Market closed`, while other events
  without a published time say `Time not published`;
- the applied `filters`;
- `hasWatchlists` and the server's UTC `nowIso` value.

`watchlistOnly=true` matches exact instrument ids and normalized symbols from the
signed-in user's watchlists. A user with no watched instruments receives an empty
successful result.

## Supported event types

`market_holiday`, `result`, `board_meeting`, `dividend`, `bonus`, `stock_split`,
`rights_issue`, `buyback`, `ipo`, and `corporate_announcement`.

## Updating events

Edit the versioned YAML and retain an event's key when correcting its details. The
sync updates existing rows and does not remove a row merely because it disappeared
from the file. Verify the source name, date, and source URL before committing a new
event.
