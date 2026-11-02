# Circuit file format, version 1

Files use `.lecircuit`, UTF-8, readable JSON. `format` is `logic-electric-circuit`; `schemaVersion` is 1. Plugin release version is independent. Objects use stable internal IDs; a displayed reference such as R1 is editable and does not identify the object.

Top-level fields: `format`, `schemaVersion`, `id`, `title`, `components`, `nodes`, `wires`, `annotations`, `groups`, `definitions`, `metadata`. The executable contract is `src/core/model/document.ts`. Definitions used by each drawing are embedded; changing the installed library cannot move an old document’s pins. Custom primitives are limited to validated paths, rectangles, circles and text. No executable code, remote assets, HTML, styles or arbitrary SVG attributes are accepted.

Each wire has two explicit anchors: `{kind:"pin", componentId, pinId}` or `{kind:"node", nodeId}`. Geometry never establishes a connection. Route vertices are intermediate geometric bends; splitting a wire creates an explicit shared graph node. `width` is the number of electrical signal lanes, not drawing thickness. Bus splitters contain explicit `laneLinks`; other device pins are independent terminals. Cycles are valid.

Committed geometry uses finite integers between −1,000,000 and 1,000,000. Right-angle component rotation and mirrors use exact integer transforms. The visible default grid is 16 units. Wire routes are orthogonal or free-angle; `locked` vertices preserve manual constraints. A bounded router changes geometry without changing anchors. Search failure retains a visible elbow route. Moving a component preserves pin anchors; deleting it retains dangling wire ends.

Net names trim surrounding whitespace and remain case sensitive. Scope is one document. Repeated names join equal-width lanes bit by bit. Width-mismatched named buses are diagnosed and do not partially connect. A label’s `global` flag controls its copy behavior: power/reference names are retained, ordinary signal names receive a shared new suffix when pasted unless the user chooses otherwise. Earth/chassis are not silently aliased to GND.

Values remain display text. `10k` parses to 10000; `100nF` to 0.0000001 F. Prefixes: f, p, n, u/µ/μ, m, k/K, M, G, T. M and m are different. Supported unit suffixes: Ω/ohm, F, H, V, A, Hz, s. Arbitrary expressions are not evaluated. This interpretation is independent of any future simulation engine.

The importer limits files to 8 MiB and nesting to 32 levels. Schema limits bound counts, strings, pins and bends; graph validation rejects duplicate IDs, missing pins/nodes, invalid lane links and width mismatches. Unknown fields or future versions cause read-only/raw recovery rather than being stripped. Version 1 is the initial format; there are no older supported migrations. A future migration must preserve a backup and ship version-to-version fixtures.

Serialization orders object keys and preserves array order. Opening, hovering, selecting, zooming and panning do not rewrite circuit content. History, diagnostics, camera and unfinished gestures are not serialized.

Annotations can include `rotation` (degrees), `scaleX`, `scaleY` and `fontSize`. Missing values default to 0, 1, 1 and 14. Identity values are omitted on save, so ordinary annotations retain their previous file shape. Existing documents are not rewritten merely by opening them. Non-default transforms require 0.1.1 or newer; 0.1.0 safely rejects unfamiliar fields rather than stripping them. Annotation presentation transforms never change an electrical anchor.
