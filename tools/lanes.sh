#!/bin/bash
# One look at every worktree: branch, commits ahead/behind main, uncommitted files, dev server up?
# The first thing to run after a crash or a relaunch (orchestrator handoff). Usage: bash tools/lanes.sh
# Ports: the lanes table in .planning/handoffs/HANDOFF-2026-10-25-orchestrator.md — keep the two in step.
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
