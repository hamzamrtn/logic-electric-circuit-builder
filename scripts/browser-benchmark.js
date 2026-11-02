async () => {
  const result = { kind: 'browser commit and rendering smoke, not device FPS qualification', viewport: `${innerWidth}x${innerHeight}`, browser: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, fixtures: [] };
  const base = window.__lec.examples[0].document;
  const original = base.components.find(c => base.definitions.find(d => d.id === c.definitionId).name === 'Resistor');
  for (const count of [100, 500]) {
    const doc = { ...JSON.parse(JSON.stringify(base)), id: `benchmark-${count}`, title: `${count} parts / ${count * 3} wires`, components: [], nodes: [], wires: [], annotations: [], groups: [] };
    for (let i = 0; i < count; i++) doc.components.push({ ...JSON.parse(JSON.stringify(original)), id: `bench-c-${i}`, reference: `R${i + 1}`, rotation: 0, position: { x: (i % 20) * 160, y: Math.floor(i / 20) * 160 } });
    for (let i = 0; i < count * 3; i++) doc.wires.push({ id: `bench-w-${i}`, a: { kind: 'pin', componentId: `bench-c-${i % count}`, pinId: '2' }, b: { kind: 'pin', componentId: `bench-c-${(i % count + Math.floor(i / count) + 1) % count}`, pinId: '1' }, width: 1, locked: false, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst: true, vertices: [] } });
    const start = performance.now(); window.__lec.session.replaceRaw(JSON.stringify(doc)); const parsed = performance.now();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); const rendered = performance.now();
    result.fixtures.push({ components: count, wires: count * 3, parsePublishMs: +(parsed - start).toFixed(2), throughTwoFramesMs: +(rendered - start).toFixed(2), visibleParts: document.querySelectorAll('.lec-canvas .lec-part').length, visibleWirePaths: document.querySelectorAll('.lec-canvas .lec-wire').length });
  }
  window.__lec.session.replaceRaw(JSON.stringify(base)); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); document.querySelector('[aria-label="Fit circuit"]').click(); return result;
}
