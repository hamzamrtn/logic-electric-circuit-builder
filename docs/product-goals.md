# Standing product goals

Owner-confirmed priorities, recorded 2026-11-07 from the project conversation. This is the first document an agent should read in a fresh session. These goals apply across tasks; the owner should not have to restate them. New explicit owner instructions can refine or change them.

## The product we are building

Build a **comprehensive, very intuitive, organized and powerful circuit editor inside Obsidian, with a smooth interface and clean UI**. The plugin already has users. Treat quality, trust and everyday usability as continuing responsibilities rather than a final cosmetic pass.

Support meaningful electrical and digital logic schematics in the same coherent workspace. A user should be able to start easily, develop a substantial circuit, reorganize connected parts, document it in notes, and export a readable result. Capability and approachability must grow together.

The current product is an offline schematic editor for drawing and documentation. Symbols and structural checks do not imply electrical simulation. The owner's openness to useful features is not a request to introduce a simulator or redesign the product around one.

## Intuitive and organized

- Make the next action discoverable through recognizable controls, clear labels, useful previews and visible confirmation of what happened.
- Keep related actions together. Select, Box and Multi belong together in that order. Their icon-and-label treatment should be consistent; the owner specifically approved Select's compact, organized presentation as the model.
- Keep the schematic as the primary surface. Open properties and secondary controls when needed. A blank document starts with a clean grid.
- Support complete workflows, including cancel, undo, correction and recovery. A feature is not finished merely because its happy-path command exists.
- Prevent surprising tool changes, accidental selections, unexplained connections and dialogs that strand focus. Keyboard, list and coordinate alternatives should complement direct manipulation.

“Powerful” means useful operations that work predictably together. It does not mean displaying every control at once, adding settings for routine choices, or maximizing feature/symbol counts at the expense of everyday editing.

## Clean visual design and restrained feedback

Favor compact, readable layouts, consistent spacing and control treatments, clear hierarchy and host-theme integration. Light and dark appearances should both work. Keep decoration subordinate to the circuit.

The owner approved a responsive workbench with a polished, aesthetic, slightly cozy and modern feel: softer corners, balanced spacing, gentle borders and subtle depth, while retaining host-theme colors. In compact editor panes, keep File, Undo/Redo, Inspect and More above the drawing, with Select → Box → Multi, Wire and Add in a top dock by default. Wide panes keep a clean single top toolbar. Adapt to the workspace width, including split desktop panes and the space left by an inline inspector. Essential editing must not require horizontal toolbar scrolling. The drawing toolbar is dockable at the left, right, top or bottom. Use an established dotted drag grip with a visible Move label, not a clipped corner button or an ambiguous four-arrow symbol. Keep detached desktop docks compact and content-sized, with a background only around the controls; the canvas continues behind and below them without a reserved opaque strip. Keep the circuit-tool icons unchanged. Activating Move by click, keyboard or drag reveals all four coloured placement hints; highlight the candidate under the pointer or focus, and hide the hints when Move ends. Never show a redundant host tooltip over the grip or during dragging. Top restores the original wide desktop row through ordinary dragging or selection, without requiring Reset. Remember the chosen edge and adapt the parts picker, zoom card, wire-action controls and Fit together. Reserve host-navigation clearance around the controls, without padding the entire view.

Use one Add picker for Electrical, Logic, Connections, Text and Custom blocks. Keep Undo/Redo visible and paired. Move selection-wide actions and infrequent options into More; expose rotation when placement/selection makes it relevant. Keep touch targets comfortable and avoid automatically raising a phone keyboard just to browse parts. Picker search, closing and insertion actions must remain usable in short/keyboard-height views.

Tooltips should clarify icon-only actions, not repeat text that is already visible. The owner specifically reported native and host tooltips appearing together, and container accessibility names surfacing over toolbar gaps, the scrollbar, search, categories, part cards and inspector backgrounds. Keep screen-reader names without turning every labelled container or text control into a hover tooltip. Icon-only controls such as Undo/Redo should have one useful host tooltip, without a duplicate native title.

