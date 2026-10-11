# Combat backend delivery evidence

Verified backend v0.9.12 on the existing free Vercel Hobby project. Deployment source 0c7e18090c4d3134956c583fa27a909ad277d617, stable endpoint https://rmc-colyseus-multiplayer-server.vercel.app . Release run 38086863881 passed deployment: 151 local tests; staged 150/151 then retained bounded rerun 151/151; private Tetris, 240-second relay, 240-second Space Invaders migration, 600-second Asteroids continuity and stable probes all passed. Stable Combat probe verified four tanks, shared authority and recovery.

Concurrent successful release 38087006732 published v0.9.12 tag 5da24eb28d2bcf288cd6320624d94511d01d1b22 first. The duplicate publish step in 38086863881 refused to overwrite the tag; its overall result is failure despite successful deployment. Published client differs only by enabling the same bounded admission path for Music Maker; Combat behavior matches deployment. No publication success is falsely attributed to the duplicate run.

Actual asset https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/releases/download/v0.9.12/rmc-multiplayer-client-0.9.12.tgz installed in a clean Node 24 consumer. Root/Combat imports and attachment helper inclusion pass. Integrity sha512-xtbSbR+Ggzap0y+uw2HQTngRp4U1gEte9/WwgnCdohOvvjObTpjKPihDNOCAOTAvqmIJkq8RmsoI6l9pTZy9Xg== . The published package passed full Combat integration against stable in 57.6 seconds, including four-human admission, controls/fire, protected same-seat recovery, expiry and isolation.

Rooms and scores remain temporary and process-local. This delivery does not complete the separate durable hosting migration. The game client and README live-demo links remain pending until the actual browser game is shipped.
