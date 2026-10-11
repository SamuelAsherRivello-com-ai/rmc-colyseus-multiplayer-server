# Spec Delta

## Purpose

Define a deterministic two-player falling-block duel with timed aiming, committed placement, and cancelable garbage attacks.

## ADDED Requirements

### Requirement: Independent falling-block boards
Each player SHALL use a board of ten columns, twenty visible rows, and four hidden rows. The game SHALL provide all seven tetromino shapes, documented integer-cell rotations, and identical seven-bag piece streams consumed independently. Each player SHALL see their own next five pieces.

#### Scenario: Independent consumption
- **WHEN** players commit at different rates
- **THEN** each receives the same ordered piece sequence at their own consumption index
- **AND** each complete bag contains each shape once

### Requirement: Five-second aim and commit
Each piece SHALL be aimable above the board for 5000 ms. Players SHALL move horizontally and rotate within board columns before committing. Manual commit or deadline expiry SHALL freeze the current position and orientation. The committed piece SHALL descend straight without steering and resolve after 200 ms. No input SHALL extend its deadline.

#### Scenario: Manual release
- **WHEN** a player commits before expiry
- **THEN** the piece falls to its first collision along the selected column path
- **AND** further movement and rotation cannot alter it

#### Scenario: Deadline expiry
- **WHEN** five seconds elapse without commitment
- **THEN** the server commits the current aim automatically exactly once
- **AND** input received at or after expiry cannot change that piece

#### Scenario: Independent early release
- **WHEN** one player commits and resolves a piece before their five-second maximum
- **THEN** that player immediately begins aiming the next piece with a fresh five-second deadline
- **AND** the opponent's current piece and deadline do not change and no minimum shared turn is imposed

#### Scenario: Aim rotation at an edge
- **WHEN** rotation would put occupied cells outside columns zero through nine
- **THEN** the game tries horizontal offsets zero, minus one, plus one, minus two, plus two in order
- **AND** it retains the previous orientation if none fits

### Requirement: Atomic placement and row clearing
Resolution SHALL lock the piece and remove every complete row atomically, shifting rows above downward. Collision SHALL prevent tunneling into covered cavities. Hold, soft drop, post-release steering, and lock-delay resets SHALL be unavailable.

#### Scenario: Multiple completed rows
- **WHEN** a committed piece completes multiple rows
- **THEN** all complete rows disappear in the same resolution
- **AND** only the resulting board is used for attack and defeat checks

### Requirement: Telegraphed garbage and cancellation
Clearing one, two, three, or four rows SHALL create zero, one, two, or four attack units respectively. Units SHALL cancel oldest pending incoming rows one for one before excess is sent. Sent packets SHALL warn for at least 1000 ms and enter only at a subsequent recipient placement boundary. Each packet SHALL use one gap column across its rows.

#### Scenario: Cancel and send excess
- **WHEN** a four-line clear creates four units and the player has two incoming rows
- **THEN** those rows are canceled and two rows are sent to the opponent

#### Scenario: Attack arrives during descent
- **WHEN** an incoming packet matures while the receiver's piece is descending
- **THEN** it waits for that piece's resolution boundary
- **AND** cancellation from that resolution occurs before any surviving mature rows are inserted

#### Scenario: Single-line clear
- **WHEN** a player clears one row
- **THEN** the clear removes that row but creates no attack or cancellation units

### Requirement: Simultaneous outcomes are order independent
The game SHALL batch same-tick placement resolutions, cancel existing incoming packets, cancel opposing simultaneous excess attacks, and only then route remaining attacks and apply eligible garbage. Callback order SHALL NOT determine the winner.

#### Scenario: Equal simultaneous attacks
- **WHEN** both players generate equal excess attacks in the same tick
- **THEN** those attacks cancel rather than adding rows to both boards

### Requirement: Top-out and rematch
A blocked entry path, occupied hidden rows after clearing and garbage, or garbage overflow SHALL top out that player. One top-out SHALL award the duel to the survivor; same-tick double top-out SHALL draw. A rematch SHALL require both connected players to ready and SHALL reset boards, piece streams, attacks, deadlines, and input epoch.

#### Scenario: A clear prevents top-out
- **WHEN** a placement temporarily occupies a hidden row but its row clears remove that occupancy
- **THEN** top-out is checked using the resolved board rather than the pre-clear board