Keep the inspector easy to scan. Show the selected object and common properties first; group movement, connections and advanced actions in clearly labelled disclosures. Use a concise empty state, meaningful object groups and short explanations. Preserve capabilities while reducing the amount a user must process at once. Blank-canvas right-clicks must not open an empty Properties panel. Double-click/double-tap should inspect the targeted object reliably, including with Multi enabled.

The owner approved subtle, brief placement and wire feedback, pin-target confirmation, selection fades, alignment/overlap cues and smooth camera transitions. Keep motion controlled, informative and easy to interrupt. Honor Reduce Motion. Feedback must not move authoritative pins, shift hit targets, obstruct input or suggest an edit that did not commit.

Alignment aids should help users make deliberate choices. Avoid unexpected coordinate nudges. Warnings should be useful and quiet, with a clear recovery path rather than persistent visual noise.

## Touch and mobile are core workflows

Desktop, tablet and phone should share essential editing capabilities, with layouts appropriate to each screen and practical touch targets. Do not depend on hover, a hardware keyboard, desktop APIs or precision mouse input for essential operations.

The owner reported pinch problems on Android tablet and phone, and canvas swipes opening Obsidian side panels or pull-down actions. Preserve these fixes: navigation gestures belong to the canvas; pinch follows both fingers and their midpoint; lifting either finger continues a sensible pan; navigation must not accidentally place a part or commit a drag.

Keep drawings readable and accessible around toolbars, inspectors, zoom controls, the soft keyboard and orientation changes. Browser touch emulation is valuable evidence and must be described accurately; it does not establish behavior inside a real Android/iOS Obsidian installation.

## Circuit-specific precision and reliability

Electrical connectivity is explicit. Moving, rotating, mirroring, redrawing or rerouting must preserve what is connected unless the user deliberately changes a connection. Stable pin identity, explicit junctions, unjoined crossings and bus-width/lane semantics are central product behavior.

Wire routing should be specialized for circuit drafting: clear pin exits, sensible orthogonal paths around component bodies, reasonable clearance, few unnecessary bends, stable previews and control over manual waypoints. Placement and connected moves should feel precise and predictable, including larger or crowded drawings.

Protect user data through valid, portable files, atomic commands, dependable undo/redo, accurate save status, conflict handling and accessible recovery. Concurrent views, imports, previews and external file changes must not silently corrupt or overwrite a circuit.

Recovery storage belongs in the plugin's Obsidian settings. Let users choose its vault folder and move existing plugin backups safely when applying the change, including when a folder was moved manually before or after changing the preference. Preserve unrelated files and destination collisions. Each backup folder should have a brief `00_README.md` identifying Logic-Electric Circuit Builder, explaining why the backups are useful and where to change the location; refresh those instructions when the path changes.

Offer optional exclusion of recovery folders from everyday Search/Graph results, with accurate Quick Switcher wording (deprioritized, not fully hidden). Manage only an exclusion the plugin added itself, follow folder changes and preserve pre-existing user entries. Missing host integration must not compromise recovery. Keep the recovery README brief: “What this folder is — DO NOT REMOVE” comes first with a plain explanation, then “Change this folder's location only in plugin settings”. Do not expose internal markers in the note. Include a concrete recovery-folder example such as 99_Archive/CircuitBackup. Use the actual Community plugins → Logic-Electric Circuit Builder → ⋮ → Settings → Recovery folder path. Keep a real Apply button with the folder field in one row. Settings guidance should describe concrete steps, including opening a circuit's top-right three-dot menu for shortcuts; “How to sync” needs only the instruction to enable “Sync all other types” on each device.

The owner asks for professional work without mistakes and wants no bugs slipping through. Treat that as a high quality bar: reproduce reported problems, inspect related failure modes, fix root causes and verify the relevant complete workflows. Passing tests alone is not proof of flawless behavior. Be candid about real qualification gaps; never promise a universal zero-bug guarantee.

