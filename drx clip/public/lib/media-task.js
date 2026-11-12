// Each job owns a worker; terminating it also releases decoder/encoder resources.
export function abortError() { return new DOMException('Proceso cancelado.', 'AbortError'); }
export function runMediaTask(task, payload, { signal, onProgress, onMode, stallMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    let worker, timer, finished = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker?.terminate(); };
    const finish = (error, result) => { if (finished) return; finished = true; cleanup(); error ? reject(error) : resolve(result); };
    const cancel = () => finish(abortError());
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => finish(new Error('El procesamiento dejó de avanzar. Prueba otro formato o vuelve a intentarlo.')), stallMs); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      worker = new Worker(new URL('./media-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') { arm(); onProgress?.(data.value); }
        else if (data.type === 'mode') { arm(); onMode?.(data.value); }
        else if (data.type === 'done') finish(null, data.result);
        else if (data.type === 'error') { const error = new Error(data.message); error.code = data.code; finish(error); }
      };
      worker.onerror = event => { event.preventDefault(); const error = new Error('No se pudo iniciar el procesamiento del video.'); error.code = 'unsupported'; finish(error); };
      arm(); worker.postMessage({ task, ...payload });
    } catch (cause) { const error = new Error(cause.message || 'El navegador no permite iniciar el procesamiento rápido.'); error.code = 'unsupported'; finish(error); }
  });
}
