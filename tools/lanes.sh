#!/bin/bash
# One look at every worktree: branch, commits ahead/behind main, uncommitted files, dev server up?
# plus each running lane subagent's context size. The first thing to run after a crash or a relaunch
# (orchestrator handoff). Usage: bash tools/lanes.sh
#   bash tools/lanes.sh --watch [K] [skip-id …] — loops until a running subagent's context passes K thousand
#   tokens (default 250), prints it and exits. Run it in the background; when it exits, SendMessage that agent
#   "WRAP UP" (.planning/handoffs/LANE-AGENT-BRIEF.md § Stop) and restart the watch with its id skipped.
# Ports: the lanes table in .planning/handoffs/HANDOFF-2026-10-25-orchestrator.md — keep the two in step.

# A subagent's context = its last turn's input + cache tokens, read from its transcript (2026-11-09).
agents () { python3 - "$@" <<'PY'
import json, glob, os, sys, time
th, skip = int(sys.argv[1]), sys.argv[2:]
for meta in glob.glob(os.path.expanduser('~/.claude/projects/-Users-ledogen-CodeShit-CarGame/*/subagents/*.meta.json')):
    m = json.load(open(meta)); log = meta.replace('.meta.json', '.jsonl'); aid = os.path.basename(log)[6:-6]
    if m.get('finished') or aid in skip or not os.path.exists(log) or time.time() - os.path.getmtime(log) > 3 * 3600: continue
    u = None
    for line in open(log):
        msg = json.loads(line).get('message')
        if isinstance(msg, dict) and msg.get('usage'): u = msg['usage']
    k = (u['input_tokens'] + u['cache_read_input_tokens'] + u['cache_creation_input_tokens']) // 1000 if u else 0
    if k >= th: print(f"subagent {aid:<18} {k:>4}k  {m.get('description', '')}")
PY
}
if [ "$1" = --watch ]; then
  th=${2:-250}; shift; [ $# -gt 0 ] && shift
  until hit=$(agents "$th" "$@") && [ -n "$hit" ]; do sleep 120; done
  echo "$hit"; exit 0
fi

port_of () { case "$(basename "$1")" in
  CarGame) echo 8000 ;; CarGame-run-shape) echo 3731 ;; CarGame-machine) echo 3282 ;;
  CarGame-content) echo 3774 ;; CarGame-spare) echo 3885 ;; *) echo '' ;; esac; }
main=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
printf '%-20s %-30s %-9s %-6s %s\n' WORKTREE BRANCH 'AHEAD/BEH' DIRTY SERVER
git -C "$main" worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r w; do
  b=$(git -C "$w" branch --show-current); ab=$(git -C "$w" rev-list --left-right --count HEAD...main 2>/dev/null | tr '\t' '/')
  d=$(git -C "$w" status --porcelain | wc -l | tr -d ' '); p=$(port_of "$w")
  s='-'; [ -n "$p" ] && { lsof -iTCP:"$p" -sTCP:LISTEN -n -P >/dev/null 2>&1 && s=":$p up" || s=":$p DOWN"; }
  printf '%-20s %-30s %-9s %-6s %s\n' "$(basename "$w")" "${b:-(detached)}" "$ab" "$d" "$s"
done
lsof -iTCP:8010 -sTCP:LISTEN -n -P >/dev/null 2>&1 && echo 'dashboard :8010 up' || echo 'dashboard :8010 DOWN (npm run dash)'
agents 0
