# Editable showcase circuits

Download a `.lecircuit` file, place it in your vault, and open it with Logic-Electric Circuit Builder. All symbols, custom definitions, routes and labels are included. Desktop sheets arrange related sections side by side; mobile sheets use a portrait layout with complete selected subsystems.

| Drawing | Desktop | Portrait |
| --- | --- | --- |
| Protected supply, regulation and monitoring | [Power](desktop-power.lecircuit) | [Power](mobile-power.lecircuit) |
| Photodiode sensing, filters and amplification | [Analog](desktop-analog.lecircuit) | [Analog](mobile-analog.lecircuit) |
| Gate-level ripple-carry arithmetic and control | [Logic](desktop-logic.lecircuit) | [Logic](mobile-logic.lecircuit) |
| Custom controller and eight explicit bus lanes | [Bus](desktop-bus.lecircuit) | [Bus](mobile-bus.lecircuit) |
| 555 timing and protected transistor relay driver | [Timer](desktop-timer.lecircuit) | [Timer](mobile-timer.lecircuit) |

These are illustrative schematic documents for exploring the editor. They have not been simulated or electrically qualified as reference hardware designs. Named nets connect related sections; ordinary crossings remain unjoined.

Regenerate with `node scripts/generate-showcase.mjs`. The generator validates the document schema, graph references and bus widths, and rejects structural diagnostics. Capture instructions are in [the screenshot index](../../docs/screenshots/README.md).
