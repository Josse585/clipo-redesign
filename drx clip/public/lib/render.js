import { LegacyClipRenderer, pickMimeType, extensionFor } from './render-legacy.js';
import { runMediaTask } from './media-task.js';
export { pickMimeType, extensionFor };
export function canRenderVideo() { return (typeof Worker !== 'undefined' && typeof VideoEncoder !== 'undefined') || Boolean(pickMimeType()); }
export class ClipRenderer {
  constructor(file) { this.file = file; this.legacy = null; this.controller = new AbortController(); this.useLegacy = false; }
  async ready() { /* Input and codec checks happen inside the worker, without playing the file. */ }
  dispose() { this.controller.abort(); this.legacy?.dispose(); }
  async render(clip, captions, options = {}) {
    const signal = options.signal || this.controller.signal;
    if (!this.useLegacy) {
      try {
        return await runMediaTask('render', { file: this.file, clip, captions, options: { width: options.width, height: options.height, layout: options.layout, watermarkText: options.watermarkText, showCaptions: options.showCaptions } }, { signal, onProgress: options.onProgress, onMode: options.onMode });
      } catch (error) {
        if (error.name === 'AbortError' || signal.aborted) throw error;
        // A codec failure is recoverable. Timeouts are also surfaced through a bounded fallback.
        if (!pickMimeType()) throw error;
        this.useLegacy = true;
        options.onMode?.('compatibility'); options.onProgress?.(0);
      }
    }
    options.onMode?.('compatibility');
    this.legacy ||= new LegacyClipRenderer(this.file);
    return this.legacy.render(clip, captions, { ...options, signal });
  }
}
