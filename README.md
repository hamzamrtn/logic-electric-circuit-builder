# Logic-Electric Circuit Builder

**Draw circuits on desktop, tablet and phone — on any device running Obsidian 1.14.0 or later.**

Turn circuit ideas into clear, editable diagrams right beside your notes. Sketch an analog front end, explain a logic network, or document a complete circuit with searchable symbols, smart wire routing and custom blocks. Everything works offline and stays in your vault.

![Gate-level ripple-carry adder with output control and clock circuitry in the desktop editor](docs/screenshots/desktop-logic.png)

**72 built-in symbols · Custom IC blocks · Explicit bus lanes · Live note previews · SVG & PNG export**

## From electrical circuits to digital logic

| Power supplies | Analog signal chains |
| --- | --- |
| [![Protected input, two regulated rails and a load monitor](docs/screenshots/desktop-power.png)](docs/screenshots/desktop-power.png) | [![Photodiode sensor, RC filters, amplifier and comparator](docs/screenshots/desktop-analog.png)](docs/screenshots/desktop-analog.png) |
| **Custom blocks & 8-bit buses** | **Timers & transistor drivers** |
| [![Custom controller, eight explicitly mapped bus lanes and output logic](docs/screenshots/desktop-bus.png)](docs/screenshots/desktop-bus.png) | [![555 timer with decoupling, a protected relay driver and indicators](docs/screenshots/desktop-timer.png)](docs/screenshots/desktop-timer.png) |

## Take your circuits with you

Pan with a swipe, pinch to zoom, and tap to place parts or connect pins. Select, Box and Multi stay together in a compact toolbar; properties open when you need them.

<p>
  <a href="docs/screenshots/mobile-power.png"><img src="docs/screenshots/mobile-power.png" width="19%" alt="Phone: protected power supply and rail monitor"></a>
  <a href="docs/screenshots/mobile-analog.png"><img src="docs/screenshots/mobile-analog.png" width="19%" alt="Phone: photodiode sensor, filter and amplifier"></a>
  <a href="docs/screenshots/mobile-logic.png"><img src="docs/screenshots/mobile-logic.png" width="19%" alt="Phone: two-bit gate-level adder and output control"></a>
  <a href="docs/screenshots/mobile-bus.png"><img src="docs/screenshots/mobile-bus.png" width="19%" alt="Phone: custom controller and eight bus lanes"></a>
  <a href="docs/screenshots/mobile-timer.png"><img src="docs/screenshots/mobile-timer.png" width="19%" alt="Phone: timer, timing capacitors and transistor relay driver"></a>
</p>

Click any image for full resolution. [Browse all ten screenshots and editable example files](docs/screenshots/README.md). Captures show the actual editor in its preview harness, including portrait phone emulation.

## Keep the drawing under your control

- **Build from useful parts.** Search electrical symbols, gates and logic blocks, or define an IC with your own pin names, directions and bus widths.
- **Make connections explicit.** Route around components, add manual bends, branch through junctions, and name nets. Crossed wires stay separate until you join them.
- **Edit without losing connections.** Move, rotate or mirror connected parts; select regions, group objects and reuse snippets. Undo/redo supports experimentation.
- **See what happened.** Brief placement and connection feedback, nearby alignment guides and screen-sized pin targets help precise editing. Motion respects Reduce Motion preferences.
- **Connect your notes.** Embed live circuit previews and export SVG or PNG for lessons, reports and sharing. Autosave status, conflict review and recovery copies help manage changes.

Built for schematic drawing and documentation. Circuit simulation is outside its scope; structural checks identify drawing issues such as dangling ends and incompatible bus widths.

## Get started

1. Open the [Obsidian plugin listing](https://community.obsidian.md/plugins/logic-electric-circuit-builder), choose **Add to Obsidian**, and enable the plugin.
2. Run **Logic-Electric Circuit Builder: New circuit** from the command palette, or use the circuit ribbon icon.
3. Choose a symbol from **Electrical**, **Logic** or **Connections**, then click or tap to place it. Tap a pin to start a wire and a second pin to finish it.
4. Use **File** to export or save reusable snippets. From a note, run **Insert circuit preview** to embed an editable circuit's live view.

Circuit files use `.lecircuit`. No account, Node installation or server is needed to use the plugin.

[Editing, shortcuts, previews and recovery guide](docs/user-guide.md) · [Download editable showcase drawings](examples/showcase/README.md)

<details>
<summary>Install a local development build</summary>

Build with `npm run package`, then unzip `dist/logic-electric-circuit-builder-0.1.6.zip` into your vault's `<configDir>/plugins/` directory. Alternatively create `<configDir>/plugins/logic-electric-circuit-builder/` and copy `main.js`, `manifest.json` and `styles.css` from `dist/logic-electric-circuit-builder/`. Reload Obsidian and enable the plugin in Community plugins. `.obsidian` is the usual configuration directory; custom configuration directories work too.

Use a separate test vault when qualifying a development build. The screenshots show this working tree; unpublished improvements are listed in [CHANGELOG.md](CHANGELOG.md).

</details>

## Build and verify

Use Node 24 and npm. Dependencies are pinned in `package-lock.json`. The Obsidian SDK’s CodeMirror peers are host-provided; the repository’s `.npmrc` avoids installing unused peers.

```sh
npm ci
npm run lint
npm run check
npm run check:install
npm run examples:build
npm run preview:build
npx playwright install chromium webkit
npm run test:e2e
npm run package
```

`npm run dev` opens the Vite harness when local servers are available. `dev/preview.html` is a server-free harness after `preview:build`; it exports files on explicit request and keeps the drawing in memory. Core/property tests run in Vitest. Lint checks import boundaries and injection hazards; strict TypeScript also checks unused code. CI includes Chromium and WebKit browser tests. Public release/submission is a separate, owner-controlled step.

See [format](docs/format.md), [architecture](docs/architecture.md), [validation and qualification](docs/validation.md), and [release instructions](docs/release.md).

Created by **Hamza**. [MIT licensed](LICENSE).
