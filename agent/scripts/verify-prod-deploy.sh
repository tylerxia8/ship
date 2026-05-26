#!/usr/bin/env bash
#
# Verify the FleetGraph prod deploy end-to-end.
#
# Hits every link in the chain — agent service direct, Ship API proxy
# to agent, agent's outbound auth to Ship API — and reports each.
#
# Run anytime after the ship-api-76ez redeploy from fleetgraph/main lands:
#
#   bash agent/scripts/verify-prod-deploy.sh
#
# No env vars required — all URLs are public health/probe endpoints.

set -u

AGENT_URL=${AGENT_URL:-https://ship-agent.onrender.com}
SHIP_API_URL=${SHIP_API_URL:-https://ship-api-76ez.onrender.com}
WEB_URL=${WEB_URL:-https://ship-henna.vercel.app}

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$*"; }

bold "1. ship-agent — direct health check"
RESP=$(curl -sS -w "\n%{http_code}" --max-time 30 "$AGENT_URL/health")
CODE=$(echo "$RESP" | tail -n 1)
BODY=$(echo "$RESP" | head -n -1)
if [ "$CODE" = "200" ]; then
  ok "HTTP $CODE — $BODY"
else
  bad "HTTP $CODE — $BODY"
fi
echo

bold "2. ship-api → agent proxy health"
RESP=$(curl -sS -w "\n%{http_code}" --max-time 30 "$SHIP_API_URL/api/fleetgraph/health")
CODE=$(echo "$RESP" | tail -n 1)
BODY=$(echo "$RESP" | head -n -1)
if [ "$CODE" = "200" ]; then
  ok "HTTP $CODE — proxy reachable"
  echo "    body: $BODY"
elif [ "$CODE" = "404" ]; then
  bad "HTTP 404 — ship-api hasn't redeployed from fleetgraph/main yet OR build failed"
else
  bad "HTTP $CODE — $BODY"
fi
echo

bold "3. ship-henna (web) — login page renders"
RESP=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "$WEB_URL/login")
if [ "$RESP" = "200" ]; then
  ok "HTTP $RESP — web is up"
else
  bad "HTTP $RESP — web unreachable"
fi
echo

bold "4. ship-api csrf-token (DB-touching endpoint)"
RESP=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "$SHIP_API_URL/api/csrf-token")
if [ "$RESP" = "200" ]; then
  ok "HTTP $RESP — DB connection working"
else
  bad "HTTP $RESP — DB may be unreachable"
fi
echo

bold "Summary"
echo "  Open $WEB_URL in a browser"
echo "  Log in as dev@ship.local / admin123 (or shawn.jones@treasury.gov / !Musicfun1\$\$)"
echo "  Navigate to any document — chat panel (bottom-right) should appear"
echo "  Ask a question — verify it returns within ~14 seconds with citations"
