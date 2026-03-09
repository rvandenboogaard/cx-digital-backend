#!/bin/bash
# Backfill script: synct alle missende dagen voor Shopify en Dixa
# Gebruik: ./scripts/backfill.sh <BASE_URL> [START_DATE] [END_DATE]
#
# Voorbeeld:
#   ./scripts/backfill.sh https://cx-digital-backend.vercel.app 2026-02-01 2026-03-09

set -euo pipefail

BASE_URL="${1:?Gebruik: $0 <BASE_URL> [START_DATE] [END_DATE]}"
START_DATE="${2:-$(date -d '21 days ago' +%Y-%m-%d 2>/dev/null || date -v-21d +%Y-%m-%d)}"
END_DATE="${3:-$(date +%Y-%m-%d)}"
DELAY=2  # seconden tussen requests (voorkom rate limits)

echo "=== Backfill: $START_DATE t/m $END_DATE ==="
echo "    Backend: $BASE_URL"
echo ""

backfill_source() {
  local source="$1"
  local start="$START_DATE"
  echo "--- Bron: $source ---"

  while true; do
    response=$(curl -s -X POST "$BASE_URL/api/sync/backfill" \
      -H "Content-Type: application/json" \
      -d "{\"start_date\":\"$start\",\"end_date\":\"$END_DATE\",\"source\":\"$source\"}")

    # Check voor errors
    success=$(echo "$response" | grep -o '"success":true' || true)
    if [ -z "$success" ]; then
      echo "  FOUT: $response"
      echo "  Wacht 10s en probeer opnieuw..."
      sleep 10
      continue
    fi

    # Check of deze bron klaar is
    complete=$(echo "$response" | grep -o '"complete":true' || true)
    message=$(echo "$response" | grep -o '"message":"[^"]*"' | head -1 || true)

    if [ -n "$message" ]; then
      echo "  $source klaar: $message"
      break
    fi

    # Toon voortgang
    synced_date=$(echo "$response" | grep -o '"date":"[^"]*"' | head -1 | cut -d'"' -f4)
    synced_count=$(echo "$response" | grep -o '"synced":[0-9]*' | head -1 | cut -d: -f2)
    total_count=$(echo "$response" | grep -o '"total":[0-9]*' | head -1 | cut -d: -f2)
    echo "  $synced_date: $synced_count/${total_count:-?} records gesynct"

    if [ -n "$complete" ]; then
      echo "  $source klaar!"
      break
    fi

    # Volgende dag
    next_start=$(echo "$response" | grep -o '"next_start_date":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$next_start" ]; then
      start="$next_start"
    else
      break
    fi

    sleep "$DELAY"
  done

  echo ""
}

# Eerst Shopify, dan Dixa
backfill_source "shopify"
backfill_source "dixa"

echo "=== Backfill compleet! ==="
echo "Check status: curl $BASE_URL/api/sync/status"