#### Scenario: Both players lose together
- **WHEN** both boards top out in one resolution tick
- **THEN** the result is a draw with no winner

#### Scenario: One-sided restart request
- **WHEN** only one player requests a rematch
- **THEN** results remain visible until both players ready


### Requirement: Private two-seat admission
The service SHALL isolate duels under game key `tetris-duel`, accept at most two connected or reserved seats, and support four-character uppercase alphanumeric room codes. Share links SHALL use `room` and preserve other safe parameters. Invalid, missing, expired, full, code-in-use, and rate-limited requests SHALL have distinct actionable responses.

#### Scenario: Invite join
- **WHEN** one player creates a room and another opens its share link
- **THEN** both enter the same isolated two-seat lobby and can ready for a three-second countdown

#### Scenario: Full room
- **WHEN** a third client joins an occupied or fully reserved room
- **THEN** admission fails without displacing either participant or creating an overflow room

### Requirement: Recipient-specific hidden state
Every outbound path SHALL expose only the recipient's board, piece, queue, acknowledgments, timers, attack warnings, and permitted opponent projection. The projection SHALL contain identity, connection/readiness, maximum settled height, current aim shape/rotation/column while aiming, and outcome. Opponent cells, descent/landing data, queue, private RNG, history, and credentials SHALL NOT be sent.

#### Scenario: Opponent commits
- **WHEN** the opponent commits a piece
- **THEN** the recipient's opponent aim becomes absent
- **AND** no opponent falling-piece or settled-cell data is substituted

#### Scenario: Recovery snapshot
- **WHEN** a player joins, resyncs, reconnects, or reaches results
- **THEN** messages obey the same private projection as ordinary gameplay
- **AND** credentials for the other seat are absent

### Requirement: Server-authoritative ordered actions
The service SHALL validate actions against the authenticated seat, protocol version, match epoch, piece ID, and increasing sequence number. It SHALL own all deadlines, placement, randomization, clearing, attacks, and results. Invalid, duplicate, stale, excessive, or nonfinite input SHALL NOT alter gameplay. Client clocks and submitted board/score state SHALL NOT control outcomes.

#### Scenario: Delayed command after automatic commitment
- **WHEN** a command for the expired piece arrives after the next piece exists
- **THEN** the service rejects it without affecting the next piece

#### Scenario: Duplicate commit
- **WHEN** a commit command is retried with the same sequence
- **THEN** at most one piece is committed

### Requirement: Responsive local prediction with reconciliation
Local aiming and commit feedback SHALL appear without waiting for network acknowledgment. Reconciliation SHALL restore authoritative local state and replay only valid pending actions. Opponent hints SHALL follow ordered revisions and remain snapped to legal cells. Provisional local outcomes SHALL NOT override server results.

#### Scenario: Delayed acknowledgment
- **WHEN** acknowledgments arrive under 150 ms round-trip latency and plus or minus 50 ms jitter
- **THEN** local aiming continues to respond on the next render frame under normal load
- **AND** clients converge to authoritative local state without duplicate placements

### Requirement: Bounded authenticated recovery
Each seat SHALL have a private recovery credential and a cumulative recovery budget of 15 seconds per match. Detected connection loss SHALL pause both gameplay clocks within that budget; successful same-seat recovery SHALL restore state and remaining timers. Room code alone SHALL NOT claim a reserved active seat. Blur or settings SHALL NOT pause a healthy match.

#### Scenario: Recover the same seat
- **WHEN** a dropped client returns with valid recovery credentials within its remaining budget
- **THEN** it recovers its board and seat without exposing the opponent board or resetting the turn timer

#### Scenario: Recovery budget expires
- **WHEN** a player fails to recover before its budget expires and the opponent remains connected
- **THEN** the absent player forfeits
- **AND** repeated drops do not grant a fresh unlimited pause budget

#### Scenario: Both clients disappear
- **WHEN** neither client remains connected through the recovery expiry
- **THEN** the duel aborts without a winner and the abandoned room is disposed

#### Scenario: Explicit leave
- **WHEN** a player explicitly leaves a live duel
- **THEN** that player forfeits immediately

#### Scenario: Authoritative process loss
- **WHEN** the authoritative process is lost
- **THEN** clients report room expiry rather than claim recovery into a fresh game
