# Optional editorial About metadata

Sonuvi treats editorial About text as optional enrichment, not a core
requirement. Playback, queue, library, radio, displays, and controllers work
normally on a clean GitHub installation with no About credentials.

## Provider-neutral contract

Providers return a normalized model:

~~~
{
  "type": "album",
  "text": "Editorial prose...",
  "shortText": "Short editorial text",
  "tagline": "Featured in ...",
  "source": "apple",
  "sourceId": "268443092",
  "match": { "confidence": "strong" }
}
~~~

The API also reports:

- aboutStatus: "unconfigured"   no configured provider
- aboutStatus: "no-data"   configured provider found no editorial text
- aboutStatus: "available"   about is present
- aboutProvider: "apple"   present when a provider supplied the data

The resolver is provider-neutral; Apple Music is only the first adapter.

## Apple Music provider

Apple requires each installer to use their own Apple Developer Media Services
key and Team ID. Sonuvi does not ship Brian's credentials or any .p8 file.

Example deployment-only settings:

~~~
APPLE_MUSIC_KEY_ID=<your-key-id>
APPLE_MUSIC_TEAM_ID=<your-team-id>
APPLE_MUSIC_PRIVATE_KEY_PATH=/etc/now-playing/AuthKey_<your-key-id>.p8
~~~

Keep the key outside Git, readable only by the service account/root group as
appropriate for the installation, and never expose its contents or generated
JWTs. The legacy APPLE_MUSIC_DEVELOPER_TOKEN variable is an optional
development fallback.

## Provider audit   not implemented

| Candidate | Access requirements | Prose/data quality | Licensing and attribution |
|---|---|---|---|
| MusicBrainz + Cover Art Archive | Public API; identify the client with a descriptive User-Agent; rate-limit requests (commonly 1 request/sec) | Excellent open structured artist/release/recording identity and credits; not comparable to Apple editorial prose | MusicBrainz data is CC0; Cover Art Archive images carry their own source licenses; retain source attribution where required |
| Last.fm | Free API key; API terms and rate limits apply | Album/track wiki text can provide prose, but coverage and quality are community-variable and less consistently editorial than Apple | Must follow Last.fm API terms and attribution/link requirements; user-contributed wiki text is not Sonuvi-owned |
| Wikipedia / Wikidata | Public APIs, no Apple account; respectful User-Agent and caching | Wikipedia can provide substantial album/artist prose, but it is encyclopedia context rather than release editorial copy; Wikidata is structured facts | Wikipedia text is CC BY-SA and requires attribution/share-alike handling; Wikidata is CC0 |
| Discogs | API access/token and rate limits; commercial use and terms need review | Strong release metadata, labels, formats, and credits; community release notes are sparse/inconsistent and not Apple-like editorial copy | Follow Discogs API/database terms, attribution, and display requirements; do not assume unrestricted mirroring |
| Spotify Web API | Developer application/client credentials and rate limits | Strong identity/audio metadata, but no dependable album editorialNotes equivalent | Spotify developer terms and display/link requirements apply; not a good prose replacement |
| Genius | API application/token; endpoint and content restrictions | User annotations can be detailed for songs, but coverage is uneven and lyrics/annotations are not album editorial prose | API/content terms and attribution apply; lyrics-related content has additional restrictions |

### Practical conclusion

For ordinary installations, MusicBrainz is the best no-account baseline for
structured identity and credits, while Wikipedia is the strongest candidate
for openly accessible general prose. Neither is a drop-in replacement for
Apple editorialNotes. Last.fm is the most plausible music-specific prose
fallback, but its coverage and licensing/attribution obligations require a
separate design decision.

No alternative provider is enabled by this change.
