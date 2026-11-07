import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Definition } from '../../core/model/document';
import { library } from '../../components/definitions/library';
import { SymbolDrawing } from '../render/Scene';

const groups = {
  Electrical: ['Passive', 'Sources', 'Switches', 'Semiconductors', 'Analog', 'Loads & instruments'],
  Logic: ['Logic gates', 'Logic I/O', 'Logic blocks'],
  Connections: ['Connectivity', 'Buses'],
} as const;
type Group = keyof typeof groups;
interface Props {
  open: boolean; onOpenChange: (open: boolean) => void; onPart: (part: Definition) => void;
  onCustomBlock: () => void; onText: () => void; onSelectAll: () => void; onDeselectAll: () => void;
  selectionCount: number;
  container: HTMLElement | null;
}
function Preview({ definition: d }: { definition: Definition }) {
  const xs = [d.bounds.x, d.bounds.x + d.bounds.width, ...d.pins.map(p => p.x)], ys = [d.bounds.y, d.bounds.y + d.bounds.height, ...d.pins.map(p => p.y)];
  const x = Math.min(...xs) - 8, y = Math.min(...ys) - 8;
  return <svg viewBox={`${x} ${y} ${Math.max(...xs) - x + 8} ${Math.max(...ys) - y + 8}`} aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2"><SymbolDrawing definition={d} /></g></svg>;
}
export function PartsToolbar({ open, onOpenChange, onPart, onCustomBlock, onText, onSelectAll, onDeselectAll, selectionCount, container }: Props) {
  const groupLabel = useId(), popupLabel = useId(), searchLabel = useId(), categoriesLabel = useId(), partsId = useId();
  const [group, setGroup] = useState<Group>('Electrical'), [category, setCategory] = useState<string>('Passive'), [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (open) searchInput.current?.focus(); }, [open]);
  function toggle(next: Group, button: HTMLButtonElement) {
    trigger.current = button;
    if (open && group === next) { onOpenChange(false); return; }
    setGroup(next); setCategory(groups[next][0]); setSearch(''); onOpenChange(true);
  }
  function close() { onOpenChange(false); trigger.current?.focus(); }
  const bounds = container?.getBoundingClientRect(), toolbar = trigger.current?.closest('.lec-topbar')?.getBoundingClientRect();
  const popupWidth = Math.min(640, (bounds?.width ?? 656) - 16);
  const left = Math.max(8, Math.min((trigger.current?.getBoundingClientRect().left ?? 8) - (bounds?.left ?? 0), (bounds?.width ?? 656) - popupWidth - 8));
  const top = (toolbar?.bottom ?? 36) - (bounds?.top ?? 0) + 2;
  const filtered = library.filter(d => search.trim() ? `${d.name} ${d.aliases.join(' ')} ${d.category}`.toLowerCase().includes(search.toLowerCase()) : d.category === category);
  return <>
    <div className="lec-parts-toolbar" role="group" aria-labelledby={groupLabel}>
      <span id={groupLabel} hidden>Parts and selection</span>
      {(Object.keys(groups) as Group[]).map(name => <button key={name} aria-labelledby={`${partsId}-${name}`} aria-haspopup="dialog" aria-expanded={open && group === name} className={open && group === name ? 'is-active' : ''} onClick={e => toggle(name, e.currentTarget)}><span id={`${partsId}-${name}`} hidden>{name} parts</span>{name}<span aria-hidden="true">⌄</span></button>)}
      <button onClick={onCustomBlock}>Custom block</button><button onClick={onText}>Text</button>
      <div className="lec-selection-tools"><button onClick={onSelectAll}>Select all</button><button onClick={onDeselectAll} disabled={!selectionCount}>Deselect all</button></div>
    </div>
    {open && container && createPortal(<>
      <div className="lec-part-dismiss" style={{ top }} onPointerDown={e => { e.preventDefault(); e.stopPropagation(); close(); }} onPointerUp={e => e.stopPropagation()} />
      <div className="lec-part-popover" style={{ top, left, maxHeight: Math.max(0, (bounds?.height ?? 500) - top - 8) }} role="dialog" aria-labelledby={popupLabel} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <span id={popupLabel} hidden>Parts library</span>
        <div className="lec-part-search"><span id={searchLabel} hidden>Search parts</span><input ref={searchInput} aria-labelledby={searchLabel} placeholder="Search all parts…" value={search} onChange={e => setSearch(e.target.value)} /><button aria-label="Close parts library" onClick={close}>×</button></div>
        <div className="lec-part-categories" role="tablist" aria-labelledby={categoriesLabel}><span id={categoriesLabel} hidden>{group} categories</span>{groups[group].map(name => <button key={name} role="tab" aria-selected={category === name && !search} onClick={() => { setCategory(name); setSearch(''); }}>{name}</button>)}</div>
        <div className="lec-parts-grid">{filtered.map(d => <button key={d.id} aria-labelledby={`${partsId}-${d.id}`} className="lec-part-choice" onClick={() => onPart(d)}><span id={`${partsId}-${d.id}`} hidden>{d.name} {d.category}</span><Preview definition={d} /><span>{d.name}</span></button>)}{!filtered.length && <p className="lec-muted">No matching parts.</p>}</div>
      </div>
    </>, container)}
  </>;
}
