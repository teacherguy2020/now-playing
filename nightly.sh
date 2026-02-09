#!/usr/bin/env bash
set -euo pipefail

API="${API:-http://localhost:3101}"
LIMIT=50

# Optional: warm/rebuild Pi4 art cache for newly embedded files.
# Set to 0 if you don't care about index1080 cache freshness.
WARM_ART_CACHE=1

# For each subscription with autoDownload=true (fallback: legacy autoLatest=true):
#   - fetch episodes/list
#   - download N newest not-downloaded items
#   - include imageUrl so download-one can embed episode art
subs_json="$(curl -fsS "$API/podcasts/refresh")"

jq -c '.items[]? | select((.autoDownload == true) or (.autoLatest == true))' <<<"$subs_json" | while IFS= read -r sub; do
  rss="$(jq -r '.rss' <<<"$sub")"
  n="$(jq -r '.autoDownloadCount // .autoLatestDownloadCount // 1' <<<"$sub")"

  # Pull merged feed+disk view
  j="$(curl -fsS -X POST "$API/podcasts/episodes/list" \
        -H 'Content-Type: application/json' \
        -d "$(jq -cn --arg rss "$rss" --argjson limit "$LIMIT" '{rss:$rss,limit:$limit}')" \
      )"

  # Take up to N newest items that are not downloaded and have enclosure + id
  jq -c --argjson n "$n" '
    (.episodes // [])
    | map(select((.downloaded != true)
                 and ((.enclosure // "") != "")
                 and ((.id // "") | test("^[a-f0-9]{12}$"; "i"))))
    | .[0:$n][]
  ' <<<"$j" | while IFS= read -r ep; do

    id="$(jq -r '.id' <<<"$ep")"
    enclosure="$(jq -r '.enclosure' <<<"$ep")"
    imageUrl="$(jq -r '(.imageUrl // .image // "")' <<<"$ep")"
    title="$(jq -r '.title // ""' <<<"$ep")"
    date="$(jq -r '.date // ""' <<<"$ep")"

    # Download + embed (if imageUrl is present)
    resp="$(curl -fsS -X POST "$API/podcasts/download-one" \
      -H 'Content-Type: application/json' \
      -d "$(jq -cn \
            --arg rss "$rss" \
            --arg id "$id" \
            --arg enclosure "$enclosure" \
            --arg imageUrl "$imageUrl" \
            --arg title "$title" \
            --arg date "$date" \
            '{rss:$rss,id:$id,enclosure:$enclosure,imageUrl:$imageUrl,title:$title,date:$date}')" \
    )"

    # Optional: warm Pi4 art cache for this episode using the returned mpdPath
    if [[ "${WARM_ART_CACHE}" == "1" ]]; then
      mpdPath="$(jq -r '.mpdPath // ""' <<<"$resp")"
      if [[ -n "$mpdPath" ]]; then
        # Build the exact moOde coverart key for this file, URL-encoded
        key="$(python3 - <<PY
import urllib.parse
mpd = """$mpdPath""".strip()
print(f"http://10.0.0.254/coverart.php/{urllib.parse.quote(mpd)}")
PY
)"
        v="$(python3 - <<PY
import urllib.parse
print(urllib.parse.quote("""$key"""))
PY
)"
        curl -fsS "$API/art/current.jpg?v=$v" >/dev/null || true
      fi
    fi
  done
done

# Refresh MPD DB on moOde
ssh -o BatchMode=yes moode@10.0.0.254 "mpc update 'USB/SamsungMoode/Podcasts' || mpc update"