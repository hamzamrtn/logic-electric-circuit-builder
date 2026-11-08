import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dockSides, dockTarget, type DockPosition, type DockSide } from '../input/docking';

export function DockHandle({ area, position, save, onError }: { area: HTMLElement | null; position: DockPosition; save: (side: DockPosition) => Promise<void>; onError: (message: string) => void }) {
  const label = useId(), targetsLabel = useId(), help = useId();
  const handle = useRef<HTMLButtonElement>(null), gesture = useRef<{ id: number; x: number; y: number; moved: boolean; wasOpen: boolean }>(), skipClick = useRef(false), focusTargets = useRef(false);
  const [mode, setMode] = useState<'idle' | 'choose' | 'drag'>('idle'), [target, setTarget] = useState<DockSide | null>(null), [saving, setSaving] = useState(false), [announcement, setAnnouncement] = useState('');
  const owner = area?.closest<HTMLElement>('.lec-editor');
  const close = useCallback(() => { setMode('idle'); setTarget(null); }, []);
  useEffect(() => {
    if (mode === 'idle' || !area || !owner) return;
    const doc = owner.ownerDocument, win = doc.defaultView;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); gesture.current = undefined; skipClick.current = true; close(); handle.current?.focus({ preventScroll: true });
    };
    const outside = (event: PointerEvent) => {
      if (mode !== 'choose') return;
      const node = event.target as Node | null, element = node?.nodeType === 1 ? node as Element : node?.parentElement;
      if (handle.current?.contains(node) || element?.closest('[data-dock-side]')?.closest('.lec-editor') === owner) return;
      const insideEditor = !!node && owner.contains(node);
      if (insideEditor) { event.preventDefault(); event.stopPropagation(); }
      close(); if (insideEditor) handle.current?.focus({ preventScroll: true });
    };
    const focus = mode === 'choose' && focusTargets.current ? win?.requestAnimationFrame(() => area.querySelector<HTMLButtonElement>('[data-dock-side="top"]')?.focus({ preventScroll: true })) : undefined;
    doc.addEventListener('keydown', key, true); doc.addEventListener('pointerdown', outside, true);
    return () => { doc.removeEventListener('keydown', key, true); doc.removeEventListener('pointerdown', outside, true); if (focus !== undefined) win?.cancelAnimationFrame(focus); };
  }, [mode, area, owner, close]);
  function targetAt(x: number, y: number): DockSide | null {
    if (!area) return null;
    for (const button of area.querySelectorAll<HTMLElement>('[data-dock-side]')) {
      const box = button.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return button.dataset.dockSide as DockSide;
    }
    const box = area.getBoundingClientRect(), viewport = area.querySelector('.lec-viewport');
    const inset = viewport ? Number.parseFloat(viewport.ownerDocument.defaultView?.getComputedStyle(viewport).scrollPaddingBottom ?? '') || 0 : 0;
    return dockTarget(x, y, { left: box.left, right: box.right, top: box.top, bottom: box.bottom - inset, width: box.width, height: Math.max(0, box.height - inset) });
  }
  function choose(side: DockPosition) {
    close(); setSaving(true);
    void save(side).then(() => setAnnouncement(side === 'auto' ? 'Toolbar returned to its default position.' : `Toolbar docked ${side}.`)).catch(error => onError(String(error))).finally(() => { setSaving(false); owner?.ownerDocument.defaultView?.requestAnimationFrame(() => handle.current?.focus({ preventScroll: true })); });
  }
  function abort() { gesture.current = undefined; close(); }
  return <>
    <span id={label} hidden>Move drawing toolbar</span><span id={help} hidden>Drag the grip toward an edge, or activate it to choose a docking position.</span>
    <button ref={handle} type="button" className="lec-dock-handle" aria-labelledby={label} aria-describedby={help} aria-controls={targetsLabel + '-group'} aria-expanded={mode !== 'idle'} disabled={saving}
      onPointerDown={event => {
        event.stopPropagation(); event.preventDefault(); if (event.button !== 0 || saving) return;
        if (gesture.current) { abort(); return; }
        skipClick.current = false; event.currentTarget.focus({ preventScroll: true });
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, wasOpen: mode === 'choose' };
        setMode('drag'); setTarget(null); event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = gesture.current; if (!start || start.id !== event.pointerId || !area) return;
        event.stopPropagation(); event.preventDefault();
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) start.moved = true;
        if (start.moved) setTarget(targetAt(event.clientX, event.clientY));
      }}
      onPointerUp={event => {
        const start = gesture.current; if (!start || start.id !== event.pointerId) return;
        event.stopPropagation(); gesture.current = undefined; skipClick.current = true;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (start.moved) { const side = area && targetAt(event.clientX, event.clientY); if (side) choose(side); else close(); }
        else { focusTargets.current = false; setTarget(null); setMode(start.wasOpen ? 'idle' : 'choose'); }
      }}
      onPointerCancel={event => { event.stopPropagation(); skipClick.current = true; abort(); }}
      onLostPointerCapture={() => { if (gesture.current) abort(); }}
      onKeyDown={event => { if (event.key === 'Tab' && mode === 'choose') { event.preventDefault(); area?.querySelector<HTMLButtonElement>('[data-dock-side="top"]')?.focus({ preventScroll: true }); } if (event.key === 'Escape' && mode !== 'idle') { event.stopPropagation(); event.preventDefault(); const id = gesture.current?.id; abort(); if (id !== undefined && handle.current?.hasPointerCapture(id)) handle.current.releasePointerCapture(id); } }}
      onClick={event => { if (skipClick.current && event.detail > 0) { skipClick.current = false; return; } if (event.detail === 0) { focusTargets.current = true; setTarget(null); setMode(mode === 'choose' ? 'idle' : 'choose'); } }}>
      <svg className="lec-grip-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{[4, 8, 12].flatMap(y => [5, 11].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" fill="currentColor" />))}</svg><span>Move</span>
    </button>
    <span className="lec-sr-only" role="status">{announcement}</span>
    {mode !== 'idle' && area && createPortal(<div id={targetsLabel + '-group'} className="lec-dock-targets" role="group" aria-labelledby={targetsLabel} data-ignore-swipe="true" onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Tab') {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && event.target === first || !event.shiftKey && event.target === last) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      }
    }}>
      <span id={targetsLabel} hidden>Toolbar docking positions</span>
      {dockSides.map(side => <button key={side} type="button" data-dock-side={side} className={`lec-dock-target is-${side}${target === side ? ' is-candidate' : ''}`} aria-pressed={(position === 'auto' ? 'top' : position) === side} onPointerEnter={() => { if (mode === 'choose') setTarget(side); }} onPointerLeave={() => { if (mode === 'choose') setTarget(null); }} onFocus={() => setTarget(side)} onClick={() => choose(side)}>Dock {side}</button>)}
    </div>, area)}

  </>;
}
