import { useState, type FormEvent } from 'react';
import { DialogFrame } from './Dialog';
import { DEFAULT_SHORTCUTS, shortcutActions, validateShortcuts, type ShortcutAction, type ToolShortcuts } from '../input/shortcuts';

export function ShortcutsDialog({ bindings, save, close }: { bindings: ToolShortcuts; save: (value: ToolShortcuts) => Promise<void>; close: () => void }) {
  const [values, setValues] = useState({ ...bindings }), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    try {
      const next = validateShortcuts(values); setError(''); setBusy(true);
      void save(next).then(close).catch((error: unknown) => setError(error instanceof Error ? error.message : String(error))).finally(() => setBusy(false));
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  return <DialogFrame title="Keyboard shortcuts" description="Use one letter or number per action. Leave a key blank to disable it. These keys work only while the drawing has focus; typing in notes, fields and dialogs is unaffected." close={close} busy={busy}>
    <form onSubmit={submit} className="lec-shortcuts-form">
      {(Object.keys(shortcutActions) as ShortcutAction[]).map(action => <label className="lec-shortcut-row" key={action}>{shortcutActions[action]}<input value={values[action].toUpperCase()} maxLength={1} spellCheck={false} autoComplete="off" disabled={busy} onChange={event => setValues(previous => ({ ...previous, [action]: event.target.value.toLowerCase() }))} /></label>)}
      {error && <p role="alert" className="lec-error">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={() => { setValues({ ...DEFAULT_SHORTCUTS }); setError(''); }}>Reset defaults</button><button type="button" disabled={busy} onClick={close}>Cancel</button><button className="lec-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save shortcuts'}</button></footer>
    </form>
  </DialogFrame>;
}
