import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { type Anchor, type CircuitDocument, type Component, type Definition, type Point, anchorKey, clone, emptyDocument, getDefinition, pinWidth, parseDocument, serializeDocument, uid, definitionSchema } from '../../core/model/document';
import { addWire, align, annotate, assertUnlocked, deleteSelection, detachComponent, disconnectNode, finishDanglingWire, fragment, commonJoinPoint, insertComponent, joinAndConnect, joinWires, lockedObjects, moveSelection, movableSelection, paste, place, reconfigure, resolveTarget, selectionMembers, splitWire, transformSelection, type Target } from '../../core/commands/operations';
import { anchorPosition, bounds, GRID, snapToSegment, snap, transform, wirePoints, SpatialIndex } from '../../core/geometry/geometry';
import { reroute, routeThroughPoints } from '../../core/geometry/router';
import { deriveNets, diagnostics } from '../../core/topology/nets';
import { DocumentSession } from '../../core/session/DocumentSession';
import { type SaveCoordinator } from '../../core/session/SaveCoordinator';
import { makeBusSplitter, makeCustomBlock, makeGate } from '../../components/definitions/library';
import { Scene, SymbolDrawing } from '../render/Scene';
import { anchorDescription, terminalDescription, componentTransform, findCrossings, objectDescription, overlapWarnings, pathData } from '../render/drawing';
import { type Camera, type Candidate, type Gesture, type Placement, type Reconnect, type Tool, type WireDraft, screenToWorld, stepZoomAt, targetExists, zoomAt } from '../input/types';
import { Dialog, DialogFrame, type DialogSpec } from './Dialog';
import { Icon, ToolButton } from './Controls';
import { DockHandle } from './DockHandle';
import { MemoryDockPreferences, type DockPreferences } from '../input/docking';
import { PartsToolbar } from './PartsToolbar';
import { FileMenu } from './FileMenu';
import { AnnotationHandles } from '../render/Annotations';
import { annotationCorners, transformAnnotationFromHandle, type AnnotationHandle } from '../../core/geometry/annotations';
import { bodyBox, placementCues } from '../input/placement-cues';
import { useCamera } from './useCamera';
import { useInteractionFeedback, useSelectionPresence } from './useInteractionFeedback';
import { MemoryShortcuts, type ShortcutPreferences } from '../input/shortcuts';
import { ShortcutsDialog } from './ShortcutsDialog';
import { FeedbackDialog } from './FeedbackDialog';

export interface EditorHost {
  export: (kind: 'svg' | 'png' | 'json' | 'snippet', document: CircuitDocument, owner: Document, scale?: number) => Promise<void>;
  newDocument?: () => Promise<void>;
  openDocument?: () => void;
  duplicate?: (document: CircuitDocument) => Promise<void>;
  insertPreview?: () => void;
  examples?: { name: string; document: CircuitDocument }[];
  defaultGrid?: boolean;
  defaultSnap?: boolean;
  shortcuts?: ShortcutPreferences;
  docking?: DockPreferences;
}
const savedSnapshot = { status: 'saved', message: 'In memory · export to keep a file', durableRevision: 0 } as const;
const subscribeNothing = () => () => {};

