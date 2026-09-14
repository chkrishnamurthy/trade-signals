# @equitywise/archive

Local research tooling for the Telegram/Feather backtesting work
(`docs/planning/telegram-feather-backtesting.md`). **Local-only** — this package
is not imported by `apps/web` or `apps/worker`, so it never ships to production.

Runtime decision (2026-09-13): ingestion is TypeScript/Node, not Perl. This
package supersedes `scripts/archive/feather-probe.pl`.

## What's here (Increment A: stages 1–2 of the plan)

- **`feather-probe.ts`** — read-only envelope probe. Reads only the file's head
  and tail (16 bytes for a V2 file), so a multi-gigabyte archive is inspected as
  cheaply as a tiny one. Detects Feather V2 / Arrow IPC vs legacy Feather V1 vs
  unknown, and whether head magic, trailing magic and the declared footer length
  are mutually consistent. It never validates the schema or decodes the body.
  - CLI: `pnpm --filter @equitywise/archive probe FILE.feather`
    (exit 0 = consistent envelope, 2 = inconsistent/unknown).
- **`feather-reader.ts`** — bounded `apache-arrow` File-reader wrapper.
  `describeSchema` reads the schema and batch count without decoding bodies;
  `readBatch` decodes a *single* selected batch and refuses to allocate past a
  byte budget (checked against the footer's declared body length before decode).
  Never `read_all()` — one compressed batch can exceed RAM.

## Key finding — compression codecs

`apache-arrow@17` (JS) registers **no** compression codecs. Uncompressed
Feather V2 reads correctly; a batch whose body is **LZ4- or ZSTD-compressed
cannot be decoded in pure JS** and surfaces here as `UnsupportedBatchError`.

This is the central open question for the ingestion stage: **if the real Telegram
files are compressed Feather V2, a native Arrow reader (or a conversion step) is
required.** Resolving it needs a real sample file (Increment B, input #2).

## Native reader (pyarrow helper)

`apache-arrow` JS cannot decode this channel's compressed Feather bodies, so
`py/feather_reader.py` (pyarrow) does the real reads. `src/native-feather.ts`
wraps it as a subprocess (JSON over stdout): `nativeSchema`, `nativeHead`,
`nativeSummary`. This is the plan's "native Arrow helper process" — local
research tooling only, never part of the deployed web app or worker.

Install once: `python3 -m pip install --user pyarrow`.

## Telegram scripts (local-only)

Credentials come from the root `.env` (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`);
the login session and downloads live under gitignored `.archive-data/`.

- `tg:login` — one-time interactive login (phone / code / 2FA).
- `tg:list [n]` — list channel files, smallest first.
- `tg:get <messageId>` — download one file and inspect it (probe + schema + summary).
- `tg:dashboard` — a local-only web UI (loopback `127.0.0.1:4599`) to browse the
  file list and click to download + inspect. Never deployed; refuses non-loopback
  hosts on mutating requests.

## What the channel actually holds (confirmed)

Daily **F&O** (derivatives) minute candles — NOT NSE cash equity. Three series:
`*-bfo-data.feather` (BSE index F&O), `*-index-nfo-data.feather` (NSE index F&O),
`*_tick_data.zip` (raw ticks). Feather columns: date (ns, IST), OHLC (float
rupees), volume, oi, symbol, name, expiry, strike, instrument_type.

## Not yet built

- `index-nfo-data` and `tick_data.zip` series not yet inspected.
- Normalization to integer paise + contract identity; a local research DB.
- Durable jobs/leases, resumable downloads, and any backtest/replay engine.
- Dashboard inspect currently opens a fresh Telegram connection per request
  (~15s); a persistent client would speed it up.
