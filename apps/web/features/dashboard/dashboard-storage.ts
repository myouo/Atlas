import type { PersistStorage, StorageValue } from "zustand/middleware";

interface SnapshotState {
  readonly draft: unknown;
  readonly published: unknown;
}

export function createDashboardStorage<S extends SnapshotState>(): PersistStorage<S> {
  let draft: unknown;
  let published: unknown;
  let generation: string | null = null;
  let lastMetadata: string | null = null;

  return {
    getItem(name) {
      if (typeof window === "undefined") return null;
      const stored = localStorage.getItem(name);
      if (!stored) return null;
      const base = JSON.parse(stored) as StorageValue<S> & { generation?: string };
      const sidecar = localStorage.getItem(`${name}.ui`);
      if (sidecar && base.generation) {
        try {
          const metadata = JSON.parse(sidecar) as { generation: string; state: Partial<S> };
          if (metadata.generation === base.generation) {
            base.state = {
              ...base.state,
              ...metadata.state,
              draft: base.state.draft,
              published: base.state.published
            };
          }
        } catch {
          // A broken UI preference must not hide a valid persisted draft.
        }
      }
      draft = base.state.draft;
      published = base.state.published;
      generation = base.generation ?? null;
      return base;
    },
    setItem(name, value) {
      if (typeof window === "undefined") return;
      const { draft: nextDraft, published: nextPublished, ...state } = value.state;
      const baseExists = Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.key(index)
      ).includes(name);
      if (generation && baseExists && nextDraft === draft && nextPublished === published) {
        const metadata = JSON.stringify({ generation, state });
        if (metadata !== lastMetadata) localStorage.setItem(`${name}.ui`, metadata);
        lastMetadata = metadata;
        return;
      }
      const nextGeneration = crypto.randomUUID();
      localStorage.setItem(name, JSON.stringify({ ...value, generation: nextGeneration }));
      localStorage.removeItem(`${name}.ui`);
      draft = nextDraft;
      published = nextPublished;
      generation = nextGeneration;
      lastMetadata = JSON.stringify({ generation, state });
    },
    removeItem(name) {
      if (typeof window === "undefined") return;
      localStorage.removeItem(name);
      localStorage.removeItem(`${name}.ui`);
      generation = null;
      lastMetadata = null;
      draft = undefined;
      published = undefined;
    }
  };
}
