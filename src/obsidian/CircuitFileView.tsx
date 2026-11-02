import { Notice, TextFileView, type TFile, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '../editor/ui/Editor';
import { serializeDocument } from '../core/model/document';
import type CircuitPlugin from '../main';
import type { Entry } from './VaultPersistence';
export const VIEW_TYPE = 'logic-electric-circuit-builder-view';
export class CircuitFileView extends TextFileView {
  private root?: Root;
  entry?: Entry;
  private raw = '';
  private unsubscribe?: () => void;
  private owner?: Document;
  constructor(leaf: WorkspaceLeaf, private plugin: CircuitPlugin) {
    super(leaf); this.contentEl.addClass('lec-host-view');
    this.registerEvent(plugin.app.workspace.on('layout-change', () => {
      if (this.entry && this.root && this.contentEl.ownerDocument !== this.owner) { this.root.unmount(); this.mount(this.entry); }
    }));
  }
  private mount(entry: Entry) {
    this.owner = this.contentEl.ownerDocument; this.root = createRoot(this.contentEl);
    this.root.render(<Editor key={entry.file.path} session={entry.session} save={entry.save} host={this.plugin.editorHost(entry.file)} />);
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? this.plugin.manifest.name; }
  getIcon() { return 'circuit-board'; }
  getViewData() { return this.entry ? serializeDocument(this.entry.session.getSnapshot().document) : this.raw; }
  setViewData(data: string, clear: boolean) {
    this.raw = data;
    if (!clear && this.entry && this.entry.file === this.file) { void this.entry.save.externalChanged(data); return; }
    this.clear(); this.raw = data;
    if (!this.file) return;
    try {
      this.entry = this.plugin.sessions.acquire(this.file, data);
      const entry = this.entry;
      this.unsubscribe = entry.session.subscribe(() => { this.data = this.getViewData(); });
      this.mount(entry);
    } catch (e) { this.showRecovery(data, e); }
  }
  private showRecovery(raw: string, error: unknown) {
    const panel = this.contentEl.createDiv({ cls: 'lec-recovery' });
    panel.createEl('h2', { text: 'Circuit could not be opened safely' });
    panel.createEl('p', { text: error instanceof Error ? error.message : String(error) });
    panel.createEl('p', { text: 'The original file is preserved. Saving is disabled for this view. Copy the raw content or save a separate recovery file.' });
    const textarea = panel.createEl('textarea'); textarea.value = raw; textarea.readOnly = true; textarea.setAttribute('aria-label', 'Original circuit content');
    const button = panel.createEl('button', { text: 'Save raw recovery copy' }); button.addEventListener('click', () => { void this.plugin.saveRawCopy(this.file, raw).catch(e => new Notice(String(e))); });
  }
  async save(clear = false) { if (this.entry) await this.entry.save.flush(); if (clear) this.clear(); }
  async onUnloadFile(_file: TFile) { await this.save(); this.clear(); }
  clear() {
    this.unsubscribe?.(); this.unsubscribe = undefined; this.root?.unmount(); this.root = undefined;
    const entry = this.entry; this.entry = undefined; if (entry) void this.plugin.sessions.release(entry);
    this.contentEl.empty(); this.raw = '';
  }
  async onClose() { await this.save(); this.clear(); }
}
