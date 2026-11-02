# Foundation and product identity

The owner chose Logic-Electric Circuit Builder and MIT on 2026-11-01. Author: Hamza. The stable installation ID is `logic-electric-circuit-builder`, extension and Markdown fence `lecircuit`. Display name may change without changing these identifiers. Directory conflict verification must be repeated before public release.

The core uses explicit pin/node anchors, integer geometry, atomic edits, bounded history, embedded declarative definitions and versioned readable JSON. React/SVG and the public Obsidian host adapter depend inward on the core. Viewport, selection and unfinished gestures are not document edits. Simulation is a future adapter, not an initial editor feature.

One session and one serialized persistence coordinator own each open vault file. Host save hooks delegate to this queue rather than racing a second writer. Compare exact baseline content with Vault.process before writes. Invalid/future files remain recoverable and cannot trigger empty saves.

Initial minimum host: 1.14.0; SDK 1.14.4; local installed host 1.14.5. Broader/older host support requires actual testing. Mobile declaration expresses intent, qualification remains separate.
