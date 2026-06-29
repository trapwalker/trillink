.PHONY: dev stop restart logs release

APP     = apps/trillink
LOG     = $(APP)/.dev.log
PIDFILE = $(APP)/.dev.pid

# ── dev ──────────────────────────────────────────────────────────────────────
dev: stop
	@[ -f $(LOG).1 ] && mv -f $(LOG).1 $(LOG).2 2>/dev/null || true
	@[ -f $(LOG) ]   && mv -f $(LOG)   $(LOG).1 2>/dev/null || true
	@pnpm --filter trillink dev > $(LOG) 2>&1 & echo $$! > $(PIDFILE)
	@printf "  Starting…\r"; sleep 3
	@cat $(LOG)
	@echo "  ──────────────────────────────────────"
	@echo "  Run 'make logs' to follow the log"

# ── stop ─────────────────────────────────────────────────────────────────────
stop:
	@if [ -f $(PIDFILE) ]; then \
	  PID=$$(cat $(PIDFILE)); \
	  pkill -TERM -P $$PID 2>/dev/null || true; \
	  kill -TERM $$PID 2>/dev/null && printf "  Stopped PID $$PID\n" || true; \
	  rm -f $(PIDFILE); \
	fi
	@lsof -ti TCP:5173-5180 -sTCP:LISTEN 2>/dev/null | xargs kill -TERM 2>/dev/null || true

# ── restart ───────────────────────────────────────────────────────────────────
restart: stop dev

# ── logs ─────────────────────────────────────────────────────────────────────
logs:
	tail -F -n20 $(LOG)

# ── release ───────────────────────────────────────────────────────────────────
release:
	@if [ -n "$$(git status --porcelain)" ]; then \
	  echo "  ✗ Uncommitted changes — commit first"; exit 1; \
	fi
	@echo "  Pushing to main → GitHub Actions will build and deploy…"
	@git push origin main
	@REPO=$$(git remote get-url origin 2>/dev/null | sed 's|.*github\.com[/:]||;s|\.git$$||'); \
	 [ -n "$$REPO" ] && echo "  ✓ https://github.com/$$REPO/actions" || echo "  ✓ Done"
