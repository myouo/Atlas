import type { NativeSvgCard } from "./native-svg-types";
import { svgAppearance } from "./svg-theme";
import { escapeXml } from "./svg-utils";

export interface PublishedWidget {
  readonly data: unknown;
  readonly enabled: boolean;
  readonly id: string;
  readonly schemaVersion: number;
  readonly stale: boolean;
  readonly title: string;
  readonly type: string;
  readonly provider?: string;
  readonly updatedAt?: string | null;
}

export function widgetProvider(widget: PublishedWidget) {
  if (widget.provider && widget.provider !== "fixture") return widget.provider;
  const parts = widget.type.split(".");
  return (parts[0] === "music" ? parts[1] : parts[0]) || "unknown";
}

export function composeNativeSvg(
  title: string,
  cards: readonly NativeSvgCard[],
  options: URLSearchParams
) {
  if (!cards.length) throw new Error("No Web cards are available");
  const { style, theme } = svgAppearance(options);
  const gap = 16;
  const width = Math.max(...cards.map((card) => card.width));
  const height = cards.reduce((sum, card) => sum + card.height, 0) + gap * (cards.length - 1);
  let offset = 0;
  const contents = cards
    .map((card) => {
      const x = (width - card.width) / 2;
      const body = card.svg
        .replace(/^<\?xml[^>]*>\s*/, "")
        .replace(/<svg\b/, `<svg x="${x}" y="${offset}"`);
      offset += card.height + gap;
      if (!card.background || card.background.radius <= 0) return body;
      const clipId = `export-bounds-${card.id}`;
      return `<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${offset - card.height - gap}" width="${card.width}" height="${card.height}" rx="${card.background.radius}"/></clipPath></defs><g clip-path="url(#${clipId})">${body}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-style="${style}" data-theme="${theme}"><title>${escapeXml(title)}</title>${contents}</svg>`;
}
