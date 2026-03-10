# YouTube Tab

Use the **YouTube** tab in `app.html` to queue YouTube audio to moOde/MPD without AirPlay.

## What it does

- Search YouTube from the tab
- Use a single result URL (Resolve + Send)
- Expand playlist URLs into selectable track rows
- Send selected tracks to moOde queue

Playback uses the now-playing API YouTube proxy path (`/youtube/proxy/:id`) so MPD receives a local decodable stream URL.

## Controls

- **Search**: query YouTube
- **Playlists only**: playlist-filtered search mode
- **Use**: put selected result URL in the URL box and resolve metadata
- **Expand**: expand a playlist URL into individual track checkboxes
- **Resolve**: fetch metadata for current URL
- **Send to moOde**: queue selected URL(s)

Queue modes:

- **Append**: add after current queue
- **Crop**: keep currently playing item, remove following items, then add new items
- **Replace**: clear queue and start from selected item(s)

## Playlist behavior

- Expanded rows are selectable with checkboxes
- `[Deleted video]` and `[Private video]` rows are disabled/unchecked automatically
- **Select all** toggles only selectable rows

## Metadata behavior

When YouTube tracks are queued, now-playing surfaces use YouTube metadata (title/channel/art) and share links point to the YouTube page URL.
