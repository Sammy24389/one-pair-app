# Party games design

The group creator chooses a game and two to four connected players. Board games use exactly two players; others use the engine catalog limits. Everyone sees the current turn, score, rules and result. Spectators can watch but cannot submit moves. A missing player pauses controls until they reconnect.

The catalog uses the existing theme tokens and card/button language. Boards fit the viewport, with horizontally scrollable minimum 40px board cells on narrow screens. Each cell has a spoken coordinate and piece description. Sports use a moving aiming reticle and one keyboard-accessible action button; a reduced-motion mode offers deliberate coordinate controls. Throws show their final impact. Word Chain explicitly uses an honor system, with no dictionary claim.

Network transport, host authority, reconnect synchronization and persisted state remain owned by the group controller. The component receives authoritative state and emits move requests only. Validation remains in the pure rules engine. No HTTP endpoints, new storage or third-party dependencies are introduced by this view.

Verification: rendering and interaction tests for player selection, spectator/turn guards, word moves, board coordinates and aiming controls; full typecheck and application build; real two-device and touch checks remain separate release evidence.