## Proactive improvement

The owner also expects efficient execution and continuous learning. Briefly review the approach during work, correct avoidable rework and scope expansion promptly, sequence verification sensibly, and give realistic progress updates. Preserve the product's quality bar while improving how the work is done. The concrete workflow and lessons are in [AGENTS.md](../AGENTS.md).

The owner explicitly welcomes judgment about missing features, common annoyances, placement, wires, pathfinding and small improvements that make editing smoother and more enjoyable. Do useful work within the requested scope without requiring a detailed design brief for every routine choice.

Look at how actions fit together and what the user experiences, not just individual functions. Prioritize fixes, clarity and workflow completeness. Add a feature when it solves a concrete editing problem and fits the product's organization; keep scope controlled and avoid speculative expansion.

Do not repeatedly ask whether the plugin should be intuitive, powerful, clean or polished. Those are established requirements. Ask about a genuinely unresolved consequential choice when the available project context cannot settle it.

Canvas tool shortcuts should be discoverable and customizable. Select has a shortcut as well as Wire. Tool keys must work only when the drawing owns focus, and must not interfere with notes, search, property fields, dialogs, text composition or native modifier shortcuts. Preserve familiar defaults and offer a clear way to restore them.

## Demonstration and documentation quality

Documentation and listing assets should make the plugin inviting and immediately understandable, with brief device support near the beginning and compelling, accurate descriptions.

**The README is the storefront.** Its first impression helps a reader decide whether to add the plugin. Clearly express the product's strengths: intuitive editing, comprehensive and powerful circuit tools, a clean organized UI, precise interactions, device support and useful note integration. Show what people can create and why it helps them. Describe supported strengths concretely, without promising flawless behavior.

Normal installation is a button click in Obsidian. The listing already provides the install action; the owner prefers the README to lead with screenshots and benefits without a duplicate installation CTA. Keep manual installation, ZIP paths, build commands, local development details and qualification logs in contributor/technical documentation, reachable through a small footer link. The owner explicitly corrected this after the initial README refresh; do not reintroduce technical setup material into the main promotional flow.

The Obsidian scanner subsequently warned that the README needs explicit installation and usage instructions. Keep a short **Installation** section describing the normal Community plugins Install/Enable flow and a **Usage** section near the bottom, after the screenshots and benefits. This satisfies the documentation requirement while preserving the intended first impression. Local development installation remains in CONTRIBUTING.md.

The owner specifically requested and approved a gallery of five desktop and five mobile images showing substantial, varied, interesting circuits. Use real editor captures, full useful examples and intentional portrait compositions. Empty canvases, two-part filler, illegible shrink-to-fit views and fabricated capabilities do not meet that standard. Include reusable editable drawings where practical.

Keep screenshots and listing claims aligned with what the product actually does. Preserve reproducible capture sources and identify emulation honestly. Current assets and instructions are in [screenshots/README.md](screenshots/README.md).

## Keeping this context useful

The owner permits routine cleanup of obsolete generated ZIPs, extracted build copies and older release assets. Keep release downloads easy to identify and avoid accumulating pre-release clutter. Verify replacement assets before removing superseded copies; preserve user circuits, recovery data, source history and published tag identities. Retain the current published version while its replacement is being prepared. This permission is not an instruction to publish a release on the owner's behalf.

This file describes enduring priorities, not a task queue or an evergreen claim that tests pass. Use [ui-contract.md](ui-contract.md) for concrete UI behavior, [architecture.md](architecture.md) for technical boundaries, and the dated validation/evidence documents for verified results and remaining platform checks. Check the current code, worktree and user request on every session.

Keep this brief and the root `AGENTS.md` in the repository so fresh sessions on this checkout can discover them immediately. Repository instructions provide durable project context; they do not guarantee automatic recall in a session that has no access to the project.
