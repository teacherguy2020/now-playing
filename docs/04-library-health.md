# Library Health

![Library Health tab](./images/04-library-health.jpg)

Use this page to audit, fix, and queue library content without re-selecting albums.

## Current flow (Album Workbench)
1. Open **Library Operations → Albums → Album inventory**.
2. Pick an album once with **Inspect**.
3. Work in one place under **Album metadata inspector**, where album-specific tools are now grouped:
   - Metadata inspector
   - Update album art
   - Update album genre

Album context is shared across these modules so you don’t have to find the same album repeatedly.

## Scan behavior
- A scan runs automatically when the page loads.
- Results are cached (fast reopen/refresh).
- Use **Refresh full scan** when you want a full rebuild.

## Album inventory features
- Filter by artist/album/folder text.
- Sort modes (persisted in browser):
  - Album (A→Z)
  - Artist→Album
  - Oldest added
  - Newest added
- Row actions:
  - **Inspect** (loads album workbench)
  - **+** add album to queue
  - **▶** play album now
- Album thumbnails attempt, in order:
  - Folder art files (`cover|folder|front` jpg/jpeg/png)
  - Embedded artwork extraction fallback from album tracks

## Other maintenance modules
- Missing artwork finder
- Genre retagging (sample + batch)
- Ratings and unrated workflows
- MBID and artist cleanup tools
- Animated art cache management

## Tip
Run broad fixes in small batches first, verify, then continue.
