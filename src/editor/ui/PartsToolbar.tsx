import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Definition } from '../../core/model/document';
import { library } from '../../components/definitions/library';
import { SymbolDrawing } from '../render/Scene';
import { Icon } from './Controls';

const groups = {
  Electrical: ['Passive', 'Sources', 'Switches', 'Semiconductors', 'Analog', 'Loads & instruments'],
  Logic: ['Logic gates', 'Logic I/O', 'Logic blocks'],
  Connections: ['Connectivity', 'Buses'],
} as const;
type Group = keyof typeof groups;
interface Props {
  open: boolean; onOpenChange: (open: boolean) => void; onPart: (part: Definition) => void;
  onCustomBlock: () => void; onText: () => void;
  container: HTMLElement | null; compact: boolean; dockHeight: number;
}
function Preview({ definition: d }: { definition: Definition }) {
  const xs = [d.bounds.x, d.bounds.x + d.bounds.width, ...d.pins.map(p => p.x)], ys = [d.bounds.y, d.bounds.y + d.bounds.height, ...d.pins.map(p => p.y)];
  const x = Math.min(...xs) - 8, y = Math.min(...ys) - 8;
  return <svg viewBox={`${x} ${y} ${Math.max(...xs) - x + 8} ${Math.max(...ys) - y + 8}`} aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2"><SymbolDrawing definition={d} /></g></svg>;
}
export function PartsToolbar({ open, onOpenChange, onPart, onCustomBlock, onText, container, compact, dockHeight }: Props) {
  const groupLabel = useId(), popupLabel = useId(), searchLabel = useId(), categoriesLabel = useId(), familiesLabel = useId(), partsId = useId(), addLabel = useId();
  const [group, setGroup] = useState<Group>('Electrical'), [category, setCategory] = useState<string>('Passive'), [search, setSearch] = useState('');
  const [position, setPosition] = useState<CSSProperties>({ left: 8, top: 56, maxHeight: 400 });
  const searchInput = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), wasOpen = useRef(false);
  const owner = container?.closest<HTMLElement>('.lec-editor') ?? container;
  useLayoutEffect(() => {
    if (!open || !container || !owner) return;
    const win = owner.ownerDocument.defaultView; if (!win) return;
    const place = () => {
      const area = container.getBoundingClientRect(), bounds = owner.getBoundingClientRect(), button = trigger.current?.getBoundingClientRect();
      const width = Math.max(0, Math.min(640, area.width - 16));
      if (compact) {
        const dock = container.querySelector('.lec-drawing-toolbar')?.getBoundingClientRect();
        const bottom = bounds.bottom - (dock?.top ?? area.bottom - dockHeight - 26) + 8;
        const utilities = container.querySelector('.lec-topbar')?.getBoundingClientRect();
        const available = (utilities ? bounds.bottom - utilities.bottom : area.height - 56) - bottom - 16;
        const short = available < 340, height = Math.max(0, Math.min(560, short ? area.height - 16 : available));
        setPosition({ left: area.left - bounds.left + (area.width - width) / 2, width, bottom: short ? bounds.bottom - area.bottom + 8 : bottom, height, maxHeight: height });
      } else {
        const top = (button?.bottom ?? area.top + 48) - bounds.top + 8;
        setPosition({ left: area.left - bounds.left + Math.max(8, Math.min((button?.left ?? area.left + 8) - area.left, area.width - width - 8)), top, width, maxHeight: Math.max(0, Math.min(560, bounds.height - top - 12)) });
      }
    };
    place(); const observer = new win.ResizeObserver(place); observer.observe(container);
    return () => observer.disconnect();
  }, [open, container, owner, compact, dockHeight]);
  useEffect(() => {
    if (!open) { wasOpen.current = false; return; }
    if (!container || wasOpen.current) return;
    wasOpen.current = true;
    if (container.ownerDocument.defaultView?.matchMedia('(pointer: coarse)').matches) panel.current?.focus({ preventScroll: true });
    else searchInput.current?.focus({ preventScroll: true });
  }, [open, compact, container]);
  function close() { onOpenChange(false); trigger.current?.focus({ preventScroll: true }); }
  function choose(definition: Definition) {
    const family = (Object.keys(groups) as Group[]).find(name => (groups[name] as readonly string[]).includes(definition.category));
    if (family) { setGroup(family); setCategory(definition.category); } onPart(definition);
  }
  const filtered = library.filter(d => search.trim() ? `${d.name} ${d.aliases.join(' ')} ${d.category}`.toLowerCase().includes(search.trim().toLowerCase()) : d.category === category);
  return <>
    <div className="lec-parts-toolbar" role="group" aria-labelledby={groupLabel}>
      <span id={groupLabel} hidden>Add to circuit</span>
      <button ref={trigger} aria-labelledby={addLabel} aria-haspopup="dialog" aria-expanded={open} className={open ? 'is-active' : ''} onClick={() => { if (open) close(); else { setSearch(''); onOpenChange(true); } }}><span id={addLabel} hidden>Add parts</span><Icon name="add" /><span>Add</span></button>
    </div>
    {open && owner && createPortal(<>
      <div className="lec-part-dismiss" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); close(); }} onPointerUp={event => event.stopPropagation()} />
      <div ref={panel} tabIndex={-1} className={`lec-part-popover${compact ? ' is-compact' : ''}`} style={position} role="dialog" aria-modal="true" aria-labelledby={popupLabel} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') {
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('input,button:not(:disabled)')].filter(element => element.getClientRects().length);
          const first = controls[0], last = controls.at(-1), active = event.currentTarget.ownerDocument.activeElement;
          if (first && (active === event.currentTarget || event.shiftKey && active === first || !event.shiftKey && active === last)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
        }
      }}>
        <div className="lec-picker-heading"><h2 id={popupLabel}>Parts library</h2><button aria-label="Close parts library" onClick={close}>×</button></div>
        <div className="lec-part-search"><span id={searchLabel} hidden>Search parts</span><input ref={searchInput} aria-labelledby={searchLabel} placeholder="Search parts…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear part search" onClick={() => { setSearch(''); searchInput.current?.focus(); }}>×</button>}</div>
        <div className="lec-picker-content">{!search.trim() && <><div className="lec-part-families" role="tablist" aria-labelledby={familiesLabel}><span id={familiesLabel} hidden>Part families</span>{(Object.keys(groups) as Group[]).map(name => <button key={name} role="tab" aria-labelledby={`${partsId}-${name}`} aria-selected={group === name} onClick={() => { setGroup(name); setCategory(groups[name][0]); setSearch(''); }}><span id={`${partsId}-${name}`} hidden>{name} parts</span>{name}</button>)}</div>
        <div className="lec-part-categories" role="tablist" aria-labelledby={categoriesLabel}><span id={categoriesLabel} hidden>{group} categories</span>{groups[group].map(name => <button key={name} role="tab" aria-selected={category === name && !search} onClick={() => { setCategory(name); setSearch(''); }}>{name}</button>)}</div>
        </>}<div className="lec-parts-grid">{filtered.map(d => <button key={d.id} aria-labelledby={`${partsId}-${d.id}`} className="lec-part-choice" onClick={() => choose(d)}><span id={`${partsId}-${d.id}`} hidden>{d.name} {d.category}</span><Preview definition={d} /><span>{d.name}</span></button>)}{!filtered.length && <p className="lec-muted">No matching parts.</p>}</div>
        </div><div className="lec-picker-footer"><button onClick={() => { onOpenChange(false); onText(); }}>Text</button><button onClick={() => { onOpenChange(false); onCustomBlock(); }}>Custom block</button></div>
      </div>
    </>, owner)}
  </>;
}
