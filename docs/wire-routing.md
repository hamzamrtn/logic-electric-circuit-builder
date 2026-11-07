# Circuit wire routing review

The next quality focus is predictable part placement, wire drawing and circuit-aware pathfinding. The placement work already has native touch regression cases for swipes accidentally placing parts or adding wire points, plus middle-button panning over objects.

## Routing requirements

- Leave pins along their declared side after rotation/mirroring; approach the destination along its pin lead.
- Route around symbol bodies with clearance, including the components at both endpoints.
- Prefer short orthogonal paths with few bends. Honor the user's horizontal/vertical preference when routes are otherwise equivalent.
- Keep exact endpoints when snapping is off. Avoid a search cost proportional to the number of empty grid cells in a long wire.
- Retain explicit graph anchors, manual waypoints and unconnected crossings. Routing must never join nets or move parts.
- Bound search work and retain a visible fallback when a clear route cannot be found. Keep the plugin offline and portable with no new runtime assets.

## Research and implementation direction

Libavoid's official documentation describes shortest-path connector routing with penalties for segments, bends and other aesthetic properties. It also models endpoint directions and fixed checkpoints, which match the circuit editor's pins and user waypoints. See the [routing parameters](https://www.adaptagrams.org/documentation/classAvoid_1_1Router.html), [endpoint directions](https://www.adaptagrams.org/documentation/classAvoid_1_1ConnEnd.html), and the research linked in the [libavoid overview](https://www.adaptagrams.org/documentation/libavoid).

The implementation now uses a coordinate-compressed rectilinear search with direction in its search state, explicit pin escape segments, and a length-plus-bend cost. Its heuristic includes a lower bound on necessary turns, and a binary heap orders the frontier. The earlier grid A* used only position as its state even though bend cost depended on arrival direction; it also ignored the first-direction setting, excluded endpoint components from obstacles and could exhaust its budget on long empty spans. Eight regression cases failed against the earlier behavior before implementation.

Pin leads honor rotation/mirroring, both endpoint bodies remain obstacles, and exact off-grid coordinates are retained. Candidate graph edges are checked against every body that can intersect the graph envelope, including bodies outside the initial local routing corridor. Preview and commit use the same 4,000-expansion default limit. Explicit manual waypoints stay fixed; the inspector explains how to edit/remove them before requesting an unconstrained automatic route.

## Verification

Nine focused core cases cover direction preference, all four pin rotations with mirroring, long wires, exact off-grid endpoints and routing behind a source body. A further 150 seeded obstacle scenes independently check every returned segment for orthogonality and body clearance, verify endpoints, and confirm routing does not mutate topology.

Browser cases cover native swipes during placement/wiring, middle-button navigation, the visible vertical-first preference, preview/commit equality, and fixed-waypoint feedback. Finishing a dangling wire now selects it, matching the endpoint-connection workflow.

The local routing benchmark issued 200 requests each in 100-part and 500-part resistor grids. At 500 parts, the earlier router's median was 9.224 ms and 154/200 requests fell back with its 2,500-expansion limit. At that same limit the new search fell back twice; with the chosen 4,000-expansion limit its median was 0.510 ms, p95 5.510 ms, maximum 11.616 ms, and no sampled requests fell back. At 100 parts the new median was 0.144 ms with no fallbacks, compared with 76 fallbacks in the earlier router. These are Node/desktop smoke samples, not a guarantee for arbitrary circuits or real mobile hardware. Recorded samples are in [routing-benchmark.json](evidence/wire-routing/routing-benchmark.json).

The C++ library is a reference for routing behavior. Adding a C++/WASM runtime is not needed for this pass. Crossings remain legal; ambiguous overlaps continue to be reported explicitly rather than changing topology.
