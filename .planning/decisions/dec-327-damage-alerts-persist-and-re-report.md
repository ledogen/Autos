---
id: DEC-327
status: standing
decided: 2026-11-16
area: ui
governs: FEAT-216, src/alerts.js, src/main.js, test/alert-reports.mjs, #machine-word
supersedes:
---
# DEC-327: Critical damage alerts stay up and cycle; the rest re-report every 10 %

**Ruling.** "They shouldn't fire only once I think some things categorized as critical failures Like a flat tire and a failed wheel Should always be present and if multiple are they can scroll between them Things like the oil and the air filter should say the oil is dirty at 50% The same thing at 40% and then say the oil is very dirty at 30% Same with the air filter Everything else can also re-report every 10%"

**Why.** The owner's look at the FEAT-216 alerts ("Words and look are fine").

**Replaces.** The one-shot, 4 s-then-gone behaviour of FEAT-216's first build (no earlier record).

**Source.** Owner, card feat216-look, 2026-11-16. Owner's words.
