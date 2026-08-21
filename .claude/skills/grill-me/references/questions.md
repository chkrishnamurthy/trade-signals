# Question bank

Ask ONE at a time. Prefer a question anchored to a line you actually read — a
specific question is worth five generic ones. Use this bank when you need the next
escalation and nothing in the code suggests a better one.

Escalation pattern: **fact → failure → combined failure → detection → prevention.**

---

## FYERS auth & tokens
1. Where is the access token stored on disk, and what are its permissions?
2. How do you know a token has expired — before you use it, or after a 401?
3. Token expires at 09:14. Market opens 09:15. Walk me through the next 60 seconds.
4. Five requests discover the expiry at the same instant. How many re-logins run?
5. Your TOTP fails three times because the machine's clock drifted. What does Fyers
   do to your account, and what does your code do next?
6. The `/vagator/v2/*` endpoints change without notice on a Tuesday. How do you find
   out — from a log, from an alert, or from a wrong number on the dashboard?
7. Prove no token has ever reached a log, an error response, or the browser.

## WebSocket & real-time
1. Why WebSocket instead of REST polling? Give me the number that decides it.
2. The socket disconnects at 09:47 during a 3% index move. Reconnects at 09:49. What
   is on screen at 09:48, and what does the user believe?
3. After reconnect, which symbols are subscribed? Prove it's the full set.
4. The socket is open, the server is alive, and no message has arrived in 90 seconds.
   Is that a dead feed or a quiet stock? How does your code decide, and what does it
   do when it's wrong in each direction?
5. The same tick arrives twice. What changes in your state? In your volume? In your
   signal?
6. A tick arrives with a timestamp older than the one you already have. What wins?
7. You subscribe to 500 symbols with a 200-symbol cap. What actually happens?
8. 1,000 ticks/second arrive. Count the React renders. Then count them again with
   the tab in the background.
9. The user closes the tab. What is still running?

## Market data correctness
1. Point at the line where a rupee float becomes integer paise. Round or truncate?
   What's the error on a ₹1,234.567 price, and does it accumulate?
2. Where does "previous close" come from? Is it the same number the day after a
   holiday? After a 1:5 split?
3. Change % on a stock whose previous close is null. Show me what renders.
4. Is your volume field cumulative or incremental? How do you know — did you check,
   or did you assume?
5. It's 14:00. The feed died at 13:20. What is visibly different on the dashboard?
6. Today is a trading holiday. What does the dashboard say?
7. A stock is halted. Another was delisted last week. A third listed this morning.
   Three different bugs — name them.
8. Your breadth number says "32 advancing of 50." Six symbols returned no data. Is
   the denominator 50 or 44? Which does the code use, and which is honest?
9. Show me one timestamp's full journey from Fyers to the screen. Name the timezone
   at every hop.

## Indicators
1. Compute RSI(14) by hand on the first 16 closes and compare to your function.
2. Wilder's smoothing or `2/(period+1)`? For which indicators? Why the difference?
3. Your EMA(26) has 26 candles. What's the first index with a non-null value, and is
   that the right index?
4. MACD signal line: when does the FIRST valid signal value appear, in bars from the
   start of the series? Justify the number.
5. One close in the middle of your series is null. Trace it through ATR.
6. Open your indicator test. Where did the expected numbers come from? If they came
   from running this function, what exactly is that test testing?
7. Your indicator disagrees with TradingView by 0.4. Is that a bug or a convention
   difference? How would you tell?

## Signals & trading logic
1. Which candle does the engine see last, and is it closed? Show me the line.
2. What price would a backtest fill at, and what price would you actually get?
3. 40 candles, config wants 200. What comes out?
4. RSI says oversold, MACD says bearish, price is below the 200 EMA. What does your
   engine emit and why that rather than the opposite?
5. Your UI shows a strength number. Explain what it means in terms a trader could
   act on. If you can't, why is it on screen?
6. What is your signal's hit rate? If you don't know, what is the number on screen
   actually telling anyone?
7. You change one weight. What must happen in the database before that takes effect?
8. Same input candles, run twice, a day apart. Same signal? Prove it.
9. Where did the RSI 30/70 threshold come from, and why is it the same for a bank and
   a small-cap?

## Frontend
1. Which components are client components, and did you choose that or inherit it?
2. Two fetches in flight, the first resolves last. Which data is displayed?
3. `/api/dashboard` returns 500. Draw me the screen.
4. Name every re-render caused by one tick.
5. Your movers list reorders every few seconds. What are you using as the key?
6. Someone red-green colorblind opens this. What information is lost?
7. Open the stock drawer with a keyboard only. Then close it. Walk me through it.
8. Two tabs open on the same dashboard. Two sockets, or one? Two rate-limit budgets,
   or one?

## Backend & API
1. `GET /api/dashboard/NOTANINDEX`. Status code and body?
2. Which of your routes are cached by Next.js right now? Prove it, don't guess.
3. What's in the response body when the upstream call fails — and is any of it from
   the upstream error?
4. Rate limiter: is it per-process? What is the worker doing at the same moment?
5. Your limiter's queue is unbounded. 5,000 requests arrive. Then what?
6. One dashboard load. Count the Fyers calls, exactly.

## Database
1. Show me the index that makes your hot query fast. Now show me the query plan.
2. Where does corporate-action adjustment get applied, and what reads the unadjusted
   rows by mistake?
3. Neon scaled to zero. Your 09:15 job fires. Timeline?
4. The worker was down 09:15–10:00. What in the system notices the gap?
5. Any UPDATE on `candles` anywhere? Any persisted 5-minute table?

## Production
1. Something goes wrong at 09:17. Reconstruct it from your logs. Can you?
2. Unhandled rejection in the worker at 11:00. Is the process alive at 11:01? Do you
   know either way?
3. SIGTERM arrives mid-write. What is on disk afterwards?
4. A cron run takes 90 seconds; the interval is 60. What happens on run two?
5. Your Neon branch is gone. What is the recovery procedure and how much history is
   permanently unrecoverable?
6. Missing env var. Do you find out at boot, or at 09:15?

## The closer (use at Principal/Staff, or to end any session)
> "You're going to put real money behind a signal this app produces. What is the one
> thing in this codebase you'd have to verify by hand first — and why haven't you?"