export function Editor({ session, host, save }: { session: DocumentSession; host: EditorHost; save?: SaveCoordinator }) {
  const [localShortcuts] = useState(() => new MemoryShortcuts()), [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const preferences = host.shortcuts ?? localShortcuts;
  const [localDocking] = useState(() => new MemoryDockPreferences());
  const docking = host.docking ?? localDocking;
  const dockPosition = useSyncExternalStore(docking.subscribe, docking.getSnapshot);
  const shortcuts = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot), doc = snapshot.document;
  const saveState = useSyncExternalStore(save?.subscribe ?? subscribeNothing, save?.getSnapshot ?? (() => savedSnapshot));
  const root = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), viewport = useRef<HTMLDivElement>(null), workspace = useRef<HTMLElement>(null);
  const fileTrigger = useRef<HTMLButtonElement>(null), moreTrigger = useRef<HTMLButtonElement>(null), dock = useRef<HTMLDivElement>(null), cornerRedo = useRef<Point[]>([]);
  const closeMenu = useCallback(() => setMenu(false), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const gridId = `lec-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const toolsLabel = useId(), editingLabel = useId(), canvasLabel = useId(), inspectorLabel = useId(), zoomLabel = useId(), documentLabel = useId();
  const [size, setSize] = useState({ width: 0, height: 0 }), [compact, setCompact] = useState(false), [dockHeight, setDockHeight] = useState(60), [dockWidth, setDockWidth] = useState(80);
  const docked = compact || dockPosition !== 'auto' && dockPosition !== 'top', dockSide = dockPosition === 'auto' ? 'top' : dockPosition;
  const { camera, current: cameraRef, setCamera, animate: animateCamera, destination: cameraDestination, stop: stopCamera, isAnimating: cameraAnimating } = useCamera(root);
  const { feedback, placed: confirmPlacement, connected: confirmConnection, snapped: confirmSnap, clear: clearFeedback } = useInteractionFeedback(root);
  const [pointing, setPointing] = useState(false), pointerKind = useRef('mouse');
  const [selection, setSelection] = useState<Set<string>>(new Set()), [tool, setTool] = useState<Tool>('select'), [placement, setPlacement] = useState<Placement | null>(null);
  const selectionPresence = useSelectionPresence(selection, root);
  const [wireDraft, setDraft] = useState<WireDraft | null>(null), [pointer, setPointer] = useState<Point>({ x: 0, y: 0 }), [gesture, setGesture] = useState<Gesture>({ kind: 'idle' });
  const moveFrame = useRef<number | undefined>(undefined), latestMove = useRef<ReactPointerEvent<SVGSVGElement> | null>(null);
  const lastTap = useRef<{ id: string; point: Point; time: number }>();
  const gestureRef = useRef<Gesture>({ kind: 'idle' }), pointers = useRef(new Map<number, Point>()), suppressClick = useRef(false);
  const [reconnect, setReconnect] = useState<Reconnect | null>(null), [grid, setGrid] = useState(host.defaultGrid ?? true), [snapping, setSnapping] = useState(host.defaultSnap ?? true);
  const [horizontalFirst, setHorizontalFirst] = useState(true), [freeAngle, setFreeAngle] = useState(false), [repeat, setRepeat] = useState(false), [multi, setMulti] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false), [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspector, setInspector] = useState<'properties' | 'objects' | 'nets' | 'checks'>('properties'), [dialog, setDialog] = useState<DialogSpec | null>(null), [menu, setMenu] = useState(false), [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState(''), [clipboard, setClipboard] = useState(''), [candidates, setCandidates] = useState<Candidate[]>([]), [candidateAction, setCandidateAction] = useState<'wire' | 'select'>('wire');
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const candidateAdditive = useRef(false);
  const displaySelection = useMemo(() => new Set([...selection, ...doc.groups.filter(group => selection.has(group.id)).flatMap(group => group.members)]), [doc.groups, selection]);
  const draft = wireDraft && targetExists(doc, wireDraft.start) ? wireDraft : null;
  const lockedIds = useMemo(() => lockedObjects(doc), [doc]);
  const availableCandidates = useMemo(() => candidates.filter(candidate => targetExists(doc, candidate.target)), [candidates, doc]);
  const candidateJoin = useMemo(() => {
    const wires = availableCandidates.filter(candidate => candidate.target.kind === 'wire');
    if (candidateAction !== 'wire' || wires.length < 2 || wires.some(candidate => lockedIds.has(candidate.objectId))) return undefined;
    const ids = wires.map(candidate => (candidate.target as Extract<Target, { kind: 'wire' }>).wireId);
    if (new Set(ids.map(id => doc.wires.find(wire => wire.id === id)?.width)).size !== 1) return undefined;
    return commonJoinPoint(doc, ids, pointer, 23 / camera.zoom);
  }, [availableCandidates, candidateAction, doc, lockedIds, pointer, camera.zoom]);
  const setActiveGesture = (g: Gesture) => { gestureRef.current = g; setGesture(g); };
  const notify = (error: unknown) => setNotice(error instanceof Error ? error.message : String(error));
  const edit = (name: string, fn: (d: CircuitDocument) => void, coalesceKey?: string) => { try { session.edit(name, fn, coalesceKey); setNotice(''); return true; } catch (e) { notify(e); return false; } };
  const cancel = useCallback(() => { lastTap.current = undefined; stopCamera(); clearFeedback(); setPointing(false); if (moveFrame.current !== undefined) { svg.current?.ownerDocument.defaultView?.cancelAnimationFrame(moveFrame.current); moveFrame.current = undefined; } latestMove.current = null; cornerRedo.current = []; setDraft(null); setPlacement(null); setReconnect(null); setTool('select'); gestureRef.current = { kind: 'idle' }; setGesture({ kind: 'idle' }); pointers.current.clear(); setCandidates([]); }, [stopCamera, clearFeedback]);
  const fit = useCallback((ids?: Set<string>, animated = true) => {
    const measured = viewport.current?.getBoundingClientRect(), width = measured?.width ?? size.width, height = measured?.height ?? size.height;
    if (!width || !height) return;
    const current = session.getSnapshot().document;
    let target: Camera;
    if (!current.components.length && !current.wires.length && !current.annotations.length) target = { x: width / 2, y: height / 2, zoom: 1 };
    else {
      const b = bounds(current, ids), element = viewport.current;
      const zoomBox = element?.querySelector('.lec-zoom-controls')?.getBoundingClientRect(), toolbar = dock.current?.getBoundingClientRect();
      const ownerBottom = root.current?.getBoundingClientRect().bottom ?? 0;
      const inset = element ? Number.parseFloat(element.ownerDocument.defaultView?.getComputedStyle(element).scrollPaddingBottom ?? '') || 0 : 0;
      const occluded = Math.max(0, inset - (ownerBottom - (measured?.bottom ?? 0)));
      let left = width < 700 ? 24 : 50, right = left, top = 50, bottom = Math.max(50, occluded + 16);
      if (zoomBox && measured) {
        if (zoomBox.top < measured.top + height / 2) top = Math.max(top, zoomBox.bottom - measured.top + 16);
        else bottom = Math.max(bottom, measured.bottom - zoomBox.top + 16);
      }
      if (docked && toolbar && measured) {
        if (dockSide === 'left') left = Math.max(left, toolbar.right - measured.left + 16);
        if (dockSide === 'right') right = Math.max(right, measured.right - toolbar.left + 16);
        if (dockSide === 'top') top = Math.max(top, toolbar.bottom - measured.top + 16);
        if (dockSide === 'bottom') bottom = Math.max(bottom, measured.bottom - toolbar.top + 16);
      }
      const zoom = Math.max(0.125, Math.min(1.5, Math.max(1, width - left - right) / b.width, Math.max(1, height - top - bottom) / b.height));
      target = { zoom, x: (left + width - right) / 2 - (b.x + b.width / 2) * zoom, y: (top + height - bottom) / 2 - (b.y + b.height / 2) * zoom };
    }
    if (animated) animateCamera(target); else setCamera(target);
  }, [session, size, animateCamera, setCamera, docked, dockSide]);
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return; const win = element.ownerDocument.defaultView; if (!win) return;
    if (workspace.current) setCompact(workspace.current.getBoundingClientRect().width <= 900);
    const observer = new win.ResizeObserver(entries => {
      for (const entry of entries) {
        const r = entry.contentRect;
        if (entry.target === element && r.width && r.height) setSize({ width: r.width, height: r.height });
        if (entry.target === workspace.current && r.width) setCompact(r.width <= 900);
        if (entry.target === dock.current) { const bounds = entry.target.getBoundingClientRect(); setDockHeight(bounds.height); if (['left', 'right'].includes(workspace.current?.dataset.dock ?? '')) setDockWidth(bounds.width); }
      }
    });
    observer.observe(element); if (workspace.current) observer.observe(workspace.current); if (dock.current) observer.observe(dock.current);
    const onHide = () => { cancel(); void save?.flush(); };
    element.ownerDocument.addEventListener('visibilitychange', onHide); win.addEventListener('pagehide', onHide); win.addEventListener('orientationchange', cancel);
    return () => { if (moveFrame.current !== undefined) win.cancelAnimationFrame(moveFrame.current); observer.disconnect(); element.ownerDocument.removeEventListener('visibilitychange', onHide); win.removeEventListener('pagehide', onHide); win.removeEventListener('orientationchange', cancel); };
  }, [cancel, save]);
  useEffect(() => {
    const element = svg.current; if (!element) return;
    // Host touch recognizers and WebKit page gestures must not compete with canvas navigation.
    const consume = (event: Event) => { event.stopPropagation(); if (event.cancelable) event.preventDefault(); };
    const wheel = (event: WheelEvent) => {
      lastTap.current = undefined; consume(event); const rect = element.getBoundingClientRect(), screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.ctrlKey || event.metaKey || !event.shiftKey) setCamera(c => zoomAt(c, screen, Math.exp(-event.deltaY * 0.0015)));
      else setCamera(c => ({ ...c, x: c.x - event.deltaY, y: c.y - event.deltaX }));
    };
    const events = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'gesturestart', 'gesturechange', 'gestureend'];
    for (const name of events) element.addEventListener(name, consume, { passive: false });
    // React delegates wheel events passively, so cancellation needs a native listener.
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { for (const name of events) element.removeEventListener(name, consume); element.removeEventListener('wheel', wheel); };
  }, [setCamera]);
  const initialized = useRef(false);
  useEffect(() => { if (!initialized.current && size.width > 0 && size.height > 0) { initialized.current = true; fit(undefined, false); } }, [fit, size]);
  useEffect(() => { lastTap.current = undefined; setSelection(previous => new Set([...previous].filter(id => [...doc.components, ...doc.nodes, ...doc.wires, ...doc.annotations, ...doc.groups].some(x => x.id === id)))); }, [doc]);
  useEffect(() => { if (wireDraft && !draft) { cancel(); setNotice('Wire drawing canceled because its starting connection changed.'); } }, [wireDraft, draft, cancel]);
  useEffect(() => {
    if (availableCandidates.length === candidates.length) return;
    setCandidates(availableCandidates);
    if (!availableCandidates.length && (!wireDraft || draft)) setNotice('Connection targets changed. Choose a new point on the canvas.');
  }, [availableCandidates, candidates.length, wireDraft, draft]);
  useEffect(() => { if (/^(Undo |Redo |Reloaded|Import circuit|New circuit|Clear circuit|Open example)/.test(snapshot.lastAction)) clearFeedback(); if (/^(Undo |Redo |Reloaded)/.test(snapshot.lastAction)) stopCamera(); }, [snapshot.revision, snapshot.lastAction, clearFeedback, stopCamera]);
  const crossings = useMemo(() => findCrossings(doc), [doc]);
  const nets = useMemo(() => deriveNets(doc), [doc]);
  const checks = useMemo(() => [...diagnostics(doc), ...overlapWarnings(doc).map((d, i) => ({ ...d, id: `overlap-${i}`, severity: 'warning' as const }))], [doc]);
  const pinIndex = useMemo(() => { const index = new SpatialIndex<Candidate>(); for (const c of doc.components) for (const p of getDefinition(doc, c).pins) { const point = transform(p, c); index.insert(point, { label: `${c.reference} · ${p.name}${p.width > 1 ? ` · ${p.width} bits` : ''}`, target: { kind: 'pin', componentId: c.id, pinId: p.id }, point, objectId: c.id }); } for (const n of doc.nodes) index.insert(n.position, { label: anchorDescription(doc, { kind: 'node', nodeId: n.id }), target: { kind: 'node', nodeId: n.id }, point: n.position, objectId: n.id }); return index; }, [doc]);
  function hitCandidates(world: Point, pointerType = 'mouse'): Candidate[] {
    const radius = (pointerType === 'mouse' ? 10 : 23) / camera.zoom;
    const hits = pinIndex.near(world, radius).filter(c => Math.hypot(c.point.x - world.x, c.point.y - world.y) <= radius);
    for (const w of doc.wires) {
      const pts = wirePoints(doc, w); let nearest = { distance: Infinity, point: world };
      for (let i = 1; i < pts.length; i++) { const h = snapToSegment(world, pts[i - 1], pts[i], snapping); if (h.distance < nearest.distance) nearest = h; }
      if (nearest.distance <= radius && !hits.some(h => h.target.kind !== 'wire' && [w.a, w.b].some(a => anchorKey(a) === anchorKey(h.target as Anchor)))) hits.push({ label: objectDescription(doc, w.id), target: { kind: 'wire', wireId: w.id, point: nearest.point }, point: nearest.point, objectId: w.id });
    }
    return hits.sort((a, b) => Number(a.target.kind === 'wire') - Number(b.target.kind === 'wire') || Math.hypot(a.point.x - world.x, a.point.y - world.y) - Math.hypot(b.point.x - world.x, b.point.y - world.y));
  }
  const previewDoc = useMemo(() => {
    if (gesture.kind === 'annotation' && !lockedIds.has(gesture.id)) return { ...doc, annotations: doc.annotations.map(a => a.id === gesture.id ? gesture.preview : a) };
    if (gesture.kind === 'move') { const ids = movableSelection(doc, gesture.ids), locked = lockedObjects(doc), delta = gesture.delta; const shift = (p: Point) => ({ x: p.x + delta.x, y: p.y + delta.y }); return { ...doc, components: doc.components.map(c => ids.has(c.id) ? { ...c, position: shift(c.position) } : c), nodes: doc.nodes.map(n => ids.has(n.id) ? { ...n, position: shift(n.position) } : n), wires: doc.wires.map(w => !locked.has(w.id) && (ids.has(w.id) || [w.a, w.b].every(a => ids.has(a.kind === 'pin' ? a.componentId : a.nodeId))) ? { ...w, route: { ...w.route, vertices: w.route.vertices.map(p => ({ ...p, ...shift(p) })) } } : w), annotations: doc.annotations.map(a => !locked.has(a.id) && (ids.has(a.id) || a.anchor && ids.has(a.anchor.kind === 'pin' ? a.anchor.componentId : a.anchor.nodeId)) ? { ...a, position: shift(a.position) } : a) }; }
    if (gesture.kind === 'bend' && !lockedIds.has(gesture.wireId)) { const preview = { ...doc, wires: doc.wires.map(w => w.id === gesture.wireId ? { ...w, route: { ...w.route, vertices: w.route.vertices.map(p => ({ ...p })) } } : w) }, w = preview.wires.find(w => w.id === gesture.wireId); if (w?.route.vertices[gesture.index]) w.route.vertices[gesture.index] = { ...w.route.vertices[gesture.index], ...gesture.point }; return preview; }
    if (gesture.kind === 'segment' && !lockedIds.has(gesture.wireId)) { const preview = { ...doc, wires: doc.wires.map(w => w.id === gesture.wireId ? { ...w, route: { ...w.route, vertices: w.route.vertices.map(p => ({ ...p })) } } : w) }; changeSegment(preview, gesture.wireId, gesture.index, gesture.origin, gesture.point); return preview; }
    return doc;
  }, [doc, gesture]);
  function changeSegment(d: CircuitDocument, id: string, index: number, origin: Point, point: Point) {
    const w = d.wires.find(w => w.id === id); if (!w) return; assertUnlocked(d, w.id); const pts = wirePoints(d, w), a = pts[index], b = pts[index + 1]; if (!a || !b) return;
    const dx = b.x === a.x ? point.x - origin.x : 0, dy = b.y === a.y ? point.y - origin.y : 0;
    const shifted = pts.map((p, i) => i === index || i === index + 1 ? { x: p.x + dx, y: p.y + dy } : p);
    shifted.unshift(pts[0]); shifted.push(pts[pts.length - 1]); w.route.mode = 'manual'; w.route.vertices = shifted.slice(1, -1).map(p => ({ ...p, id: uid('bend'), locked: true }));
  }
  function startPart(definition: Definition) { cancel(); setPlacement({ definition, rotation: 0 }); setTool('place'); setPaletteOpen(false); root.current?.focus(); }
  function startWire() { setTool('wire'); setPlacement(null); setReconnect(null); root.current?.focus(); }
  function wireFeedback(id: string | undefined, target?: Anchor) {
    const current = session.getSnapshot().document, wire = current.wires.find(w => w.id === id);
    if (wire) confirmConnection(wire.id, [anchorPosition(current, wire.a), anchorPosition(current, wire.b)]);
    else if (target) confirmConnection(undefined, [anchorPosition(current, target)]);
  }
  function wireTo(target: Target) {
    if (reconnect) { const committed = edit('Reconnect endpoint', d => { const w = d.wires.find(w => w.id === reconnect.wireId); if (!w) throw new Error('Wire no longer exists'); assertUnlocked(d, w.id); w[reconnect.end] = resolveTarget(d, target); }); if (committed) { wireFeedback(reconnect.wireId); setReconnect(null); setTool('select'); } return; }
    if (!draft) { cornerRedo.current = []; setDraft({ start: target, bends: [] }); confirmConnection(undefined, [target.kind === 'free' || target.kind === 'wire' ? target.point : anchorPosition(doc, target)]); return; }
    let id = ''; const committed = edit('Draw wire', d => { id = addWire(d, draft.start, target, draft.bends, { horizontalFirst, geometry: freeAngle ? 'free' : 'orthogonal' }); });
    if (id && committed) { setSelection(new Set([id])); cornerRedo.current = []; setDraft(null); wireFeedback(id); }
  }
  function finishWire() {
    if (!draft) return;
    let id = '';
    const committed = edit('Finish wire', d => { id = finishDanglingWire(d, draft.start, draft.bends, { horizontalFirst, geometry: freeAngle ? 'free' : 'orthogonal' }); });
    if (committed) { finishPointers(); cornerRedo.current = []; setDraft(null); setTool('select'); setSelection(new Set([id])); wireFeedback(id); }
  }
  function consumeControlPointer(e: ReactPointerEvent<HTMLElement>) {
    e.stopPropagation();
    if (pointers.current.has(e.pointerId)) { pointers.current.delete(e.pointerId); if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId); }
  }
  function undoCorner() {
    if (!draft?.bends.length) return;
    cornerRedo.current.push(draft.bends[draft.bends.length - 1]); setDraft({ ...draft, bends: draft.bends.slice(0, -1) });
  }
  function redoCorner() {
    if (!draft) return; const point = cornerRedo.current.pop(); if (point) setDraft({ ...draft, bends: [...draft.bends, point] });
  }
  function choose(candidate: Candidate) {
    if (!targetExists(session.getSnapshot().document, candidate.target)) { setNotice('This connection target changed. Choose another target.'); return; }
    setCandidates([]); if (candidateAction === 'select') selectObject(candidate.objectId, candidateAdditive.current); else wireTo(candidate.target);
  }
  function joinCandidates() {
    if (!candidateJoin) return;
    const ids = availableCandidates.filter(candidate => candidate.target.kind === 'wire').map(candidate => (candidate.target as Extract<Target, { kind: 'wire' }>).wireId);
    let result: ReturnType<typeof joinAndConnect> | undefined;
    const committed = edit('Join wires and connect', d => { result = joinAndConnect(d, ids, candidateJoin, { start: draft?.start, bends: draft?.bends, reconnect: reconnect ?? undefined, horizontalFirst, geometry: freeAngle ? 'free' : 'orthogonal' }); });
    if (!committed || !result) return;
    setCandidates([]); cornerRedo.current = []; wireFeedback(result.wireId, result.target);
    if (reconnect || draft) {
      setDraft(null); setReconnect(null);
      if (reconnect) setTool('select');
      const target = result.target;
      setSelection(new Set(result.wireId ? [result.wireId] : session.getSnapshot().document.wires.filter(wire => [wire.a, wire.b].some(anchor => anchorKey(anchor) === anchorKey(target))).map(wire => wire.id)));
    } else { setDraft({ start: result.target, bends: [] }); setTool('wire'); }
  }
  function selectObject(id: string, additive = false) { setSelection(previous => { const next = additive || multi ? new Set(previous) : new Set<string>(); if (next.has(id)) next.delete(id); else next.add(id); return next; }); setInspector('properties'); }
  function pointFromEvent(e: { clientX: number; clientY: number }) { const r = svg.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function startPinch() {
    lastTap.current = undefined;
    const [a, b] = [...pointers.current.values()], current = cameraRef.current;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    setActiveGesture({ kind: 'pinch', startDistance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), world: screenToWorld(mid, current), camera: current });
    suppressClick.current = true;
  }
  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    e.stopPropagation(); if (e.button > 1) return; stopCamera(); flushPointerMove(); pointerKind.current = e.pointerType; setPointing(true);
    const screen = pointFromEvent(e), current = cameraRef.current, world = screenToWorld(screen, current); setPointer(world); pointers.current.set(e.pointerId, screen);
    svg.current?.setPointerCapture(e.pointerId); root.current?.focus();
    if (pointers.current.size === 2) {
      startPinch(); return;
    }
    if (pointers.current.size > 1) return;
    if (e.button === 1) { e.preventDefault(); suppressClick.current = true; setActiveGesture({ kind: 'pan', origin: screen, camera: current }); return; }
    const element = e.target as Element;
    const handle = element.closest('[data-annotation-handle]');
    if (handle) { const a = doc.annotations.find(a => a.id === handle.getAttribute('data-annotation')); if (a && !lockedIds.has(a.id)) { setActiveGesture({ kind: 'annotation', id: a.id, handle: handle.getAttribute('data-annotation-handle') as AnnotationHandle, origin: world, before: clone(a), preview: clone(a) }); return; } }
    const bendIndex = element.getAttribute('data-bend'), segmentIndex = element.getAttribute('data-segment'), wireId = element.getAttribute('data-wire');
    if (wireId && !lockedIds.has(wireId) && bendIndex !== null) { setActiveGesture({ kind: 'bend', wireId, index: Number(bendIndex), origin: world, point: world }); return; }
    if (wireId && !lockedIds.has(wireId) && segmentIndex !== null) { setActiveGesture({ kind: 'segment', wireId, index: Number(segmentIndex), origin: snap(world, snapping), point: snap(world, snapping) }); return; }
    if (tool === 'box') { setActiveGesture({ kind: 'box', origin: world, end: world }); return; }
    const id = element.closest('[data-object]')?.getAttribute('data-object');
    if (tool === 'select' && id && !lockedIds.has(id) && [...doc.components, ...doc.nodes, ...doc.annotations].some(c => c.id === id) && (multi || e.shiftKey || !element.hasAttribute('data-pin')) && e.button === 0) {
      const ids = displaySelection.has(id) ? new Set(selection) : new Set(multi || e.shiftKey ? [...selection, id] : [id]);
      setActiveGesture({ kind: 'move', focusId: id, origin: snap(world, snapping), delta: { x: 0, y: 0 }, ids }); return;
    }
    if (e.pointerType === 'touch' || (tool === 'select' || tool === 'pan') && !id) { setActiveGesture({ kind: 'pan', origin: screen, camera: current }); return; }
    setActiveGesture({ kind: 'idle' });
  }
  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const screen = pointFromEvent(e), world = screenToWorld(screen, cameraRef.current); setPointer(world); pointerKind.current = e.pointerType; const inside = screen.x >= 0 && screen.x <= size.width && screen.y >= 0 && screen.y <= size.height; setPointing(inside);
    if (inside && tool === 'place' && snapping && gestureRef.current.kind !== 'pan' && gestureRef.current.kind !== 'pinch') confirmSnap(snap(world, true));
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, screen);
    const g = gestureRef.current;
    if (g.kind === 'pinch') { const pts = [...pointers.current.values()]; if (pts.length < 2) return; const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }; const z = Math.max(0.125, Math.min(4, g.camera.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.startDistance)); setCamera({ zoom: z, x: mid.x - g.world.x * z, y: mid.y - g.world.y * z }); return; }
    if (pointers.current.size > 1) return;
    if (g.kind === 'annotation') { setActiveGesture({ ...g, preview: transformAnnotationFromHandle(g.before, g.handle, g.origin, world, e.shiftKey) }); if (Math.hypot(world.x - g.origin.x, world.y - g.origin.y) > 1) suppressClick.current = true; }
    if (g.kind === 'move') { const next = snap(world, snapping); const delta = { x: next.x - g.origin.x, y: next.y - g.origin.y }; setActiveGesture({ ...g, delta }); if (snapping && (delta.x !== g.delta.x || delta.y !== g.delta.y)) confirmSnap(next); if (Math.abs(delta.x) + Math.abs(delta.y) > 2) { setSelection(new Set(g.ids)); suppressClick.current = true; } }
    if (g.kind === 'pan') { const next = { ...g.camera, x: g.camera.x + screen.x - g.origin.x, y: g.camera.y + screen.y - g.origin.y }; setCamera(next); setPointer(screenToWorld(screen, next)); if (Math.hypot(screen.x - g.origin.x, screen.y - g.origin.y) > 4) suppressClick.current = true; return; }
    if (g.kind === 'box') { setActiveGesture({ ...g, end: world }); suppressClick.current = true; }
    if (g.kind === 'bend' || g.kind === 'segment') { setActiveGesture({ ...g, point: snap(world, snapping) }); suppressClick.current = true; }
    if (draft && pointers.current.size === 0) { const edge = 32, speed = 6; if (screen.x < edge || screen.x > size.width - edge || screen.y < edge || screen.y > size.height - edge) setCamera(c => ({ ...c, x: c.x + (screen.x < edge ? speed : screen.x > size.width - edge ? -speed : 0), y: c.y + (screen.y < edge ? speed : screen.y > size.height - edge ? -speed : 0) })); }
  }
  function flushPointerMove() {
    if (moveFrame.current !== undefined) { svg.current?.ownerDocument.defaultView?.cancelAnimationFrame(moveFrame.current); moveFrame.current = undefined; }
    const pending = latestMove.current; latestMove.current = null; if (pending) onPointerMove(pending);
  }
  function queuePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    e.stopPropagation();
    // Keep every finger's latest sample even when rendering only once per frame.
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, pointFromEvent(e));
    latestMove.current = e; if (moveFrame.current !== undefined) return;
    const win = svg.current?.ownerDocument.defaultView; if (!win) return;
    moveFrame.current = win.requestAnimationFrame(flushPointerMove);
  }
  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    e.stopPropagation();
    if (!pointers.current.has(e.pointerId)) return;
    const hit = svg.current?.ownerDocument.elementFromPoint(e.clientX, e.clientY);
    if (hit && svg.current && hit !== svg.current && !svg.current.contains(hit)) { finishPointers(); return; }
    flushPointerMove();
    onPointerMove(e);
    const g = gestureRef.current; pointers.current.delete(e.pointerId);
    if (g.kind === 'pinch') {
      if (pointers.current.size >= 2) startPinch();
      else if (pointers.current.size === 1) setActiveGesture({ kind: 'pan', origin: [...pointers.current.values()][0], camera: cameraRef.current });
      else setActiveGesture({ kind: 'idle' });
      return;
    }
    if (suppressClick.current) {
      lastTap.current = undefined;
      if (g.kind === 'annotation') edit(g.handle === 'rotate' ? 'Rotate annotation' : 'Resize annotation', d => { assertUnlocked(d, g.id); Object.assign(d.annotations.find(a => a.id === g.id)!, g.preview); });
      if (g.kind === 'move') edit('Move selection', d => moveSelection(d, g.ids, g.delta));
      if (g.kind === 'box') { const left = Math.min(g.origin.x, g.end.x), right = Math.max(g.origin.x, g.end.x), top = Math.min(g.origin.y, g.end.y), bottom = Math.max(g.origin.y, g.end.y); const ids = new Set(multi ? selection : []); doc.components.filter(c => c.position.x >= left && c.position.x <= right && c.position.y >= top && c.position.y <= bottom).forEach(c => ids.add(c.id)); doc.nodes.filter(n => n.position.x >= left && n.position.x <= right && n.position.y >= top && n.position.y <= bottom).forEach(n => ids.add(n.id)); doc.wires.filter(w => wirePoints(doc, w).every(p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom)).forEach(w => ids.add(w.id)); doc.annotations.filter(a => annotationCorners(a).every(p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom)).forEach(a => ids.add(a.id)); setSelection(ids); setTool('select'); }
      if (g.kind === 'bend') edit('Move bend', d => { const w = d.wires.find(w => w.id === g.wireId); if (w) { assertUnlocked(d, w.id); w.route.vertices[g.index] = { ...w.route.vertices[g.index], ...g.point }; w.route.mode = 'manual'; } });
      if (g.kind === 'segment') edit('Move wire segment', d => changeSegment(d, g.wireId, g.index, g.origin, g.point));
      setActiveGesture({ kind: 'idle' }); return;
    }
    if (g.kind === 'annotation' || g.kind === 'bend' || g.kind === 'segment') { setActiveGesture({ kind: 'idle' }); return; }
    setActiveGesture({ kind: 'idle' }); const screen = pointFromEvent(e), world = screenToWorld(screen, cameraRef.current), element = svg.current!.ownerDocument.elementFromPoint(e.clientX, e.clientY) ?? e.target as Element;
    if (tool === 'place' && placement) { let id = ''; const committed = edit('Place part', d => { id = place(d, placement.definition, snap(world, snapping), placement.rotation).id; }); if (id && committed) { setSelection(new Set([id])); if (!repeat) cancel(); else setPointing(false); confirmPlacement(id); } return; }
    if (tool === 'move') { const cs = doc.components.filter(c => selection.has(c.id)); if (cs.length) edit('Move to point', d => moveSelection(d, selection, { x: snap(world, snapping).x - cs[0].position.x, y: snap(world, snapping).y - cs[0].position.y })); setTool('select'); return; }
    const hits = hitCandidates(world, e.pointerType);
    const targetId = element.closest('[data-object]')?.getAttribute('data-object');
    if (e.pointerType === 'touch') {
      const previous = lastTap.current; lastTap.current = undefined;
      const nearby = [...new Set(hits.map(hit => hit.objectId))], tapId = targetId ?? (nearby.length === 1 ? nearby[0] : undefined);
      if (tool === 'select' && !draft && !reconnect && tapId && !element.closest('[data-pin],[data-annotation-handle]')) {
        if (previous?.id === tapId && e.timeStamp - previous.time < 350 && Math.hypot(screen.x - previous.point.x, screen.y - previous.point.y) <= 20) { inspectObject(tapId, true); return; }
        lastTap.current = { id: tapId, point: screen, time: e.timeStamp };
      }
    }
    if (tool === 'wire' || tool === 'reconnect' || element.hasAttribute('data-pin') && !multi && !e.shiftKey) {
      if (hits.length > 1) { setCandidateAction('wire'); setCandidates(hits); return; }
      if (hits[0]) { wireTo(hits[0].target); if (tool === 'select') setTool('wire'); return; }
      if (draft) { const point = snap(world, snapping); cornerRedo.current = []; setDraft({ ...draft, bends: [...draft.bends, point] }); if (snapping) confirmSnap(point); else confirmConnection(undefined, [point]); } else wireTo({ kind: 'free', point: snap(world, snapping) }); return;
    }
    if (targetId) { if (doc.wires.some(w => w.id === targetId) && hits.filter(h => h.target.kind === 'wire').length > 1) { candidateAdditive.current = e.shiftKey; setCandidateAction('select'); setCandidates(hits); } else selectObject(targetId, e.shiftKey); }
    else if (hits.length) {
      const nearby = [...new Map(hits.map(candidate => [candidate.objectId, candidate])).values()];
      if (nearby.length > 1) { candidateAdditive.current = e.shiftKey; setCandidateAction('select'); setCandidates(nearby); }
      else selectObject(nearby[0].objectId, e.shiftKey);
    }
    else if (!multi) setSelection(new Set());
  }
  function finishPointers() { lastTap.current = undefined; if (moveFrame.current !== undefined) { svg.current?.ownerDocument.defaultView?.cancelAnimationFrame(moveFrame.current); moveFrame.current = undefined; } latestMove.current = null; pointers.current.clear(); setActiveGesture({ kind: 'idle' }); suppressClick.current = false; }
  function closeInspector() { setInspectorOpen(false); root.current?.focus({ preventScroll: true }); }
  function closeShortcuts() { setShortcutsOpen(false); root.current?.focus({ preventScroll: true }); }
  function objectAt(clientX: number, clientY: number) {
    const element = svg.current?.ownerDocument.elementFromPoint(clientX, clientY);
    if (!element || !svg.current?.contains(element)) return null;
    const direct = element.closest('[data-object]')?.getAttribute('data-object'); if (direct) return direct;
    const hits = [...new Set(hitCandidates(screenToWorld(pointFromEvent({ clientX, clientY }), cameraRef.current), pointerKind.current).map(hit => hit.objectId))];
    return hits.length === 1 ? hits[0] : null;
  }
  function inspectObject(id: string, editText = false) {
    const current = session.getSnapshot().document;
    if (![...current.components, ...current.wires, ...current.nodes, ...current.annotations, ...current.groups].some(object => object.id === id)) return;
    finishPointers(); setSelection(new Set([id])); setInspector('properties');
    const annotation = current.annotations.find(item => item.id === id);
    if (editText && annotation && !lockedObjects(current).has(id)) {
      setDialog({ title: 'Edit text', fields: [{ name: 'text', label: 'Text', value: annotation.text }], onSubmit: values => session.edit('Edit annotation text', document => { assertUnlocked(document, id); const item = document.annotations.find(item => item.id === id); if (!item) throw new Error('Annotation no longer exists'); item.text = values.text; }) });
    } else setInspectorOpen(true);
  }
  function doTransform(kind: 'rotate' | 'mirrorX' | 'mirrorY') { if (placement && kind === 'rotate') setPlacement({ ...placement, rotation: ((placement.rotation + 90) % 360) as Component['rotation'] }); else edit(kind === 'rotate' ? 'Rotate selection' : 'Mirror selection', d => transformSelection(d, selection, kind)); }
  async function copy(cut = false) {
    if (!selection.size) return;
    try {
      let raw = '';
      if (cut) {
        const succeeded = edit('Cut selection', d => {
          const contents = new Set([...selection, ...d.groups.filter(group => selection.has(group.id)).flatMap(group => group.members)]);
          assertUnlocked(d, ...contents);
          raw = serializeDocument(fragment(d, selection));
          deleteSelection(d, selectionMembers(d, selection));
        });
        if (!succeeded) return;
      } else raw = serializeDocument(fragment(session.getSnapshot().document, selection));
      setClipboard(raw);
      const nav = root.current?.ownerDocument.defaultView?.navigator;
      try { await nav?.clipboard?.writeText(raw); }
      catch { setNotice('Copied in the editor. Use “Copy as text” if the system clipboard is unavailable.'); }
    } catch (e) { notify(e); }
  }
  function showPaste() { setDialog({ title: 'Paste circuit fragment', description: 'Internal connections and symbols are preserved. External wires become dangling ends. Ordinary signal labels are isolated from the original.', fields: [{ name: 'content', label: 'Circuit JSON', type: 'textarea', value: clipboard, required: true }, { name: 'isolate', label: 'Signal labels', type: 'select', value: 'yes', options: [{ value: 'yes', label: 'Isolate copied signal names' }, { value: 'no', label: 'Keep names connected to existing nets' }] }], submit: 'Paste', onSubmit: v => { const f = parseDocument(v.content); let ids: string[] = []; session.edit('Paste fragment', d => { ids = paste(d, f, { x: 32, y: 32 }, v.isolate === 'yes'); }); setSelection(new Set(ids)); } }); }
  function duplicate() { let ids: string[] = []; edit('Duplicate selection', d => { ids = paste(d, fragment(doc, selection)); }); setSelection(new Set(ids)); }
  function group() { edit('Group selection', d => { const members = [...selectionMembers(d, selection)].filter(id => !d.groups.some(g => g.id === id)); const id = uid('g'); if (!members.length) throw new Error('Select objects to group'); d.groups.push({ id, name: 'Circuit group', members, locked: false }); setSelection(new Set([id, ...members])); }); }
  function toggleLock() { edit('Lock / unlock selection', d => { const protectedGroups = d.groups.filter(g => g.locked && g.members.some(id => selection.has(id))); const objects = [...d.components, ...d.wires, ...d.annotations, ...d.groups].filter(x => selection.has(x.id) || protectedGroups.some(g => g.id === x.id)); const unlock = objects.some(x => x.locked); objects.forEach(x => { x.locked = !unlock; }); }); }
  function connectionDialog() {
    const options = doc.components.flatMap(c => getDefinition(doc, c).pins.map(p => ({ value: JSON.stringify({ kind: 'pin', componentId: c.id, pinId: p.id }), label: `${c.reference} · ${p.name} (${p.width} bit${p.width > 1 ? 's' : ''})` })));
    if (options.length < 2) { setNotice('Place components before connecting their pins.'); return; }
    setDialog({ title: 'Connect pins', fields: [{ name: 'from', label: 'From pin', type: 'select', options }, { name: 'to', label: 'To pin', type: 'select', options, value: options[1].value }], submit: 'Connect', onSubmit: v => session.edit('Connect pins', d => { addWire(d, JSON.parse(v.from) as Anchor, JSON.parse(v.to) as Anchor); }) });
  }
  function annotationDialog(kind: 'text' | 'label' | 'no-connect' | 'box' | 'arrow' | 'polarity' | 'current') {
    const c = doc.components.find(c => selection.has(c.id)), n = doc.nodes.find(n => selection.has(n.id)), w = doc.wires.find(w => selection.has(w.id));
    const options = c ? getDefinition(doc, c).pins.map(p => ({ value: JSON.stringify({ kind: 'pin', componentId: c.id, pinId: p.id }), label: `${c.reference} · ${p.name}` })) : [];
    if (n) options.push({ value: JSON.stringify({ kind: 'node', nodeId: n.id }), label: 'Selected junction' });
    if (w) options.push({ value: JSON.stringify(w.a), label: 'Wire start' }, { value: JSON.stringify(w.b), label: 'Wire end' });
    if (['label', 'no-connect'].includes(kind) && !options.length) { setNotice('Select a part, wire or junction before adding a net label or no-connect marker.'); return; }
    setDialog({ title: kind === 'label' ? 'Name this net' : `Add ${kind}`, fields: [...(kind !== 'no-connect' ? [{ name: 'text', label: kind === 'label' ? 'Net name (case sensitive)' : 'Text', value: kind === 'polarity' ? '+ / −' : '', required: kind === 'label' }] : []), ...(options.length && ['label', 'no-connect'].includes(kind) ? [{ name: 'anchor', label: 'Attach to', type: 'select' as const, options }] : []), ...(kind === 'label' ? [{ name: 'scope', label: 'Copy behavior', type: 'select' as const, options: [{ value: 'signal', label: 'Ordinary signal (isolated on copy)' }, { value: 'global', label: 'Document-wide power / reference (keep name on copy)' }] }] : [])], onSubmit: v => { let id = ''; session.edit(`Add ${kind}`, d => { const a = v.anchor ? JSON.parse(v.anchor) as Anchor : undefined; const position = a ? anchorPosition(d, a) : snap(screenToWorld({ x: size.width / 2, y: size.height / 2 }, camera)); id = annotate(d, kind, v.text ?? '', kind === 'no-connect' ? position : { x: position.x + (a ? 16 : 0), y: position.y - (a ? 16 : 0) }, a, v.scope === 'global'); }); cancel(); setSelection(new Set([id])); } });
  }
  function joinSelected() {
    const ws = doc.wires.filter(w => selection.has(w.id)); if (ws.length < 2) { setNotice('Select two crossing wires using Multi-select or the object list.'); return; }
    const crossing = commonJoinPoint(doc, ws.map(wire => wire.id), pointer);
    if (!crossing) { setNotice('Choose wires that share a common point.'); return; }
    setDialog({ title: 'Join selected wires', description: 'Create one explicit junction at this crossing.', fields: [{ name: 'x', label: 'X', type: 'number', value: String(crossing.x) }, { name: 'y', label: 'Y', type: 'number', value: String(crossing.y) }], submit: 'Join', onSubmit: v => session.edit('Join crossing', d => joinWires(d, ws.map(w => w.id), { x: Number(v.x), y: Number(v.y) })) });
  }
  function disconnectDialog(nodeId: string) {
    const branches = doc.wires.filter(w => [w.a, w.b].some(a => a.kind === 'node' && a.nodeId === nodeId));
    setDialog({ title: 'Disconnect junction', description: 'Group the numbered branches that should stay connected, one group per line. Use commas within a group. Each branch must appear once.\n\n' + branches.map((w, i) => `${i + 1}. ${objectDescription(doc, w.id)}`).join('\n'), fields: [{ name: 'groups', label: 'Branch groups', type: 'textarea', value: branches.map((_, i) => String(i + 1)).join('\n') }], onSubmit: v => {
      const groups = v.groups.split('\n').filter(s => s.trim()).map(line => line.split(',').map(s => { const index = Number(s.trim()) - 1; if (!Number.isInteger(index) || index < 0 || index >= branches.length) throw new Error('Use the branch numbers shown above'); return branches[index].id; }));
      session.edit('Disconnect junction', d => disconnectNode(d, nodeId, groups));
    } });
  }
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.nativeEvent.isComposing || dialog || shortcutsOpen || feedbackOpen || paletteOpen || menu || moreOpen || candidates.length || e.target !== root.current && e.target !== svg.current) return;
    const command = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && draft && !command && !e.altKey && !e.shiftKey && !e.repeat && !e.nativeEvent.isComposing && !paletteOpen && !menu && !candidates.length && !(e.target as Element).closest('button,[role=button]')) {
      e.preventDefault(); e.stopPropagation(); if (draft.bends.length) finishWire(); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    if (command && e.key.toLowerCase() === 'z') { e.preventDefault(); if (draft) { e.shiftKey ? redoCorner() : undoCorner(); } else { e.shiftKey ? session.redo() : session.undo(); } return; }
    if (command && e.key.toLowerCase() === 'y') { e.preventDefault(); draft ? redoCorner() : session.redo(); return; }
    if (command && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelection(new Set([...doc.components, ...doc.wires, ...doc.nodes, ...doc.annotations, ...doc.groups].map(x => x.id))); return; }
    if (command && ['c', 'x'].includes(e.key.toLowerCase())) { e.preventDefault(); void copy(e.key.toLowerCase() === 'x'); return; }
    if (command && e.key.toLowerCase() === 'v') { e.preventDefault(); showPaste(); return; }
    if (command && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
    if (command || e.altKey) return;
    if (e.key === 'Backspace' && draft) { e.preventDefault(); undoCorner(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); edit('Delete selection', d => deleteSelection(d, selection)); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const step = e.shiftKey ? GRID * 4 : GRID; edit('Nudge selection', d => moveSelection(d, selection, { x: e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0, y: e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0 }), `nudge-${[...selection].sort().join(',')}`); return; }
    if (e.repeat || e.getModifierState('AltGraph')) return;
    const action = Object.entries(shortcuts).find(([, key]) => key && key === e.key.toLowerCase())?.[0];
    if (!action) return;
    e.preventDefault(); e.stopPropagation();
    if (action === 'select') cancel();
    if (action === 'wire') startWire();
    if (action === 'rotate' && canRotate) doTransform('rotate');
    if (action === 'fit') fit();
    if (action === 'box') { cancel(); setTool('box'); }
    if (action === 'multi') { cancel(); setMulti(!multi); }
    if (action === 'inspect') { setInspector('properties'); setInspectorOpen(!inspectorOpen); }
  }
  async function doExport(kind: 'svg' | 'png' | 'json' | 'snippet', scale = 2) { try { await host.export(kind, kind === 'snippet' ? fragment(doc, selection) : doc, root.current!.ownerDocument, scale); setNotice('Export saved.'); } catch (e) { notify(e); } }
  const selectedComponent = doc.components.find(c => selection.has(c.id)), selectedWire = doc.wires.find(w => selection.has(w.id)), selectedNode = doc.nodes.find(n => selection.has(n.id)), selectedAnnotation = doc.annotations.find(a => selection.has(a.id));
  const activeTarget = useMemo(() => pointing && (tool === 'wire' || tool === 'reconnect') ? hitCandidates(pointer, pointerKind.current)[0] : undefined, [pointer, doc, camera.zoom, tool, snapping, pointing]);
  const bodies = useMemo(() => doc.components.map(component => bodyBox(component, getDefinition(doc, component))), [doc]);
  const guidance = useMemo(() => {
    if (!pointing || gesture.kind === 'pinch' || gesture.kind === 'pan' && suppressClick.current) return { overlaps: [], guides: [] };
    if (tool === 'place' && placement) {
      const component: Component = { id: 'placement-preview', definitionId: placement.definition.id, position: snap(pointer, snapping), rotation: placement.rotation, mirrorX: false, mirrorY: false, reference: '', properties: {}, locked: false };
      return placementCues(bodyBox(component, placement.definition), bodies, new Set(), camera.zoom);
    }
    if (gesture.kind === 'move' && (gesture.delta.x !== 0 || gesture.delta.y !== 0)) {
      const ids = movableSelection(doc, gesture.ids), primary = previewDoc.components.find(component => component.id === gesture.focusId) ?? previewDoc.components.find(component => ids.has(component.id));
      if (primary) return placementCues(bodyBox(primary, getDefinition(doc, primary)), bodies, ids, camera.zoom);
    }
    return { overlaps: [], guides: [] };
  }, [pointing, gesture, tool, placement, pointer, snapping, bodies, camera.zoom, doc, previewDoc]);
  const widthAt = (target?: Target) => {
    if (!target || target.kind === 'free') return undefined;
    if (target.kind === 'wire') return doc.wires.find(wire => wire.id === target.wireId)?.width;
    return pinWidth(doc, target) ?? doc.wires.find(wire => [wire.a, wire.b].some(anchor => anchorKey(anchor) === anchorKey(target)))?.width;
  };
  const sourceWidth = reconnect ? doc.wires.find(wire => wire.id === reconnect.wireId)?.width : widthAt(draft?.start), targetWidth = widthAt(activeTarget?.target);
  const targetMismatch = sourceWidth !== undefined && targetWidth !== undefined && sourceWidth !== targetWidth;
  const targetLocked = activeTarget?.target.kind === 'wire' && lockedIds.has(activeTarget.objectId);
  const protectingGroups = doc.groups.filter(g => g.locked && g.members.some(id => selection.has(id)));
  const lockLabel = protectingGroups.length ? (protectingGroups.length === 1 ? 'Unlock group' : 'Unlock groups') : [...doc.components, ...doc.wires, ...doc.annotations, ...doc.groups].some(object => selection.has(object.id) && object.locked) ? 'Unlock selection' : 'Lock selection';
  const draftStart = draft ? draft.start.kind === 'free' || draft.start.kind === 'wire' ? draft.start.point : draft.start : null;
  const fixedPreview = useMemo(() => {
    if (!draft || !draftStart) return [];
    const startPoint = 'kind' in draftStart ? anchorPosition(doc, draftStart) : draftStart;
    if (!draft.bends.length) return [startPoint];
    if (freeAngle) return [startPoint, ...draft.bends];
    return routeThroughPoints(doc, [draftStart, ...draft.bends], horizontalFirst);
  }, [doc, draft, freeAngle, horizontalFirst]);
  let previewPoints: Point[] = [];
  if (draft && draftStart) {
    const last = draft.bends.at(-1) ?? draftStart;
    const end = activeTarget?.target.kind === 'pin' || activeTarget?.target.kind === 'node' ? activeTarget.target : activeTarget?.point ?? snap(pointer, snapping);
    const segment = freeAngle ? [fixedPreview.at(-1)!, 'kind' in end ? anchorPosition(doc, end) : end] : routeThroughPoints(doc, [last, end], horizontalFirst);
    previewPoints = [...fixedPreview, ...segment.slice(1)];
  }
  function changeProperty(key: string, value: string) { if (selectedComponent) edit('Edit component', d => { const c = d.components.find(c => c.id === selectedComponent.id)!; assertUnlocked(d, selectedComponent.id); if (key === 'reference') c.reference = value; else c.properties[key] = value; }); }
  function positionDialog() { const object = selectedComponent ?? selectedNode ?? selectedAnnotation; if (!object) return; setDialog({ title: 'Move selection', fields: [{ name: 'x', label: 'Selected object X', type: 'number', value: String(object.position.x) }, { name: 'y', label: 'Selected object Y', type: 'number', value: String(object.position.y) }], onSubmit: v => session.edit('Move by coordinates', d => { const current = [...d.components, ...d.nodes, ...d.annotations].find(item => item.id === object.id); if (!current) throw new Error('Selected object no longer exists'); assertUnlocked(d, current.id); moveSelection(d, selection, { x: Number(v.x) - current.position.x, y: Number(v.y) - current.position.y }); }) }); }
  function selectDrawingTool(action: () => void) {
    if ((root.current?.clientWidth ?? 0) <= 1000) closeInspector();
    action(); root.current?.focus({ preventScroll: true });
  }
  function openParts(open: boolean) {
    setPaletteOpen(open);
    if (open) { setMenu(false); setMoreOpen(false); if ((root.current?.clientWidth ?? 0) <= 1000) closeInspector(); }
  }
  function moreAction(action: () => void) { setMoreOpen(false); action(); root.current?.focus({ preventScroll: true }); }
  function showChecks() { setMenu(false); setMoreOpen(false); setPaletteOpen(false); setInspector('checks'); setInspectorOpen(true); root.current?.focus({ preventScroll: true }); }
  useEffect(() => {
    const element = root.current; if (!element) return;
    element.addEventListener('lec:show-checks', showChecks);
    return () => element.removeEventListener('lec:show-checks', showChecks);
  }, []);
  const canRotate = !!placement || doc.components.some(item => displaySelection.has(item.id) && !lockedIds.has(item.id)) || doc.annotations.some(item => displaySelection.has(item.id) && !lockedIds.has(item.id));
  const contextRotate = canRotate && !!placement;
  function customBlockDialog(editExisting = false) {
    const def = editExisting && selectedComponent ? getDefinition(doc, selectedComponent) : undefined;
    setDialog({ title: editExisting ? 'Edit block pins' : 'Create custom block', description: 'One pin per line: stable ID, label, side, role, bit width. Sides: left/right/top/bottom. Roles: passive/input/output/power/bidirectional/tristate. Removed or width-changed pins leave dangling wire ends.', fields: [{ name: 'name', label: 'Block name', value: def?.name ?? 'Custom IC', required: true }, { name: 'pins', label: 'Pins', type: 'textarea', value: def?.pins.map(p => `${p.id}, ${p.name}, ${p.side}, ${p.role}, ${p.width}`).join('\n') ?? 'in-0, IN, left, input, 1\nout-0, OUT, right, output, 1', required: true }], submit: editExisting ? 'Update pins' : 'Place block', onSubmit: v => { const block = makeCustomBlock(v.name, v.pins); definitionSchema.parse(block); if (editExisting && selectedComponent) session.edit('Reconfigure pins', d => reconfigure(d, selectedComponent.id, block)); else startPart(block); } });
  }

  return <div className="lec-editor" data-toolbar-dock={docked ? dockSide : 'inline'} style={{ '--lec-dock-space': docked && dockSide === 'bottom' ? `calc(${dockHeight + 16}px + var(--lec-navbar-inset, 0px))` : docked && dockSide === 'top' ? `${dockHeight + 16}px` : '0px', '--lec-side-dock-width': `${dockWidth}px` } as CSSProperties} ref={root} tabIndex={0} onKeyDown={onKeyDown} onPointerDownCapture={event => { if (!svg.current?.contains(event.target as Node)) lastTap.current = undefined; }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) lastTap.current = undefined; }} data-testid="editor" data-camera-animating={cameraAnimating || undefined}>

    {menu && <FileMenu anchor={fileTrigger.current} boundary={root.current} onClose={closeMenu} footer={<button role="menuitem" className="lec-danger" onClick={() => { setMenu(false); setDialog({ title: 'Clear circuit?', description: 'Remove all parts, wires and annotations. Undo restores the circuit.', fields: [], danger: true, submit: 'Clear circuit', onSubmit: () => { cancel(); session.edit('Clear circuit', d => Object.assign(d, emptyDocument(doc.title))); } }); }}>Clear circuit…</button>}>
      <button role="menuitem" onClick={() => { setMenu(false); if (host.newDocument) void host.newDocument().catch(notify); else setDialog({ title: 'New circuit', description: 'Clear this workspace. Export your current circuit first if you want a separate file. Undo remains available.', fields: [], submit: 'New circuit', onSubmit: () => { cancel(); session.edit('New circuit', d => Object.assign(d, emptyDocument())); } }); }}>New circuit</button>
      {host.openDocument && <button role="menuitem" onClick={() => { host.openDocument?.(); setMenu(false); }}>Open circuit…</button>}
      <button role="menuitem" onClick={() => { setMenu(false); setDialog({ title: 'Circuit title', fields: [{ name: 'title', label: 'Title', value: doc.title, required: true }], onSubmit: v => session.edit('Rename circuit title', d => { d.title = v.title.trim(); }) }); }}>Circuit title…</button>
      <button role="menuitem" onClick={() => { setMenu(false); setDialog({ title: 'Import circuit', description: 'Replace this document with circuit JSON. You can undo the import.', fields: [{ name: 'content', label: 'Circuit JSON', type: 'textarea', required: true }], submit: 'Import', onSubmit: v => { const imported = parseDocument(v.content); cancel(); session.edit('Import circuit', d => Object.assign(d, imported)); } }); }}>Import circuit JSON…</button>
      <button role="menuitem" onClick={() => { setMenu(false); void doExport('json'); }}>Export circuit JSON</button>
      <button role="menuitem" onClick={() => { setMenu(false); void doExport('svg'); }}>Export SVG</button><button role="menuitem" onClick={() => { setMenu(false); void doExport('png', 2); }}>Export PNG · 2×</button><button role="menuitem" onClick={() => { setMenu(false); void doExport('png', 1); }}>Export PNG · 1×</button>
      {host.duplicate && <button role="menuitem" onClick={() => { setMenu(false); void host.duplicate?.(doc).catch(notify); }}>Duplicate document</button>}
      {host.insertPreview && <button role="menuitem" onClick={() => { setMenu(false); host.insertPreview?.(); }}>Insert linked preview</button>}
      <button role="menuitem" onClick={() => { setMenu(false); void doExport('snippet'); }}>Save selected snippet</button><button role="menuitem" onClick={() => { setMenu(false); showPaste(); }}>Paste / load snippet…</button>
      {!!host.examples?.length && <button role="menuitem" onClick={() => { setMenu(false); setDialog({ title: 'Open example', description: 'Replace the current drawing with an example. Undo restores your drawing.', fields: [{ name: 'example', label: 'Example', type: 'select', options: host.examples!.map((example, i) => ({ value: String(i), label: example.name })) }], submit: 'Open example', onSubmit: v => { const example = host.examples![Number(v.example)]; if (!example) throw new Error('Choose an example'); cancel(); session.edit('Open example', d => Object.assign(d, clone(example.document))); fit(); } }); }}>Examples…</button>}


    </FileMenu>}
    {moreOpen && <FileMenu label="More actions" anchor={moreTrigger.current} boundary={root.current} onClose={closeMore}>
      <div className="lec-menu-caption">Selection</div>
      <button role="menuitem" disabled={!doc.components.length && !doc.wires.length && !doc.nodes.length && !doc.annotations.length && !doc.groups.length} onClick={() => moreAction(() => setSelection(new Set([...doc.components, ...doc.nodes, ...doc.wires, ...doc.annotations, ...doc.groups].map(item => item.id))))}>Select all</button>
      <button role="menuitem" disabled={!selection.size} onClick={() => moreAction(() => setSelection(new Set()))}>Deselect all</button>
      {canRotate && !placement && <button role="menuitem" onClick={() => moreAction(() => doTransform('rotate'))}>Rotate selected</button>}
      <div className="lec-menu-caption">Drawing</div>
      <button role="menuitemcheckbox" aria-checked={grid} onClick={() => moreAction(() => setGrid(!grid))}><span className="lec-menu-check" aria-hidden="true">{grid ? '✓' : ''}</span>Show grid</button>
      <button role="menuitemcheckbox" aria-checked={snapping} onClick={() => moreAction(() => setSnapping(!snapping))}><span className="lec-menu-check" aria-hidden="true">{snapping ? '✓' : ''}</span>Snap to grid</button>
      <button role="menuitem" onClick={() => moreAction(showChecks)}>Checks{checks.length > 0 && <small aria-hidden="true" className="lec-menu-count">{checks.length}</small>}</button>
      <button role="menuitem" onClick={() => moreAction(() => setShortcutsOpen(true))}>Keyboard shortcuts…</button>
      <div className="lec-menu-caption">Help improve the editor</div>
      <button role="menuitem" onClick={() => moreAction(() => setFeedbackOpen(true))}><Icon name="feedback" />Send feedback</button>
    </FileMenu>}
    {['error', 'conflict', 'deleted'].includes(saveState.status) && <div className="lec-save-alert" role="alert"><span>{saveState.message}</span>{saveState.status === 'error' && <button onClick={() => void save?.retry()}>Retry</button>}{saveState.status === 'conflict' && <><button onClick={() => setDialog({ title: 'Review both versions', fields: [{ name: 'local', label: 'Local version', type: 'textarea', value: serializeDocument(doc) }, { name: 'external', label: 'External version', type: 'textarea', value: saveState.external ?? '' }], submit: 'Close', onSubmit: () => {} })}>Review</button><button onClick={() => void save?.resolve('local').catch(notify)}>Keep local</button><button onClick={() => void save?.resolve('external').catch(notify)}>Use external</button></>}<button onClick={() => void doExport('json')}>Save a copy</button></div>}
    <div className="lec-layout">
      <main className={`lec-workspace${docked ? ' is-compact' : ''}${docked ? ` is-dock-${dockSide}` : ''}`} data-dock={docked ? dockSide : 'inline'} ref={workspace}>
        <div className="lec-topbar" role="toolbar" aria-labelledby={toolsLabel} data-ignore-swipe="true" onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}>
          <span id={toolsLabel} hidden>Circuit tools</span>
          <div className="lec-file-cluster"><button className="lec-file-trigger" ref={fileTrigger} onClick={() => { setMoreOpen(false); setPaletteOpen(false); setMenu(!menu); }} aria-expanded={menu} aria-labelledby={documentLabel}><span id={documentLabel} hidden>Document menu</span>File <span aria-hidden="true">⌄</span></button>
            <div className="lec-history" onClick={event => { if (event.detail > 0) root.current?.focus({ preventScroll: true }); }}><ToolButton label="Undo" icon="undo" disabled={draft ? !draft.bends.length : !snapshot.canUndo} onClick={() => draft ? undoCorner() : session.undo()} /><ToolButton label="Redo" icon="redo" disabled={draft ? !cornerRedo.current.length : !snapshot.canRedo} onClick={() => draft ? redoCorner() : session.redo()} /></div>
          </div>
          <div ref={dock} className={`lec-drawing-toolbar${contextRotate ? ' has-context' : ''}`} data-ignore-swipe="true">
            <DockHandle area={workspace.current} position={dockPosition} save={docking.save} onError={notify} />
            <div className="lec-tools" role="group" aria-labelledby={editingLabel} onClick={event => { if (event.detail > 0) root.current?.focus({ preventScroll: true }); }}><span id={editingLabel} hidden>Editing tools</span><div className="lec-tool-group">
              <ToolButton label="Select" shortcut={shortcuts.select} icon="select" active={tool === 'select'} onClick={() => selectDrawingTool(cancel)} />
              <ToolButton label="Box select" shortcut={shortcuts.box} icon="box-select" active={tool === 'box'} onClick={() => selectDrawingTool(() => { cancel(); setTool('box'); })}><span>Box</span></ToolButton>
              <ToolButton label="Multi" shortcut={shortcuts.multi} icon="multi" active={multi} onClick={() => selectDrawingTool(() => { cancel(); setMulti(!multi); })} />
            </div></div>
            <div className="lec-wire-tool"><ToolButton label="Wire" shortcut={shortcuts.wire} icon="wire" active={tool === 'wire' || tool === 'reconnect'} onClick={() => selectDrawingTool(startWire)} /></div>
            <PartsToolbar container={workspace.current} compact={docked} dockSide={dockSide} dockHeight={dockHeight} open={paletteOpen} onOpenChange={openParts} onPart={startPart} onCustomBlock={() => customBlockDialog()} onText={() => annotationDialog('text')} />
            <div className="lec-rotate-context" onClick={event => { if (event.detail > 0) root.current?.focus({ preventScroll: true }); }}><span className="lec-context-name">{placement ? placement.definition.name : selection.size > 1 ? `${selection.size} selected` : selectedComponent?.reference || 'Selected object'}</span><ToolButton label="Rotate" shortcut={shortcuts.rotate} icon="rotate" disabled={!canRotate} onClick={() => doTransform('rotate')} />{docked && placement && <button onClick={cancel}>Cancel</button>}</div>
          </div>
          <div className="lec-utility-cluster"><ToolButton label="Inspect" shortcut={shortcuts.inspect} icon="inspect" active={inspectorOpen} onClick={() => { setMoreOpen(false); setMenu(false); if (inspectorOpen) closeInspector(); else setInspectorOpen(true); }} /><button ref={moreTrigger} className={`lec-more-trigger${moreOpen ? ' is-active' : ''}`} aria-label="More actions" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => { setMenu(false); setPaletteOpen(false); setMoreOpen(!moreOpen); }}><Icon name="more" />{checks.length > 0 && <small aria-hidden="true" className="lec-issues-badge">{checks.length}</small>}</button></div>
        </div>
        <span id={canvasLabel} hidden>Circuit drawing. Use the object list and Connect pins for keyboard access.</span><div className="lec-viewport" ref={viewport} data-ignore-swipe="true" style={{ touchAction: 'none' }}><svg ref={svg} className="lec-canvas" role="application" aria-labelledby={canvasLabel} width="100%" height="100%" onPointerDown={e => { if (!pointers.current.size) suppressClick.current = false; onPointerDown(e); }} onPointerMove={queuePointerMove} onPointerLeave={() => { if (!pointers.current.size) setPointing(false); }} onPointerUp={onPointerUp} onPointerCancel={e => { e.stopPropagation(); finishPointers(); }} onLostPointerCapture={e => { e.stopPropagation(); if (pointers.current.has(e.pointerId)) finishPointers(); }} onDoubleClick={e => {
          e.preventDefault(); e.stopPropagation();
          if (pointerKind.current === 'touch' || tool !== 'select' || draft || reconnect || suppressClick.current || pointers.current.size) return;
          const id = objectAt(e.clientX, e.clientY); if (id) inspectObject(id, true);
        }} onContextMenu={e => {
          e.preventDefault(); e.stopPropagation(); lastTap.current = undefined;
          if (tool !== 'select' || draft || reconnect || pointers.current.size) return;
          const id = objectAt(e.clientX, e.clientY); if (id) inspectObject(id);
        }}>
          <defs><pattern id={gridId} x={-GRID / 2} y={-GRID / 2} patternUnits="userSpaceOnUse" width={GRID} height={GRID}><circle cx={GRID / 2} cy={GRID / 2} r="0.6" fill="var(--lec-grid)" /></pattern></defs>
          <rect width="100%" height="100%" fill="var(--lec-paper)" />
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>{grid && <rect x={-camera.x / camera.zoom} y={-camera.y / camera.zoom} width={size.width / camera.zoom} height={size.height / camera.zoom} fill={`url(#${gridId})`} pointerEvents="none" />}<g className="lec-alignment-cues" pointerEvents="none" aria-hidden="true">{guidance.guides.map(guide => <line key={guide.axis} data-axis={guide.axis} {...{ x1: guide.x1, y1: guide.y1, x2: guide.x2, y2: guide.y2 }} className="lec-alignment-guide" vectorEffect="non-scaling-stroke" />)}</g><Scene document={previewDoc} selection={displaySelection} crossings={crossings} camera={camera} width={size.width} height={size.height} highlighted={highlighted} settling={feedback.parts} wireFeedback={feedback.wires} />
            {tool === 'place' && placement && pointing && <g className={`lec-placement-preview${guidance.overlaps.length ? ' is-overlapping' : ''}`} opacity="0.5" transform={componentTransform({ position: snap(pointer, snapping), rotation: placement.rotation, mirrorX: false, mirrorY: false } as Component)} stroke="var(--lec-accent)" strokeWidth="2" fill="none" pointerEvents="none"><SymbolDrawing definition={placement.definition} /></g>}
            {draft && <path d={pathData(previewPoints)} fill="none" stroke="var(--lec-accent)" strokeWidth="2.5" strokeDasharray="6 4" pointerEvents="none" />}
            {activeTarget && <circle key={activeTarget.target.kind === 'pin' || activeTarget.target.kind === 'node' ? anchorKey(activeTarget.target) : activeTarget.objectId} cx={activeTarget.point.x} cy={activeTarget.point.y} r={9 / camera.zoom} className={`lec-target${targetMismatch || targetLocked ? ' is-unavailable' : ''}`} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            <g className="lec-interaction-cues" pointerEvents="none" aria-hidden="true">
              {guidance.overlaps.map(body => <rect key={body.id} data-overlap={body.id} x={body.x - 3 / camera.zoom} y={body.y - 3 / camera.zoom} width={body.width + 6 / camera.zoom} height={body.height + 6 / camera.zoom} className="lec-overlap-cue" vectorEffect="non-scaling-stroke" />)}
              {feedback.points.map(cue => cue.kind === 'snap' ? <path key={cue.key} className="lec-snap-feedback" d={`M ${cue.point.x - 3 / camera.zoom} ${cue.point.y} h ${6 / camera.zoom} M ${cue.point.x} ${cue.point.y - 3 / camera.zoom} v ${6 / camera.zoom}`} vectorEffect="non-scaling-stroke" /> : <circle key={cue.key} className="lec-connection-feedback" cx={cue.point.x} cy={cue.point.y} r={6 / camera.zoom} vectorEffect="non-scaling-stroke" />)}
            </g>
            {previewDoc.annotations.filter(a => (selection.has(a.id) || selectionPresence.has(a.id)) && !lockedIds.has(a.id)).map(a => <AnnotationHandles key={a.id} annotation={a} zoom={camera.zoom} active={selection.has(a.id)} />)}
            {gesture.kind === 'box' && <rect x={Math.min(gesture.origin.x, gesture.end.x)} y={Math.min(gesture.origin.y, gesture.end.y)} width={Math.abs(gesture.end.x - gesture.origin.x)} height={Math.abs(gesture.end.y - gesture.origin.y)} className="lec-box-selection" fill="var(--lec-accent)" fillOpacity="0.08" stroke="var(--lec-accent)" vectorEffect="non-scaling-stroke" strokeDasharray="5 3" pointerEvents="none" />}
            {selectedWire && !lockedIds.has(selectedWire.id) && tool === 'bend' && <g>{wirePoints(doc, selectedWire).slice(1).map((p, i) => { const a = wirePoints(doc, selectedWire)[i]; return <path key={i} data-wire={selectedWire.id} data-segment={i} d={pathData([a, p])} stroke="var(--lec-accent)" strokeOpacity="0.25" strokeWidth={12 / camera.zoom} fill="none" />; })}{selectedWire.route.vertices.map((p, i) => <rect key={p.id} data-wire={selectedWire.id} data-bend={i} x={p.x - 6 / camera.zoom} y={p.y - 6 / camera.zoom} width={12 / camera.zoom} height={12 / camera.zoom} fill="var(--lec-paper)" stroke="var(--lec-accent)" strokeWidth="2" />)}</g>}
          </g>
        </svg>

        <div className="lec-zoom-controls" role="group" aria-labelledby={zoomLabel} onClick={event => { if (event.detail > 0) root.current?.focus({ preventScroll: true }); }}><span id={zoomLabel} hidden>Zoom controls</span><button aria-label="Zoom out" onClick={() => setCamera(stepZoomAt(cameraDestination(), { x: size.width / 2, y: size.height / 2 }, -1))}>−</button><button aria-label="Reset zoom" onClick={() => { const target = cameraDestination(); animateCamera(zoomAt(target, { x: size.width / 2, y: size.height / 2 }, 1 / target.zoom)); }}>{Math.round(camera.zoom * 100)}%</button><button aria-label="Zoom in" onClick={() => setCamera(stepZoomAt(cameraDestination(), { x: size.width / 2, y: size.height / 2 }, 1))}>+</button><ToolButton label="Fit circuit" shortcut={shortcuts.fit} icon="fit" onClick={() => fit()} /></div>
        {(draft || placement && !compact || tool === 'move' || reconnect) && <div className="lec-gesture-bar" onPointerDown={consumeControlPointer} onPointerUp={consumeControlPointer} onClick={e => e.stopPropagation()}><span>{placement ? `Place ${placement.definition.name}${guidance.overlaps.length ? ' · overlaps a part' : ''}` : reconnect ? 'Choose a new endpoint' : draft ? `${draft.bends.length} point${draft.bends.length === 1 ? '' : 's'} placed · ${activeTarget?.label ?? 'tap to place a point'}${targetMismatch ? ' · incompatible width' : targetLocked ? ' · locked route' : ''}` : 'Tap a destination'}</span>{draft && <><button onClick={undoCorner} disabled={!draft.bends.length}>Undo corner</button><button className="lec-primary" disabled={!draft.bends.length} title="Finish at the last placed point (Enter)" aria-keyshortcuts="Enter" onClick={finishWire}>Finish</button></>}<button onClick={cancel}>Cancel</button></div>}
        </div>
        <div className="lec-dock-spacer" aria-hidden="true" />
        <footer className="lec-statusbar"><span>{tool === 'place' ? 'PLACE' : tool === 'wire' ? 'WIRE' : tool.toUpperCase()}<span className="lec-status-divider">/</span>{selection.size ? `${selection.size} selected` : `${doc.components.length} parts · ${doc.wires.length} wires`}</span><div className="lec-status-actions">{checks.length > 0 && <span className="lec-status-issues">{checks.length} {checks.length === 1 ? 'issue' : 'issues'}</span>}<span className={`lec-save lec-save-${saveState.status}`} role="status" title={saveState.message}>{save ? saveState.message : 'In memory'}</span></div></footer>
      </main>
      <aside className={`lec-inspector${inspectorOpen ? ' is-open' : ''}`} aria-labelledby={inspectorLabel}><span id={inspectorLabel} hidden>Circuit inspector</span><div className="lec-panel-heading"><h2>Properties</h2><button className="lec-panel-close" onClick={closeInspector} aria-label="Close inspector">×</button></div><div className="lec-inspector-tabs" role="tablist">{(['properties', 'objects', 'nets', 'checks'] as const).map(t => <button key={t} role="tab" aria-selected={inspector === t} onClick={() => setInspector(t)}>{t === 'properties' ? 'Edit' : t[0].toUpperCase() + t.slice(1)}</button>)}</div><div className="lec-inspector-body">
        {inspector === 'objects' && <><h3>Objects</h3><p className="lec-muted">Select an item to edit. Use Multi for several objects.</p>{[
          { name: 'Components', items: doc.components }, { name: 'Wires', items: doc.wires }, { name: 'Junctions', items: doc.nodes }, { name: 'Annotations', items: doc.annotations }, { name: 'Groups', items: doc.groups },
        ].filter(group => group.items.length).map(group => <section key={group.name} className="lec-object-section"><h4>{group.name}<span>{group.items.length}</span></h4>{group.items.map(object => <button key={object.id} className="lec-object-row" aria-pressed={selection.has(object.id)} onClick={() => selectObject(object.id)}>{objectDescription(doc, object.id)}</button>)}</section>)}{!doc.components.length && !doc.wires.length && !doc.nodes.length && !doc.annotations.length && !doc.groups.length && <p className="lec-muted">Placed parts, wires and annotations will appear here.</p>}</>}
        {inspector === 'nets' && <><h3>{nets.length} {nets.length === 1 ? 'net' : 'nets'}</h3><p className="lec-muted">Expand a net to see its connected terminals and highlight its wires.</p>{nets.map(net => <details key={net.id}><summary onClick={() => setHighlighted(new Set(net.wireIds))}>{net.name} · {net.members.length} terminals</summary><button onClick={() => { setSelection(new Set(net.wireIds)); setHighlighted(new Set(net.wireIds)); }}>Select net wires</button>{net.members.map(m => <p key={m} className="lec-terminal">{terminalDescription(doc, m)}</p>)}</details>)}<button onClick={() => setHighlighted(new Set())}>Clear net highlight</button></>}
        {inspector === 'checks' && <><h3>Structural checks</h3><p className="lec-muted">Review connections and drawing structure. Select an issue to find it on the canvas.</p>{!checks.length && <p className="lec-check-success">✓ No structural issues found.</p>}{checks.map(c => <button className="lec-check-row" key={c.id} onClick={() => { const ids = new Set(c.objectIds); setSelection(ids); fit(ids); }}><span aria-hidden="true">⚠</span>{c.message}</button>)}</>}
        {inspector === 'properties' && <>
          {!selection.size && <div className="lec-inspector-empty"><h3>Select an object</h3><p>Click a part, wire or annotation to see its properties. Double-click or double-tap a part to open it here.</p></div>}
          {selection.size > 0 && <><div className="lec-selection-title"><small>{selection.size === 1 ? 'Selected object' : `${selection.size} objects selected`}</small><h3>{selectedComponent ? objectDescription(doc, selectedComponent.id) : selectedWire ? 'Wire' : selectedNode ? 'Junction / endpoint' : selectedAnnotation ? 'Annotation' : 'Group'}</h3></div>
          {selectedComponent && <><div className="lec-property-fields"><label className="lec-field">Reference<input disabled={lockedIds.has(selectedComponent.id)} key={selectedComponent.id + selectedComponent.reference} defaultValue={selectedComponent.reference} onBlur={e => { if (e.target.value !== selectedComponent.reference) changeProperty('reference', e.target.value); }} /></label><label className="lec-field">Value<input disabled={lockedIds.has(selectedComponent.id)} key={selectedComponent.id + String(selectedComponent.properties.value ?? '')} defaultValue={String(selectedComponent.properties.value ?? '')} placeholder="e.g. 10k, 100nF" onBlur={e => { if (e.target.value !== String(selectedComponent.properties.value ?? '')) changeProperty('value', e.target.value); }} /></label><label className="lec-field">Label<input disabled={lockedIds.has(selectedComponent.id)} key={selectedComponent.id + String(selectedComponent.properties.label ?? '')} defaultValue={String(selectedComponent.properties.label ?? '')} onBlur={e => { if (e.target.value !== String(selectedComponent.properties.label ?? '')) changeProperty('label', e.target.value); }} /></label></div><details className="lec-inspector-section"><summary>Position & orientation</summary><div className="lec-inspector-section-body"><button disabled={lockedIds.has(selectedComponent.id)} onClick={positionDialog}>Move by coordinates…</button><button disabled={lockedIds.has(selectedComponent.id)} onClick={() => setTool('move')}>Move, then tap destination</button><div className="lec-nudge"><button disabled={lockedIds.has(selectedComponent.id)} aria-label="Nudge left" onClick={() => edit('Nudge', d => moveSelection(d, selection, { x: -GRID, y: 0 }))}>←</button><button disabled={lockedIds.has(selectedComponent.id)} aria-label="Nudge up" onClick={() => edit('Nudge', d => moveSelection(d, selection, { x: 0, y: -GRID }))}>↑</button><button disabled={lockedIds.has(selectedComponent.id)} aria-label="Nudge down" onClick={() => edit('Nudge', d => moveSelection(d, selection, { x: 0, y: GRID }))}>↓</button><button disabled={lockedIds.has(selectedComponent.id)} aria-label="Nudge right" onClick={() => edit('Nudge', d => moveSelection(d, selection, { x: GRID, y: 0 }))}>→</button></div><div className="lec-action-grid"><button disabled={lockedIds.has(selectedComponent.id)} onClick={() => doTransform('rotate')}>Rotate 90°</button><button disabled={lockedIds.has(selectedComponent.id)} onClick={() => doTransform('mirrorX')}>Mirror X</button><button disabled={lockedIds.has(selectedComponent.id)} onClick={() => doTransform('mirrorY')}>Mirror Y</button><button disabled={lockedIds.has(selectedComponent.id)} onClick={() => { edit('Detach part', d => detachComponent(d, selectedComponent.id)); setTool('move'); }}>Detach & move</button></div></div></details><details className="lec-inspector-section"><summary>Pins & connections</summary><div className="lec-inspector-section-body"><button disabled={lockedIds.has(selectedComponent.id)} onClick={() => customBlockDialog(true)}>Edit pin layout…</button>{getDefinition(doc, selectedComponent).category === 'Logic gates' && !['NOT', 'Buffer', 'Tri-state buffer'].includes(getDefinition(doc, selectedComponent).name) && <label className="lec-field">Gate inputs<select disabled={lockedIds.has(selectedComponent.id)} value={getDefinition(doc, selectedComponent).pins.filter(p => p.role === 'input').length} onChange={e => edit('Change gate inputs', d => reconfigure(d, selectedComponent.id, makeGate(getDefinition(doc, selectedComponent).name, Number(e.target.value))))}>{[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n}>{n}</option>)}</select></label>}{getDefinition(doc, selectedComponent).category === 'Buses' && <label className="lec-field">Bus lanes<select disabled={lockedIds.has(selectedComponent.id)} value={getDefinition(doc, selectedComponent).pins[0].width} onChange={e => edit('Change bus width', d => reconfigure(d, selectedComponent.id, makeBusSplitter(Number(e.target.value))))}>{[2, 4, 8, 16, 32].map(n => <option key={n}>{n}</option>)}</select></label>}{getDefinition(doc, selectedComponent).pins.map(p => { const a: Anchor = { kind: 'pin', componentId: selectedComponent.id, pinId: p.id }; const net = nets.find(n => n.members.includes(`${anchorKey(a)}[0]`)); return <div className="lec-pin-row" key={p.id}><button onClick={() => { startWire(); wireTo(a); closeInspector(); }}>{p.name}<small>{p.role}{p.width > 1 ? ` · ${p.width} bits` : ''}</small></button><button title="Highlight net" onClick={() => { setHighlighted(new Set(net?.wireIds ?? [])); setInspector('nets'); }}>{net?.name ?? 'Unwired'}</button></div>; })}<button onClick={connectionDialog}>Connect named pins…</button></div></details></>}
          {selectedWire && <><p className="lec-terminal">{objectDescription(doc, selectedWire.id)}</p><button disabled={lockedIds.has(selectedWire.id)} onClick={() => { setTool(tool === 'bend' ? 'select' : 'bend'); closeInspector(); }}>{tool === 'bend' ? 'Finish editing route' : 'Drag segments & bends'}</button><button disabled={lockedIds.has(selectedWire.id)} onClick={() => setDialog({ title: 'Edit wire bends', description: 'One x,y coordinate per line. Endpoints remain attached. Enter no lines to remove intermediate bends.', fields: [{ name: 'bends', label: 'Manual bends', type: 'textarea', value: selectedWire.route.vertices.map(p => `${p.x}, ${p.y}`).join('\n') }], onSubmit: v => session.edit('Edit route', d => { const w = d.wires.find(w => w.id === selectedWire.id)!; assertUnlocked(d, w.id); w.route.vertices = v.bends.split('\n').filter(s => s.trim()).map(s => { const p = s.split(',').map(Number); if (p.length !== 2 || !p.every(Number.isInteger)) throw new Error('Each bend must contain two integer coordinates'); return { id: uid('bend'), x: p[0], y: p[1], locked: true }; }); w.route.mode = 'manual'; }) })}>Add / remove bends…</button><button disabled={lockedIds.has(selectedWire.id)} onClick={() => edit('Change route geometry', d => { const w = d.wires.find(w => w.id === selectedWire.id)!; assertUnlocked(d, w.id); w.route.geometry = w.route.geometry === 'free' ? 'orthogonal' : 'free'; })}>{selectedWire.route.geometry === 'free' ? 'Use orthogonal routing' : 'Use free-angle routing'}</button><button disabled={lockedIds.has(selectedWire.id)} onClick={() => {
            let fixed = false, found = true;
            const succeeded = edit('Reroute automatically', d => {
              const w = d.wires.find(w => w.id === selectedWire.id)!;
              if (lockedObjects(d).has(w.id)) throw new Error('Unlock the wire first');
              if (w.route.vertices.some(p => p.locked)) { fixed = true; return; }
              found = reroute(d, w);
            });
            if (succeeded && fixed) setNotice('This wire has fixed waypoints. Edit or remove its bends before rerouting.');
            else if (succeeded && !found) setNotice('A clear route could not be found within the search limit. A visible fallback route was retained.');
          }}>Reroute automatically</button><details className="lec-inspector-section"><summary>Wire connections</summary><div className="lec-inspector-section-body"><button disabled={lockedIds.has(selectedWire.id)} onClick={() => { setReconnect({ wireId: selectedWire.id, end: 'a' }); setTool('reconnect'); setDraft(null); closeInspector(); }}>Reconnect start</button><button disabled={lockedIds.has(selectedWire.id)} onClick={() => { setReconnect({ wireId: selectedWire.id, end: 'b' }); setTool('reconnect'); setDraft(null); closeInspector(); }}>Reconnect end</button><button disabled={lockedIds.has(selectedWire.id)} onClick={() => setDialog({ title: 'Split wire', fields: [{ name: 'x', label: 'X', type: 'number', value: String(pointer.x) }, { name: 'y', label: 'Y', type: 'number', value: String(pointer.y) }], onSubmit: v => session.edit('Split wire', d => { splitWire(d, selectedWire.id, { x: Number(v.x), y: Number(v.y) }); }) })}>Split at position…</button><button disabled={lockedIds.has(selectedWire.id)} onClick={joinSelected}>Join selected crossing…</button>{selectedComponent && <button disabled={lockedIds.has(selectedWire.id)} onClick={() => edit('Insert component into wire', d => insertComponent(d, selectedComponent.id, selectedWire.id))}>Insert selected part into wire</button>}</div></details></>}
          {selectedNode && <><button onClick={() => { startWire(); wireTo({ kind: 'node', nodeId: selectedNode.id }); closeInspector(); }}>Wire from this junction</button><button disabled={lockedIds.has(selectedNode.id)} onClick={() => disconnectDialog(selectedNode.id)}>Disconnect with arm pairing…</button></>}
          {selectedAnnotation && <><label className="lec-field">Annotation text<input disabled={lockedIds.has(selectedAnnotation.id)} key={selectedAnnotation.id + selectedAnnotation.text} defaultValue={selectedAnnotation.text} onBlur={e => edit('Edit annotation', d => { assertUnlocked(d, selectedAnnotation.id); d.annotations.find(a => a.id === selectedAnnotation.id)!.text = e.target.value; })} /></label><button disabled={lockedIds.has(selectedAnnotation.id)} onClick={() => setDialog({ title: 'Annotation transform', description: 'Drag corner handles to resize and the round handle to rotate. These fields provide the same operations without dragging.', fields: [{ name: 'x', label: 'X', type: 'number', value: String(selectedAnnotation.position.x) }, { name: 'y', label: 'Y', type: 'number', value: String(selectedAnnotation.position.y) }, { name: 'rotation', label: 'Rotation (degrees)', type: 'number', value: String(selectedAnnotation.rotation) }, { name: 'scaleX', label: 'Width (%)', type: 'number', value: String(Math.round(selectedAnnotation.scaleX * 100)) }, { name: 'scaleY', label: 'Height (%)', type: 'number', value: String(Math.round(selectedAnnotation.scaleY * 100)) }, { name: 'fontSize', label: 'Font size', type: 'number', value: String(selectedAnnotation.fontSize) }], onSubmit: v => session.edit('Transform annotation', d => { assertUnlocked(d, selectedAnnotation.id); Object.assign(d.annotations.find(a => a.id === selectedAnnotation.id)!, { position: { x: Number(v.x), y: Number(v.y) }, rotation: Number(v.rotation), scaleX: Number(v.scaleX) / 100, scaleY: Number(v.scaleY) / 100, fontSize: Number(v.fontSize) }); }) })}>Move / resize / rotate…</button><button disabled={lockedIds.has(selectedAnnotation.id)} onClick={() => doTransform('rotate')}>Rotate 90°</button><button disabled={lockedIds.has(selectedAnnotation.id)} onClick={() => edit('Bring annotation forward', d => { assertUnlocked(d, selectedAnnotation.id); d.annotations.find(a => a.id === selectedAnnotation.id)!.zIndex++; })}>Bring forward</button><button disabled={lockedIds.has(selectedAnnotation.id)} onClick={() => edit('Send annotation backward', d => { assertUnlocked(d, selectedAnnotation.id); d.annotations.find(a => a.id === selectedAnnotation.id)!.zIndex--; })}>Send backward</button></>}
          {!selectedComponent && (selectedNode || selectedAnnotation) && <button disabled={lockedIds.has((selectedNode ?? selectedAnnotation)!.id)} onClick={positionDialog}>Move by coordinates…</button>}<details className="lec-selection-actions"><summary>Arrange and selection actions</summary><div className="lec-action-grid"><button onClick={duplicate}>Duplicate</button><button onClick={() => void copy()}>Copy</button><button onClick={() => void copy(true)}>Cut</button><button onClick={showPaste}>Paste…</button><button onClick={toggleLock}>{lockLabel}</button><button onClick={group}>Group</button><button onClick={() => edit('Ungroup', d => { d.groups = d.groups.filter(g => g.locked || !selection.has(g.id) && !g.members.some(id => selection.has(id))); })}>Ungroup</button><button onClick={() => fit(selection)}>Fit selection</button><button onClick={() => edit('Align horizontal', d => align(d, selection, 'y'))}>Align row</button><button onClick={() => edit('Align vertical', d => align(d, selection, 'x'))}>Align column</button><button onClick={() => edit('Distribute horizontal', d => align(d, selection, 'x', true))}>Distribute X</button><button onClick={() => edit('Distribute vertical', d => align(d, selection, 'y', true))}>Distribute Y</button><button onClick={() => annotationDialog('label')}>Name net</button><button onClick={() => annotationDialog('no-connect')}>No-connect</button></div><button onClick={() => setDialog({ title: 'Copy as text', fields: [{ name: 'json', label: 'Select and copy this JSON', type: 'textarea', value: serializeDocument(fragment(doc, selection)) }], submit: 'Close', onSubmit: () => {} })}>Copy as text…</button><button onClick={() => void doExport('snippet')}>Save as snippet</button><button className="lec-danger" onClick={() => edit('Delete selection', d => deleteSelection(d, selection))}>Delete selection</button><button className="lec-danger" onClick={() => edit('Delete with attached wires', d => deleteSelection(d, selection, true))}>Delete with attached wires</button></details></>}
          <details className="lec-annotation-tools"><summary>Annotations & wire options</summary>{(['text', 'box', 'arrow', 'polarity', 'current'] as const).map(k => <button key={k} onClick={() => annotationDialog(k)}>Add {k}</button>)}<button onClick={() => setHorizontalFirst(!horizontalFirst)}>{horizontalFirst ? 'Horizontal first' : 'Vertical first'}</button><button onClick={() => setFreeAngle(!freeAngle)}>{freeAngle ? 'Free-angle wire' : 'Orthogonal wire'}</button><label className="lec-checkbox"><input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} />Repeat placement</label></details>
        </>}
      </div></aside>
    </div>
    {shortcutsOpen && <ShortcutsDialog bindings={shortcuts} save={preferences.save} close={closeShortcuts} />}
    {feedbackOpen && <FeedbackDialog close={() => { setFeedbackOpen(false); root.current?.focus({ preventScroll: true }); }} />}
    {notice && <div className="lec-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
    {availableCandidates.length > 0 && <DialogFrame title={candidateAction === 'wire' ? 'Choose connection target' : 'Choose object'} description="These objects are close together. Choose explicitly." close={() => setCandidates([])}>{availableCandidates.map(candidate => <button className="lec-object-row" key={candidate.target.kind === 'pin' ? anchorKey(candidate.target) : candidate.objectId} onClick={() => choose(candidate)}>{candidate.label}</button>)}{candidateJoin && <button onClick={joinCandidates}>Join both wires explicitly</button>}<button onClick={() => setCandidates([])}>Cancel</button></DialogFrame>}
    {dialog && <Dialog key={dialog.title} spec={dialog} close={() => setDialog(null)} />}
  </div>;
}
