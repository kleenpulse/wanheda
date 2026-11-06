// The wasm memory a worker holds (ADR-0012: it only grows, so the speech
// worker is recycled past a limit). ONNX Runtime's threaded build creates its
// heap with `new WebAssembly.Memory`, so wrapping that constructor sees it.
// Import this module before the runtime, in the worker only.

const memories: WeakRef<WebAssembly.Memory>[] = [];

const tracked = new Proxy(WebAssembly.Memory, {
  construct(target, args: [WebAssembly.MemoryDescriptor], newTarget) {
    const memory = Reflect.construct(target, args, newTarget) as WebAssembly.Memory;
    memories.push(new WeakRef(memory));
    return memory;
  },
});
Object.assign(WebAssembly, { Memory: tracked });

/** Bytes of wasm memory alive in this worker. */
export function wasmBytes(): number {
  let total = 0;
  for (const ref of memories) total += ref.deref()?.buffer.byteLength ?? 0;
  return total;
}
