# genre pane messaging

## Purpose

This page documents the genre-specific parent/child messaging flow used in kiosk-style embedded pane navigation.

It exists because `np-kiosk-pane-genre` is one of the first clear examples of a richer pane message beyond simple close behavior.

That makes it a useful case study for how pane drill-down coordination works in practice.

## Why this page matters

Earlier embedded-pane documentation established that child pages can ask the parent shell to close the pane.

Genre messaging goes further:
- a child page communicates semantic navigation context (`genre`)
- the embedded navigation flow continues into another child page
- the next page can reassert or propagate the genre context
- album content is then derived from an API call keyed by that genre

So this is a concrete example of pane-aware semantic drill-down.

## Important files

Primary files involved:
- `now-playing/controller-genres.html`
- `now-playing/controller-albums.html`
- `now-playing/controller.html`

Related pages:
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `controller-kiosk-mode.md`

## Key message type

Observed message type:
- `np-kiosk-pane-genre`

Observed payload shape includes fields such as:
- `type: 'np-kiosk-pane-genre'`
- `pane: 'kiosk-albums.html'`
- `genre: <selected genre>`

This suggests the parent shell is intended to know:
- which pane target should become active
- which genre context should be carried forward

## Source page: `controller-genres.html`

### User action
The key user action is clicking a genre row in:
- `#list .row[data-genre]`

### What the code does
Current repo-visible flow in `controller-genres.html`:
1. detect clicked genre row
2. decode the `data-genre` value
3. build a URL to:
   - `controller-albums.html`
4. attach query params:
   - `genre=<selected genre>`
   - `cb=<timestamp>`
5. if the current page is embedded:
   - also set `embedded=1`
   - post `np-kiosk-pane-genre` to the parent
6. navigate to the albums page after a short delay

So the embedded genres page does two things at once:
- navigates itself to the album view
- informs the parent shell about the pane/genre transition

## Message emission in `controller-genres.html`

Observed embedded-mode message:
- `window.parent?.postMessage({ type:'np-kiosk-pane-genre', pane:'kiosk-albums.html', genre }, '*')`

This is important because it means the genre selection is not only local page state. It is explicitly elevated to the parent-shell level.

## Destination page: `controller-albums.html`

### Genre-aware load behavior
`controller-albums.html` reads:
- `genre` from query params

When embedded mode is active, it also posts:
- `np-kiosk-pane-genre`

again to the parent shell, including:
- `pane:'kiosk-albums.html'`
- `genre:<resolved genreFilter>`

So the albums page appears to reassert the genre state when it loads in embedded mode.

That implies a stronger contract than a one-time click notification.

## Album data loading for a genre

Once `controller-albums.html` has the `genre` value, current repo-visible behavior includes:
- updating the page title to:
  - `Albums · <genre>`
- making a POST request to:
  - `/config/queue-wizard/preview`
- sending a body shaped around:
  - `genres:[genreFilter]`
  - empty artists/albums/exclusions
  - `minRating:0`
  - `maxTracks:4000`

The response is then used to build the album view for that genre.

This is especially valuable because it ties together:
- child-page messaging
- embedded navigation
- filtered album computation through an API route

## Concrete action flow

A useful concrete summary is:

1. User clicks a genre in `controller-genres.html`
2. Page posts:
   - `np-kiosk-pane-genre`
3. Page navigates to:
   - `controller-albums.html?genre=<genre>&embedded=1&cb=<ts>`
4. Albums page loads in embedded mode
5. Albums page posts `np-kiosk-pane-genre` again with the resolved genre
6. Albums page calls:
   - `POST /config/queue-wizard/preview`
7. Filtered album content is rendered for that genre

This is one of the clearest semantic drill-down flows in the kiosk pane architecture so far.

## Parent-shell handling status

One interesting detail from current repo inspection:
- `controller.html` clearly listens for `np-kiosk-hide-pane`
- but the currently inspected main-session code path does not yet show explicit handling for `np-kiosk-pane-genre`

However:
- `controller-tablet.html` does contain references to `np-kiosk-pane-genre`

So the current interpretation is:
- this message is definitely part of the ecosystem’s pane contract
- its handling may be implemented more fully in some controller variants than others
- or the message may be partly anticipatory/diagnostic in some paths

This is a good reminder that the wiki should document both:
- confirmed message emission
- confirmed message handling

and note where one is clearer than the other.

## Architectural interpretation

A useful current interpretation is:
- genre pane messaging is a semantic coordination layer for embedded pane drill-down
- it helps keep the parent shell aware of the pane’s conceptual state
- it complements URL-based navigation rather than replacing it
- it connects UI drill-down to a queue-wizard-backed filtered album computation

So this is not just “click genre, go somewhere.”
It is a small but meaningful cross-layer contract.

## Relationship to other pages

This page should stay linked with:
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `controller-kiosk-mode.md`
- future pages about albums, genres, and queue-wizard-backed browse flows

## Things still to verify

Future deeper verification should clarify:
- exactly where and how `np-kiosk-pane-genre` is consumed in each parent shell variant
- whether the message drives visible parent-shell UI state, analytics, or future pane routing behavior
- whether similar semantic messages exist for artists, podcasts, playlists, or radio
- whether the genre flow behaves differently across controller, tablet, and mobile variants
- whether the duplicate message emission from genres and albums is essential, defensive, or transitional

## Current status

At the moment, this page establishes genre pane messaging as one of the first strong examples of semantic child-to-parent pane communication tied to a real API-backed content drill-down.

That makes it a useful model for documenting similar message-driven flows elsewhere in the kiosk/controller system.
