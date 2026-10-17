export const SVG_STYLES = ["soft", "vinyl"] as const;
export const SVG_THEMES = ["light", "dark"] as const;

export type SvgStyle = (typeof SVG_STYLES)[number];
export type SvgTheme = (typeof SVG_THEMES)[number];

export function svgAppearance(options: URLSearchParams) {
  const style: SvgStyle = options.get("style") === "vinyl" ? "vinyl" : "soft";
  const requested = options.get("theme");
  const theme: SvgTheme =
    requested === "light" || requested === "dark"
      ? requested
      : style === "vinyl"
        ? "dark"
        : "light";
  return { style, theme };
}
