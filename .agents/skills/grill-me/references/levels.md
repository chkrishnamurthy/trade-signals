# Grilling levels

The level changes **which questions get asked and how much credit an answer earns**.
It never changes the static review's honesty — a 🔴 is 🔴 at every level.

## Junior
Scope: does the code do what it says. Ask about mechanics.
- "Walk me through what happens when this component mounts."
- "Where does this number come from?"
- "What is this `null` check protecting against?"
Credit: a correct mechanical explanation scores 7+. Push on one edge case each time.
Tone: still direct, but explain the missed concept after scoring.

## Mid-level
Scope: edge cases and error paths in the code they wrote.
- "What renders if this fetch rejects?"
- "This runs every 5 seconds. What stops it?"
- "What if the array is empty?"
Credit: needs the happy path AND at least one failure path to score 7+.

## Senior (default)
Scope: failure modes, concurrency, correctness of the math, trade-offs.
- Combine two conditions per question.
- Demand a number, not an adjective: "how many API calls, exactly?"
- Reject "it should be fine" and "I'd probably add..." — ask what the code does today.
Credit: 7+ requires naming the failure mode, its blast radius, and the mitigation.

## Staff
Scope: system-level consequences and the choices behind the design.
- "You chose polling. Give me the three conditions under which that becomes wrong,
  and the one where it's still the right call."
- "This invariant is stated in CLAUDE.md. Show me the mechanism that enforces it —
  not the convention, the mechanism."
- "What is the cheapest change that would let you detect this failure in production
  before a user does?"
Credit: 7+ requires trade-off reasoning with a stated cost on both sides.

## Principal
Scope: what you cannot know, and how you'd find out.
- "What in this system are you trusting that you have never verified?"
- "Rank your indicators by how much money a bug in each would cost. Justify the
  ordering."
- "If this had been silently producing wrong signals for six weeks, what would be
  different about today, and would you have noticed?"
- "What is the second-order effect of the fix you just proposed?"
Credit: 7+ requires identifying an unknown unknown and a concrete way to close it.
Accept "I don't know" here IF it comes with how they'd find out. Punish false
confidence harder than ignorance.

## Production Incident
A live-fire simulation. Change format entirely: no essay questions, timed pressure.

Open with a scenario, then run it turn by turn. Pick one:
- "09:22 IST. Dashboard shows NIFTY down 4.2%. Nothing else in the market agrees.
  You have five minutes before you'd act on it. First command?"
- "The socket has been up for two hours. Every price on screen is 40 minutes stale.
  Nothing errored. Go."
- "Your token expired at 09:14. It's 09:31. What is the state of the system right now
  — be specific about each component."
- "A signal fired BUY on a stock that was halted all morning. Explain how."

Rules for incident mode:
- One move per turn. They say what they'd check; you tell them what they'd find —
  derive it from the actual code, don't invent.
- Keep a clock. Advance it realistically per action.
- If they reach for a fix before they have a diagnosis, say so and cost them time.
- End with: root cause, the detection gap, and the one change that would have caught
  it. Score the incident 0-10 on time-to-diagnosis, not on knowing the answer.
