import { Modal, setIcon, type App } from 'obsidian';

/** The release whose notes the modal presents. Bump only for updates worth announcing. */
export const WHATS_NEW_VERSION = '1.0.0';
const GUIDE = 'https://github.com/hamzamrtn/logic-electric-circuit-builder/blob/1.0.0/docs/simulation.md';

/** Numeric x.y.z comparison; anything unparsable counts as older. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v); return m ? m.slice(1).map(Number) : [0, 0, 0]; };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/**
 * Show the notes once to people updating from an earlier release. A fresh install
 * (no saved plugin data) is not an update, and users can turn the notes off.
 */
export function shouldShowWhatsNew(options: { hadSavedData: boolean; lastVersion: string | null; current: string; enabled: boolean }): boolean {
  const { hadSavedData, lastVersion, current, enabled } = options;
  if (!enabled || !hadSavedData || compareVersions(current, WHATS_NEW_VERSION) < 0) return false;
  return lastVersion === null || compareVersions(lastVersion, WHATS_NEW_VERSION) < 0;
}

const features: [icon: string, label: string][] = [['activity', 'Oscilloscope and probes'], ['table-2', 'Logic truth tables'], ['smartphone', 'Desktop to phone']];

/** A miniature of the Simulate scope: fine grid, a filtered sine with a soft fill, a comparator square wave and two cursors. */
function scope(parent: HTMLElement) {
  const W = 560, H = 196, mid = 104, period = 140;
  const hero = parent.createDiv({ cls: 'lec-wn-hero' });
  const svg = hero.createSvg('svg', { attr: { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' } });
  const defs = svg.createSvg('defs'), fill = defs.createSvg('linearGradient', { attr: { id: 'lec-wn-fill', x1: 0, y1: 0, x2: 0, y2: 1 } });
  fill.createSvg('stop', { cls: 'lec-wn-fill-top', attr: { offset: '0%' } }); fill.createSvg('stop', { cls: 'lec-wn-fill-bottom', attr: { offset: '100%' } });
  for (let x = 40; x < W; x += 40) svg.createSvg('line', { cls: 'lec-wn-grid', attr: { x1: x, x2: x, y1: 0, y2: H } });
  for (let y = mid - 64; y <= mid + 64; y += 32) svg.createSvg('line', { cls: y === mid ? 'lec-wn-axis' : 'lec-wn-grid', attr: { x1: 0, x2: W, y1: y, y2: y } });
  const sine: string[] = [];
  for (let x = 0; x <= W; x += 2) sine.push(`${x} ${(mid - 46 * Math.sin(((x - 18) / period) * 2 * Math.PI)).toFixed(1)}`);
  svg.createSvg('path', { cls: 'lec-wn-area', attr: { d: `M${sine.join('L')}L${W} ${H}L0 ${H}Z` } });
  // The comparator is high while the sine is above its threshold, with a two-pixel slew on each edge.
  let square = `M0 ${mid + 60}`;
  for (let p = -1; p < 5; p++) { const rise = 18 + p * period + 22, fall = rise + 26; square += `L${rise} ${mid + 60}L${rise + 2} ${mid - 60}L${fall} ${mid - 60}L${fall + 2} ${mid + 60}`; }
  svg.createSvg('path', { cls: 'lec-wn-square', attr: { d: `${square}L${W} ${mid + 60}` } });
  svg.createSvg('path', { cls: 'lec-wn-sine', attr: { d: `M${sine.join('L')}` } });
  for (const [x, label] of [[218, 'A'], [358, 'B']] as const) {
    svg.createSvg('line', { cls: 'lec-wn-cursor', attr: { x1: x, x2: x, y1: 26, y2: H } });
    svg.createSvg('text', { cls: 'lec-wn-cursor-label', attr: { x: x + 5, y: 38 } }).textContent = label;
  }
  const top = hero.createDiv({ cls: 'lec-wn-hero-top' });
  const live = top.createSpan({ cls: 'lec-wn-live' }); live.createSpan({ cls: 'lec-wn-dot' }); live.appendText('Live');
  const readouts = top.createDiv({ cls: 'lec-wn-readouts' });
  for (const [cls, text] of [['is-sine', '2.11 V pk'], ['is-square', '1.00 kHz']]) readouts.createSpan({ cls: `lec-wn-readout ${cls}`, text });
}

export class WhatsNewModal extends Modal {
  constructor(app: App) { super(app); }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass('lec-whats-new');
    scope(contentEl);
    const body = contentEl.createDiv({ cls: 'lec-wn-body' });
    body.createDiv({ cls: 'lec-wn-eyebrow', text: 'New in 1.0' });
    body.createEl('h2', { cls: 'lec-wn-title', text: 'Powerful, live simulations are finally here' });
    body.createEl('p', { cls: 'lec-wn-subtitle', text: 'Analyse any circuit live, right where you draw it.' });
    const tiles = body.createDiv({ cls: 'lec-wn-features' });
    for (const [icon, label] of features) { const tile = tiles.createDiv({ cls: 'lec-wn-feature' }); setIcon(tile.createSpan({ cls: 'lec-wn-icon' }), icon); tile.createSpan({ text: label }); }
    const footer = contentEl.createDiv({ cls: 'lec-wn-footer' });
    footer.createEl('small', { cls: 'lec-wn-optout', text: 'You can turn these off in settings.' });
    const actions = footer.createDiv({ cls: 'lec-wn-actions' });
    actions.createEl('a', { cls: 'lec-wn-link', text: 'Learn more', href: GUIDE, attr: { target: '_blank', rel: 'noopener noreferrer' } });
    const done = actions.createEl('button', { cls: 'mod-cta', text: 'Got it' });
    done.addEventListener('click', () => this.close());
    contentEl.win.setTimeout(() => done.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}
