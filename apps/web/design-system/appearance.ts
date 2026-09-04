export type AppearanceAccent = "blue" | "lilac" | "rose";
export type AppearanceGlass = "balanced" | "strong" | "subtle";

export interface AppearanceSettings {
  readonly accent: AppearanceAccent;
  readonly glass: AppearanceGlass;
  readonly rotation: boolean;
}

export const appearanceStorageKey = "nivalis.appearance.phase1.v1";

const accents: readonly AppearanceAccent[] = ["blue", "lilac", "rose"];
const glassLevels: readonly AppearanceGlass[] = ["balanced", "strong", "subtle"];

export function readAppearanceSettings(): AppearanceSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(appearanceStorageKey) ?? "null"
    ) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const settings = value as Record<string, unknown>;
    if (!accents.includes(settings.accent as AppearanceAccent)) return null;
    if (!glassLevels.includes(settings.glass as AppearanceGlass)) return null;
    return {
      accent: settings.accent as AppearanceAccent,
      glass: settings.glass as AppearanceGlass,
      rotation: settings.rotation === true
    };
  } catch {
    return null;
  }
}

export function applyAppearanceSettings(settings: Pick<AppearanceSettings, "accent" | "glass">) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.accent = settings.accent;
  document.documentElement.dataset.glass = settings.glass;
}

export function saveAppearanceSettings(settings: AppearanceSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(appearanceStorageKey, JSON.stringify(settings));
  applyAppearanceSettings(settings);
}
