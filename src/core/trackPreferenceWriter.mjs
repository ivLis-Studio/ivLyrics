const writersByStore = new WeakMap();

export function getTrackPreferenceWriter(store) {
  let write = writersByStore.get(store);
  if (!write) {
    write = createTrackPreferenceWriter();
    writersByStore.set(store, write);
  }
  return write;
}

export function createTrackPreferenceWriter() {
  const pending = new Map();
  return async (uri, save, apply) => {
    const queue = pending.get(uri) ?? { tail: null, apply: null };
    const write = (queue.tail?.catch(() => {}) ?? Promise.resolve()).then(async () => {
      await save();
      queue.apply = apply;
    });
    queue.tail = write;
    pending.set(uri, queue);
    let saved = false;
    try {
      await write;
      saved = true;
    } finally {
      if (queue.tail === write) {
        pending.delete(uri);
        queue.apply?.(saved);
      }
    }
  };
}
