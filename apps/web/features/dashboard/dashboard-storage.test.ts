import { beforeEach, describe, expect, it } from "vitest";
import { createDashboardStorage } from "./dashboard-storage";

const key = "nivalis.storage.test";
const snapshot = { widgets: [{ id: "one", data: "history".repeat(30_000) }] };
const state = { draft: snapshot, published: snapshot, mode: "display", dirty: false };

beforeEach(() => localStorage.clear());

describe("dashboard snapshot storage", () => {
  it("restores legacy snapshots without losing their draft", async () => {
    localStorage.setItem(key, JSON.stringify({ state, version: 3 }));
    expect(await createDashboardStorage<typeof state>().getItem(key)).toEqual({
      state,
      version: 3
    });
  });

  it("persists view changes separately and restores the complete snapshot after reload", async () => {
    const storage = createDashboardStorage<typeof state>();
    storage.setItem(key, { state, version: 3 });
    const before = localStorage.getItem(key);
    storage.setItem(key, { state: { ...state, mode: "edit" }, version: 3 });
    expect(localStorage.getItem(key)).toBe(before);
    expect(localStorage.getItem(`${key}.ui`)!.length).toBeLessThan(500);
    const restored = await createDashboardStorage<typeof state>().getItem(key);
    expect(restored?.state).toEqual({ ...state, mode: "edit" });
  });

  it("never overlays stale UI state onto a newer draft snapshot", async () => {
    const storage = createDashboardStorage<typeof state>();
    storage.setItem(key, { state, version: 3 });
    storage.setItem(key, { state: { ...state, mode: "edit" }, version: 3 });
    const oldMetadata = localStorage.getItem(`${key}.ui`)!;
    const changed = { ...state, draft: { widgets: [{ id: "one", data: "changed" }] }, dirty: true };
    storage.setItem(key, { state: changed, version: 3 });
    localStorage.setItem(`${key}.ui`, oldMetadata);
    expect((await createDashboardStorage<typeof state>().getItem(key))?.state).toEqual(changed);
  });

  it("clears both persisted layers and handles storage cleared outside the adapter", async () => {
    const storage = createDashboardStorage<typeof state>();
    storage.setItem(key, { state, version: 3 });
    localStorage.clear();
    storage.setItem(key, { state: { ...state, mode: "edit" }, version: 3 });
    expect((await storage.getItem(key))?.state.mode).toBe("edit");
    storage.removeItem(key);
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(`${key}.ui`)).toBeNull();
  });
});
