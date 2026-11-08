import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dockSides, dockTarget, type DockPosition, type DockSide } from '../input/docking';
import { FileMenu } from './FileMenu';
import { Icon } from './Controls';

export function DockHandle({ area, position, save, onError }: { area: HTMLElement | null; position: DockPosition; save: (side: DockPosition) => Promise<void>; onError: (message: string) => void }) {
  const handle = useRef<HTMLButtonElement>(null), gesture = useRef<{ id: number; x: number; y: number; moved: boolean }>(), skipClick = useRef(false);
  const [menu, setMenu] = useState(false), [target, setTarget] = useState<DockSide | null>(null), [saving, setSaving] = useState(false);
  const close = useCallback(() => setMenu(false), []);
  const owner = area?.closest<HTMLElement>('.lec-editor');
  function choose(side: DockPosition) {
    setMenu(false); setTarget(null); setSaving(true);
    void save(side).catch(error => onError(String(error))).finally(() => setSaving(false));
  }
  function abort() { gesture.current = undefined; setTarget(null); }
  return <>
    <button ref={handle} type="button" className="lec-dock-handle" aria-label="Move drawing toolbar" aria-haspopup="menu" aria-expanded={menu} disabled={saving}
      onPointerDown={event => {
        event.stopPropagation(); event.preventDefault(); if (event.button !== 0 || saving) return;
        if (gesture.current) { abort(); return; }
        skipClick.current = false; event.currentTarget.focus({ preventScroll: true });
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = gesture.current; if (!start || start.id !== event.pointerId || !area) return;
        event.stopPropagation(); event.preventDefault();
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) start.moved = true;
        if (start.moved) { setMenu(false); setTarget(dockTarget(event.clientX, event.clientY, area.getBoundingClientRect())); }
      }}
      onPointerUp={event => {
        const start = gesture.current; if (!start || start.id !== event.pointerId) return;
        event.stopPropagation(); gesture.current = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (start.moved) { skipClick.current = true; const side = area && dockTarget(event.clientX, event.clientY, area.getBoundingClientRect()); if (side) choose(side); else setTarget(null); }
      }}
      onPointerCancel={event => { event.stopPropagation(); skipClick.current = true; abort(); }}
      onLostPointerCapture={abort}
      onClick={event => { if (skipClick.current && event.detail > 0) { skipClick.current = false; return; } setMenu(!menu); }}><Icon name="move" /></button>
    {target && area && createPortal(<div className={`lec-dock-target is-${target}`} aria-hidden="true">Dock {target}</div>, area)}
    {menu && owner && createPortal(<FileMenu label="Toolbar position" anchor={handle.current} boundary={owner} onClose={close}>
      {dockSides.map(side => <button key={side} role="menuitemradio" aria-checked={position === side} onClick={() => choose(side)}>Dock {side}</button>)}
      <button role="menuitem" onClick={() => choose('auto')}>Reset toolbar position</button>
    </FileMenu>, owner)}
  </>;
}
