import { MarkdownRenderChild, Notice, type MarkdownPostProcessorContext, type TFile } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { useSyncExternalStore } from 'react';
import type CircuitPlugin from '../main';
import { Scene } from '../editor/render/Scene';
import { bounds } from '../core/geometry/geometry';
import { findCrossings } from '../editor/render/drawing';
import { parsePreviewOptions, repairPreviewReference, type PreviewOptions } from '../io/preview-reference';
import type { Entry } from './VaultPersistence';

function Preview({ entry, filename, path, open }: { entry: Entry; filename: string; path: string; open: () => void }) {
  const { document: doc } = useSyncExternalStore(entry.session.subscribe, entry.session.getSnapshot);
  const b = bounds(doc);
  return <><svg viewBox={`${b.x - 24} ${b.y - 24} ${b.width + 48} ${b.height + 48}`} role="img" aria-label={filename}><title>{filename}</title><Scene document={doc} showPins={false} crossings={findCrossings(doc)} /></svg><button className="lec-preview-open" title={path} onClick={open}>Open {filename}</button></>;
}

// Older insertions included a dedicated adjacent wiki-link. Hide only that exact
// rendered link while its preview is healthy, without rewriting the user's note.
function hideLegacyHeading(element: HTMLElement, plugin: CircuitPlugin, file: TFile, notePath: string): () => void {
  let block: Element | null = element;
  for (let depth = 0; depth < 4 && block; depth++, block = block.parentElement) {
    const previous = block.previousElementSibling as HTMLElement | null;
    if (!previous) continue;
    const links = previous.matches('a') ? [previous] : [...previous.querySelectorAll<HTMLElement>('a')];
    if (links.length !== 1 || previous.textContent?.trim() !== links[0].textContent?.trim()) return () => {};
    const reference = links[0].getAttribute('data-href') || links[0].getAttribute('href');
    if (!reference || plugin.resolvePreview(reference, notePath).file !== file) return () => {};
    const alreadyHidden = previous.classList.contains('lec-legacy-preview-heading');
    previous.classList.add('lec-legacy-preview-heading');
    return () => { if (!alreadyHidden) previous.classList.remove('lec-legacy-preview-heading'); };
  }
  return () => {};
}
class PreviewChild extends MarkdownRenderChild {
  private root?: Root;
  private entry?: Entry;
  private dead = false;
  private restoreHeading?: () => void;
  constructor(element: HTMLElement, private plugin: CircuitPlugin, private file: TFile, private options: PreviewOptions, private sourcePath: string) { super(element); }
  private render() {
    if (!this.entry || !this.root) return;
    this.root.render(<Preview entry={this.entry} filename={this.file.basename} path={this.file.path} open={() => { void this.plugin.app.workspace.getLeaf('tab').openFile(this.file); }} />);
  }
  onload() { void this.loadPreview(); }
  private async loadPreview() {
    try {
      const raw = await this.plugin.app.vault.read(this.file); if (this.dead) return;
      this.entry = this.plugin.sessions.acquire(this.file, raw);
      this.containerEl.addClass('lec-editor', 'lec-preview');
      this.containerEl.setCssProps({ '--lec-preview-width': this.options.width });
      this.root = createRoot(this.containerEl); this.render();
      this.restoreHeading = hideLegacyHeading(this.containerEl, this.plugin, this.file, this.sourcePath);
      this.registerEvent(this.plugin.app.vault.on('rename', file => { if (file === this.file && !this.dead) this.render(); }));
      this.registerEvent(this.plugin.app.vault.on('delete', file => {
        if (file === this.file) { this.root?.unmount(); this.root = undefined; this.restoreHeading?.(); this.restoreHeading = undefined; this.containerEl.setText('Circuit file is missing. Repair the preview path to reconnect it.'); }
      }));
    } catch (e) { if (!this.dead) this.containerEl.setText(`Circuit preview unavailable: ${String(e)}`); }
  }
  onunload() { this.dead = true; this.root?.unmount(); this.restoreHeading?.(); if (this.entry) void this.plugin.sessions.release(this.entry); }
}
export function processPreview(plugin: CircuitPlugin, source: string, element: HTMLElement, ctx: MarkdownPostProcessorContext) {
  let options: PreviewOptions;
  try { options = parsePreviewOptions(source); } catch (e) { element.setText(String(e instanceof Error ? e.message : e)); return; }
  let result: ReturnType<CircuitPlugin['resolvePreview']>;
  try { result = plugin.resolvePreview(options.path, ctx.sourcePath); } catch (e) { element.setText(String(e)); return; }
  if (result.file) { ctx.addChild(new PreviewChild(element, plugin, result.file, options, ctx.sourcePath)); return; }
  element.addClass('lec-preview');
  element.createEl('p', { text: result.ambiguous ? `More than one circuit is named ${options.path}. Choose the intended file to repair this preview.` : `Circuit preview missing: ${options.path}` });
  const button = element.createEl('button', { text: 'Find circuit' });
  button.addEventListener('click', () => {
    const hint = ctx.getSectionInfo(element)?.lineStart;
    plugin.openCircuitPicker(file => {
      const note = plugin.app.vault.getFileByPath(ctx.sourcePath);
      if (!note) { new Notice('The source note could not be found. Reopen it and repair this preview.'); return; }
      button.disabled = true;
      void plugin.app.vault.process(note, markdown => repairPreviewReference(markdown, options.path, file.path, hint)).then(() => {
        if (!element.isConnected) return;
        element.empty(); ctx.addChild(new PreviewChild(element, plugin, file, { ...options, path: `/${file.path}` }, ctx.sourcePath));
      }).catch(e => new Notice(`Preview reference could not be updated: ${String(e)}`)).finally(() => { button.disabled = false; });
    });
  });
}
