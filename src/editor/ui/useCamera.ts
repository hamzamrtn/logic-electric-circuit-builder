import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Camera } from '../input/types';

export function useCamera(owner: RefObject<HTMLElement>) {
  const [camera, update] = useState<Camera>({ x: 400, y: 300, zoom: 1 }), current = useRef(camera);
  const [isAnimating, setAnimating] = useState(false);
  const animation = useRef<{ win: Window; frame: number; target: Camera }>();
  const stop = useCallback(() => { if (animation.current) animation.current.win.cancelAnimationFrame(animation.current.frame); animation.current = undefined; setAnimating(false); }, []);
  const setCamera = useCallback((next: Camera | ((previous: Camera) => Camera)) => { stop(); const value = typeof next === 'function' ? next(current.current) : next; current.current = value; update(value); }, [stop]);
  const destination = useCallback(() => animation.current?.target ?? current.current, []);
  const animate = useCallback((target: Camera) => {
    const element = owner.current, win = element?.ownerDocument.defaultView;
    if (!element || !win || win.matchMedia('(prefers-reduced-motion: reduce)').matches) { setCamera(target); return; }
    const token = win.getComputedStyle(element).getPropertyValue('--lec-motion-camera').trim(), parsed = parseFloat(token);
    const duration = Number.isFinite(parsed) ? Math.max(0, parsed * (token.endsWith('ms') ? 1 : token.endsWith('s') ? 1000 : 1)) : 160;
    if (!duration) { setCamera(target); return; }
    const initial = current.current;
    if (Math.abs(initial.x - target.x) + Math.abs(initial.y - target.y) + Math.abs(initial.zoom - target.zoom) < .001) { setCamera(target); return; }
    stop(); const started = win.performance.now(); setAnimating(true);
    const tick = (time: number) => {
      const progress = Math.min(1, (time - started) / duration), ease = 1 - (1 - progress) ** 3;
      const next = progress === 1 ? target : { x: initial.x + (target.x - initial.x) * ease, y: initial.y + (target.y - initial.y) * ease, zoom: initial.zoom + (target.zoom - initial.zoom) * ease };
      current.current = next; update(next);
      if (progress < 1 && animation.current) animation.current.frame = win.requestAnimationFrame(tick);
      else { animation.current = undefined; setAnimating(false); }
    };
    animation.current = { win, frame: win.requestAnimationFrame(tick), target };
  }, [owner, setCamera, stop]);
  useEffect(() => {
    const win = owner.current?.ownerDocument.defaultView; if (!win) return;
    const media = win.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { if (media.matches && animation.current) setCamera(animation.current.target); };
    media.addEventListener('change', change);
    return () => { media.removeEventListener('change', change); if (animation.current) animation.current.win.cancelAnimationFrame(animation.current.frame); };
  }, [owner, setCamera]);
  return { camera, current, setCamera, animate, destination, stop, isAnimating };
}
