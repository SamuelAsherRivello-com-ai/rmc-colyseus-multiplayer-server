## ADDED Requirements
### Requirement: Host-owned cooperative Asteroids
The system SHALL provide isolated coded rooms for one through four players. Only the creator SHALL publish world outcomes; guest input SHALL be validated and attributed by the server. Host departure SHALL end the room without migration.

#### Scenario: Guest authority attempt
- **WHEN** a guest publishes a world snapshot
- **THEN** the server rejects it and retains host state

### Requirement: Personal lives and finite waves
The shared rules SHALL start wave one with three one-hit parents, each splitting into two one-hit terminal children. Later waves SHALL increase bounded health/branching and scale by living roster sampled at wave start. Each player SHALL have three lives across waves and spectate when eliminated. Defeat SHALL restart all connected players after five seconds at wave one with three lives.

#### Scenario: Survivor remains
- **WHEN** the host is eliminated and a guest remains alive
- **THEN** the host continues simulation while spectating and the guest continues playing

### Requirement: Private recovery and consistent membership
Returning guests SHALL authenticate a room-session identity separate from public player IDs. Hot dropping SHALL free capacity while retaining personal lives/score; new guests SHALL receive a separate ledger. Complete late-join snapshots SHALL preserve current damage/fragments.

#### Scenario: Return after elimination
- **WHEN** a returning guest authenticates the same private token
- **THEN** the guest retains eliminated status until collective replay

### Requirement: Verified sustained delivery
The release SHALL demonstrate ten minutes of public shared state with one fixed host and room continuity through connection renewal on free hosting before the consumer pins the released package.

#### Scenario: Connection renewal
- **WHEN** hosting replaces a connection during the acceptance run
- **THEN** the same room, host, lives, wave and damaged entities remain consistent without electing another host

### Requirement: Isolated free deployment preserves existing production
The shared repository SHALL support a dedicated Asteroids deployment on Vercel Hobby without changing the default shared game registry or the original production endpoint. Release publication SHALL require successful regression preparation and verification of the selected deployment target.

#### Scenario: Dedicated registration
- **WHEN** the server starts with `ASTEROIDS_ONLY=1`
- **THEN** its advertised game list contains only `asteroids-coop`
- **AND** Asteroids admission succeeds while admission to legacy games returns unknown-game responses

#### Scenario: Default shared deployment
- **WHEN** `ASTEROIDS_ONLY` is absent
- **THEN** all existing game registrations remain available through the unchanged shared deployment path

#### Scenario: Verified dedicated release
- **WHEN** Release runs with `target=asteroids`
- **THEN** the exact main-history source passes the full regression suite and isolated live continuity gate before promotion and package publication
- **AND** no paid plan, third-party service or alternative provider is enabled
