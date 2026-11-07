import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function FileMenu({ anchor, boundary, onClose, children, footer, label = 'File' }: {
  anchor: HTMLElement | null; boundary: HTMLElement | null; onClose: () => void; children: ReactNode; footer?: ReactNode; label?: string;
}) {
  const labelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 6, top: 36, maxHeight: 400 });
  useLayoutEffect(() => {
    if (!anchor || !boundary || !ref.current) return;
    const doc = boundary.ownerDocument, win = doc.defaultView; if (!win) return;
    const place = () => {
      const button = anchor.getBoundingClientRect(), bounds = boundary.getBoundingClientRect(), width = ref.current?.offsetWidth ?? 280;
      const top = Math.max(0, button.bottom - bounds.top + 4);
      setPosition({ left: Math.max(6, Math.min(button.left - bounds.left, bounds.width - width - 6)), top, maxHeight: Math.max(0, bounds.height - top - 36) });
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!ref.current?.contains(target) && !anchor.contains(target)) { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    const menu = ref.current;
    place(); menu.querySelector<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')?.focus();
    const observer = new win.ResizeObserver(place); observer.observe(boundary);
    doc.addEventListener('pointerdown', outside, true); doc.addEventListener('scroll', place, true); win.addEventListener('resize', place);
    return () => {
      observer.disconnect(); doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('scroll', place, true); win.removeEventListener('resize', place);
      const active = doc.activeElement; if (!active || active === doc.body || menu.contains(active)) anchor.focus({ preventScroll: true });
    };
  }, [anchor, boundary, onClose]);
  return <div ref={ref} className="lec-file-menu" role="menu" aria-labelledby={labelId} style={position} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')], current = items.indexOf(event.target as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}><div className="lec-file-menu-body"><span id={labelId} hidden>{label}</span>{children}</div>{footer && <div className="lec-file-menu-footer">{footer}</div>}</div>;
}
