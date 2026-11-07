import { useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
export interface Field { name: string; label: string; value?: string; type?: 'text' | 'number' | 'textarea' | 'select'; options?: { value: string; label: string }[]; required?: boolean; }
export interface DialogSpec { title: string; description?: string; fields: Field[]; submit?: string; danger?: boolean; onSubmit: (values: Record<string, string>) => void | Promise<void>; }
export function DialogFrame({ title, description, close, busy = false, children }: { title: string; description?: string; close: () => void; busy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), titleId = useId(), previousBusy = useRef(busy);
  useEffect(() => {
    const element = ref.current, previous = element?.ownerDocument.activeElement as HTMLElement | null;
    const editor = element?.closest<HTMLElement>('.lec-editor');
    element?.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled)')?.focus();
    return () => {
      const active = element?.ownerDocument.activeElement;
      if (active && active !== element?.ownerDocument.body && !element?.contains(active)) return;
      const target = previous?.isConnected ? previous : editor; target?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const completed = previousBusy.current && !busy; previousBusy.current = busy;
    const element = ref.current; if (!element) return;
    const active = element.ownerDocument.activeElement;
    if (busy) { if (active === element.ownerDocument.body) element.focus(); }
    else if (active === element || active === element.ownerDocument.body || completed && active?.tagName === 'BUTTON' && element.contains(active)) element.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled)')?.focus();
  }, [busy, children]);
  return <div className="lec-backdrop" onPointerDown={e => { if (e.target === e.currentTarget && !busy) close(); }}><div className="lec-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? `${titleId}-description` : undefined} tabIndex={-1} ref={ref} onKeyDown={e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (!busy) close(); }
    if (e.key === 'Tab') {
      const elements = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1), active = e.currentTarget.ownerDocument.activeElement;
      if (!first) { e.preventDefault(); e.currentTarget.focus(); }
      else if (e.shiftKey && active === first || !e.shiftKey && active === last || !elements.includes(active as HTMLElement)) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); }
    }
  }}><h2 id={titleId}>{title}</h2>{description && <p id={`${titleId}-description`}>{description}</p>}{children}</div></div>;
}
export function Dialog({ spec, close }: { spec: DialogSpec; close: () => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    setError(''); setBusy(true);
    void Promise.resolve().then(() => spec.onSubmit(values)).then(close).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : String(error));
    }).finally(() => setBusy(false));
  }
  return <DialogFrame title={spec.title} description={spec.description} close={close} busy={busy}><form onSubmit={submit}>{spec.fields.map(field => <label key={field.name} className="lec-field">{field.label}{field.type === 'textarea' ? <textarea name={field.name} defaultValue={field.value} required={field.required} spellCheck={false} rows={8} /> : field.type === 'select' ? <select name={field.name} defaultValue={field.value}>{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input name={field.name} type={field.type ?? 'text'} defaultValue={field.value} required={field.required} />}</label>)}{error && <p role="alert" className="lec-error">{error}</p>}<footer><button type="button" onClick={close} disabled={busy}>Cancel</button><button className={spec.danger ? 'lec-danger' : 'lec-primary'} type="submit" disabled={busy}>{busy ? 'Working…' : spec.submit ?? 'Apply'}</button></footer></form></DialogFrame>;
}
