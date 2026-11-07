#!/usr/bin/env bash
# Run a headless-Chrome job (cdp-smoke, pad-e2e, run-soak, CDP screenshots) in one of $CHROME_SLOTS (default 2)
# machine-wide slots, so parallel lanes never stack browsers past what the box can judge. Waits for a free slot.
# The lock is lockf(1)'s, released when the job exits (crash included), so a slot never goes stale.
#   tools/chrome-slot.sh node test/cdp-smoke.mjs
# ponytail: a job that itself exits 75 (EX_TEMPFAIL, lockf's "busy") would be re-queued; none of ours do.
n=${CHROME_SLOTS:-2}
while :; do
  for i in $(seq 1 "$n"); do
    lockf -s -t 0 "/tmp/cargame-chrome-slot.$i" "$@"; rc=$?
    [ "$rc" -ne 75 ] && exit "$rc"
  done
  sleep 5
done
