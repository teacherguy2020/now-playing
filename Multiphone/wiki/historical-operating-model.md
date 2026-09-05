# Historical operating model

## What the Multiphone was

Kenneth C. Shyvers' 1941 utility patent, US 2,264,911, describes a telephonic
music selector apparatus. The customer station was primarily a paid request
terminal: it displayed selections, accepted payment, signaled a central
operator, connected the customer's microphone, and allowed a spoken request.

The records were located at a central Shyvers studio. The customer was therefore
placing a short, coin-paid call to a music operator rather than directly
operating a local phonograph.

## Shared request line

Multiple customer stations could share a common line. A station's microphone was
normally disconnected and became active after its coin event. The patent also
anticipates near-simultaneous customers and multiple coin impulses.

## Request versus program traffic

The request conversation lasted seconds, while the requested record played for
minutes. This separated intermittent control traffic from continuous program
audio and made a per-establishment playback queue necessary.

## Modern correspondence

| Historical system | Modern equivalent |
| --- | --- |
| Coin | Original coin mechanism with isolated sensing |
| Multiphone | Original customer unit |
| Telephone request path | Network/API path |
| Shyvers operator | Mabel AI operator |
| Printed catalog | Digital catalog mapping |
| Operator queue | Now Playing jukebox-priority FIFO queue |
| Record library/turntable | Digital library and MPD/moOde |
| Program line/speakers | Existing room audio system |

Later installations may have used different wiring arrangements, including
separate request and program circuits. Do not assume every generation shared the
same physical implementation.
