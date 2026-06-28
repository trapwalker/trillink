.PHONY: dev stop restart logs

APP     = apps/trillink
LOG     = $(APP)/.dev.log
PIDFILE = $(APP)/.dev.pid

# ── dev ──────────────────────────────────────────────────────────────────────
# Kill any running instance, rotate logs, start in background.
dev: stop
	@[ -f $(LOG).1 ] && mv -f $(LOG).1 $(LOG).2 2>/dev/null || true
	@[ -f $(LOG) ]   && mv -f $(LOG)   $(LOG).1 2>/dev/null || true
	@pnpm --filter trillink dev > $(LOG) 2>&1 & echo $$! > $(PIDFILE)
	@sleep 2 && grep -E "(Network|trillink)" $(LOG) | head -5 || true
	@echo ""
	@echo "  Log: make logs   (or: tail -F $(LOG))"

# ── stop ─────────────────────────────────────────────────────────────────────
stop:
	@if [ -f $(PIDFILE) ]; then \
	  PID=$$(cat $(PIDFILE)); \
	  pkill -P $$PID 2>/dev/null || true; \
	  kill $$PID 2>/dev/null && printf "  Stopped PID $$PID\n" || true; \
	  rm -f $(PIDFILE); \
	fi
	@pkill -f "vite --host" 2>/dev/null || true

# ── restart ───────────────────────────────────────────────────────────────────
restart: stop dev

# ── logs ─────────────────────────────────────────────────────────────────────
# Follow the dev server log. ANSI colours and QR code render correctly here.
logs:
	tail -F $(LOG)
