# Editable showcase circuits

Download a `.lecircuit` file, place it in your vault, and open it with Logic-Electric Circuit Builder. All symbols, custom definitions, routes and labels are included. Desktop sheets arrange related sections side by side; mobile sheets use a portrait layout with complete selected subsystems.

| Drawing | Desktop | Portrait |
| --- | --- | --- |
| Protected supply, regulation and monitoring | [Power](desktop-power.lecircuit) | [Power](mobile-power.lecircuit) |
| Photodiode sensing, filters and amplification | [Analog](desktop-analog.lecircuit) | [Analog](mobile-analog.lecircuit) |
| Gate-level ripple-carry arithmetic and control | [Logic](desktop-logic.lecircuit) | [Logic](mobile-logic.lecircuit) |
| Custom controller and eight explicit bus lanes | [Bus](desktop-bus.lecircuit) | [Bus](mobile-bus.lecircuit) |
| 555 timing and protected transistor relay driver | [Timer](desktop-timer.lecircuit) | [Timer](mobile-timer.lecircuit) |

## Simulation showcase (phone)

Two compact drawings used for the phone listing screenshots run in **Simulate**: [2 × 2-bit multiplier](2-bit%20multiplier.lecircuit) (all 16 products verified) and [Sensor chain (compact)](Sensor%20chain%20%28compact%29.lecircuit) (op-amp gain, RC low-pass, comparator and LED driver). Regenerate and verify them with `node scripts/generate-listing.mjs`.

## Drafting gallery

These are illustrative schematic documents for exploring the editor. They have not been simulated or electrically qualified as reference hardware designs. Named nets connect related sections; ordinary crossings remain unjoined.

Regenerate with `node scripts/generate-showcase.mjs`. The generator validates the document schema, graph references and bus widths, and rejects structural diagnostics. Capture instructions are in [the screenshot index](../../docs/screenshots/README.md).
