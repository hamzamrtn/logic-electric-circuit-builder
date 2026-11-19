/** A cancelled run must not wait for a timer in a window that is closing. */
export function simulationTurn(owner: Window, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { owner.clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = owner.setTimeout(finish, 0);
    signal.addEventListener('abort', finish, { once: true });
  });
}
