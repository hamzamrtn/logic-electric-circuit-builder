import { expect, it, vi } from 'vitest';
import { simulationTurn } from '../../src/editor/simulation/schedule';
it('abort releases a scheduled turn even when its window timer never fires', async () => {
  const scheduled = vi.fn(() => 42), cleared = vi.fn();
  const owner = { setTimeout: scheduled, clearTimeout: cleared } as unknown as Window;
  const controller = new AbortController(), pending = simulationTurn(owner, controller.signal);
  controller.abort(); await pending; expect(cleared).toHaveBeenCalledWith(42); expect(scheduled).toHaveBeenCalledTimes(1);
  await simulationTurn(owner, controller.signal); expect(scheduled).toHaveBeenCalledTimes(1);
});
it('a normal timer releases its abort listener and resolves once', async () => {
  let tick = () => {};
  const owner = { setTimeout: (callback: () => void) => { tick = callback; return 7; }, clearTimeout: vi.fn() } as unknown as Window;
  const controller = new AbortController(), removed = vi.spyOn(controller.signal, 'removeEventListener');
  const pending = simulationTurn(owner, controller.signal); tick(); await pending;
  expect(removed).toHaveBeenCalledTimes(1); controller.abort(); expect(removed).toHaveBeenCalledTimes(1);
});
