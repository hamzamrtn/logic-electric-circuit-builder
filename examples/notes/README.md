# Circuits in study notes

Two example student-style notes pair a moderately involved schematic with explanations and calculations:

- [Logic: ripple-carry addition](Logic%20-%20Ripple-carry%20addition.md), with a [four-bit adder](Ripple-carry%20adder.lecircuit): 20 gates and 44 wires.
- [Electrical: filtering a sensor signal](Electrical%20-%20Filtering%20a%20sensor%20signal.md), with an [photodiode signal chain](Filter%20and%20amplifier.lecircuit): 19 parts and 30 wires.

Copy this folder into your vault as `examples/notes`, with Logic-Electric Circuit Builder enabled. Open either Markdown note in Reading view or Live Preview. The embedded circuit loads from its `.lecircuit` file; **Open** returns to the editable drawing. If you choose a different folder, update the path in each `lecircuit` block to match, or use **Insert circuit preview** to choose the file.

The previews use `width: 90%`; change that line to another percentage or a pixel width to suit your note. For the centered screenshot layout, copy [study-notes.css](study-notes.css) into your vault's `.obsidian/snippets` folder and enable **study-notes** under Settings → Appearance → CSS snippets. It styles only notes with the included `circuit-study-note` class. Hide in-document properties in Obsidian's Editor settings for the same clean presentation. The plugin's preview sizing works independently of this optional note styling.

These are authored demonstration notes, not actual student submissions. The circuits illustrate drawing and documentation, without simulation or hardware qualification.

Regenerate the drawings with `node scripts/generate-note-showcase.mjs`. See the [screenshot index](../../docs/screenshots/README.md) for the actual Obsidian captures and reproduction steps.
