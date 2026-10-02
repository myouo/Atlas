import { elementToSVG } from "dom-to-svg";
import type { NativeSvgCard } from "./native-svg-types";

const SVG_NS = "http://www.w3.org/2000/svg";

export function captureCard(
  element: HTMLElement,
  id: string,
  type: string,
  title: string
): NativeSvgCard {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) throw new Error("Card has no rendered bounds");
  const nodes = [element, ...element.querySelectorAll<HTMLElement>("*")];
  const previousIds = nodes.map((node) => node.getAttribute("id"));
  const previousBackgrounds = nodes.map((node) => node.style.backgroundImage);
  const pseudoStyle = document.createElement("style");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Color conversion is unavailable");
  const converted = new Map<string, string>();
  const normalize = (value: string) =>
    value.replace(/\b(?:oklab|oklch|color)\([^()]*\)/g, (color) => {
      if (!converted.has(color)) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        converted.set(color, `rgba(${r}, ${g}, ${b}, ${(a ?? 255) / 255})`);
      }
      return converted.get(color)!;
    });
  try {
    const rules: string[] = [];
    nodes.forEach((node, index) => {
      node.id = `capture-${id}-${index}`;
      const background = getComputedStyle(node).backgroundImage;
      if (/oklab|oklch|color\(/.test(background))
        node.style.backgroundImage = normalize(background);
      for (const pseudo of ["before", "after"]) {
        const background = getComputedStyle(node, `::${pseudo}`).backgroundImage;
        if (/oklab|oklch|color\(/.test(background))
          rules.push(`#${node.id}::${pseudo}{background-image:${normalize(background)}!important}`);
      }
    });
    pseudoStyle.textContent = rules.join("\n");
    document.head.appendChild(pseudoStyle);
    const svg = elementToSVG(element);
    // Preserve the browser's paint order for transformed auto layers and positive z-index children.
    for (const group of svg.querySelectorAll<SVGGElement>('g[data-stacking-context="true"]')) {
      const positive = [...group.children].find(
        (child) =>
          child.getAttribute("data-stacking-layer") ===
          "childStackingContextsWithPositiveStackLevels"
      );
      if (positive) group.appendChild(positive);
    }
    for (const node of nodes) {
      const group = svg.getElementById(node.id);
      if (!group) continue;
      const bounds = node.getBoundingClientRect();
      const rawRadius = getComputedStyle(node).borderTopLeftRadius;
      const radius = Math.min(
        parseFloat(rawRadius) * (rawRadius.endsWith("%") ? bounds.width / 100 : 1) || 0,
        bounds.width / 2,
        bounds.height / 2
      );
      for (const mask of [...group.children].filter((child) => child.localName === "mask")) {
        for (const box of mask.children)
          if (box.localName === "rect") {
            box.setAttribute("rx", String(radius));
            box.setAttribute("ry", String(radius));
          }
      }
    }
    return {
      id,
      type,
      title,
      width: rect.width,
      height: rect.height,
      svg: new XMLSerializer().serializeToString(svg),
      background: {
        color: getComputedStyle(element).backgroundColor,
        radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
      }
    };
  } finally {
    pseudoStyle.remove();
    nodes.forEach((node, index) => {
      const previous = previousIds[index];
      if (previous === null || previous === undefined) node.removeAttribute("id");
      else node.id = previous;
      node.style.backgroundImage = previousBackgrounds[index] ?? "";
    });
  }
}

export function finishCard(
  card: NativeSvgCard,
  assets: Record<string, string>,
  backdrop: string | null,
  theme: "light" | "dark",
  style: "soft" | "vinyl"
) {
  const document = new DOMParser().parseFromString(card.svg, "image/svg+xml");
  const root = document.documentElement;
  if (document.querySelector("parsererror")) throw new Error("Invalid captured SVG");
  if (card.background) {
    const viewBox = (root.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
    const surface = document.createElementNS(SVG_NS, "rect");
    surface.setAttribute("x", String(viewBox[0] ?? 0));
    surface.setAttribute("y", String(viewBox[1] ?? 0));
    surface.setAttribute("width", String(card.width));
    surface.setAttribute("height", String(card.height));
    surface.setAttribute("rx", String(card.background.radius));
    surface.setAttribute("fill", card.background.color);
    root.insertBefore(surface, root.firstChild);
  }
  for (const image of root.querySelectorAll<SVGImageElement>("image")) {
    const url = image.getAttribute("xlink:href") ?? image.getAttribute("href");
    if (!url || url.startsWith("data:")) continue;
    const embedded = assets[url];
    if (!embedded) throw new Error("A rendered artwork was not embedded");
    image.removeAttribute("xlink:href");
    image.setAttribute("href", embedded);
  }
  if (backdrop) {
    const viewBox = (root.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
    const image = document.createElementNS(SVG_NS, "image");
    image.setAttribute("x", String(viewBox[0] ?? 0));
    image.setAttribute("y", String(viewBox[1] ?? 0));
    image.setAttribute("width", String(card.width));
    image.setAttribute("height", String(card.height));
    image.setAttribute("href", backdrop);
    if (theme === "dark") image.setAttribute("opacity", "0.18");
    root.insertBefore(image, root.firstChild);
  }
  normalizeSvgColors(root);
  if (theme === "dark") applyDarkPalette(root, style);
  for (const text of root.querySelectorAll("text")) {
    const fill = text.getAttribute("fill");
    if (fill) for (const span of text.querySelectorAll("tspan")) span.setAttribute("fill", fill);
  }
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-style", style);
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", card.title);
  const ids = new Map<string, string>();
  for (const element of root.querySelectorAll("[id]")) {
    const original = element.id;
    const replacement = `${card.id}-${original}`;
    ids.set(original, replacement);
    element.id = replacement;
  }
  for (const element of root.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      let value = attribute.value.replace(
        /url\(#([^)]*)\)/g,
        (_, id: string) => `url(#${ids.get(id) ?? id})`
      );
      if ((attribute.name === "href" || attribute.name === "xlink:href") && value.startsWith("#"))
        value = `#${ids.get(value.slice(1)) ?? value.slice(1)}`;
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
  }
  for (const element of root.querySelectorAll("script,foreignObject,iframe")) element.remove();
  for (const element of root.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (
        attribute.name.startsWith("data-") ||
        attribute.name.startsWith("aria-") ||
        attribute.name === "class"
      )
        element.removeAttribute(attribute.name);
    }
  }
  return { ...card, svg: new XMLSerializer().serializeToString(document) };
}

function applyDarkPalette(root: Element, style: "soft" | "vinyl") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Color conversion is unavailable");
  for (const element of root.querySelectorAll("*")) {
    if (element.closest("mask,clipPath,filter") || element.localName === "image") continue;
    const icon = element.closest("svg") !== root;
    for (const attribute of ["fill", "stroke", "stop-color", "color"]) {
      const color = element.getAttribute(attribute);
      if (!color || /url\(|none|currentColor/i.test(color)) continue;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, alpha = 255] = context.getImageData(0, 0, 1, 1).data;
      const text =
        element.localName === "text" || element.localName === "tspan" || attribute === "color";
      let converted: readonly number[] | null = null;
      if (text && Math.max(r, g, b) < 190)
        converted =
          r > g * 1.4
            ? [255, 148, 171]
            : (r + g + b) / 3 > 85
              ? [164, 184, 210]
              : style === "vinyl"
                ? [237, 226, 214]
                : [222, 234, 255];
      else if (!text && !icon && Math.min(r, g, b) > 195)
        converted = r > g * 1.08 ? [72, 37, 52] : style === "vinyl" ? [35, 31, 37] : [23, 37, 58];
      if (converted) element.setAttribute(attribute, `rgba(${converted.join(",")},${alpha / 255})`);
    }
  }
}

function normalizeSvgColors(root: Element) {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Color conversion is unavailable");
  for (const element of root.querySelectorAll("*"))
    for (const attribute of ["fill", "stroke", "stop-color", "color"]) {
      const value = element.getAttribute(attribute);
      if (!value || !/(?:oklab|oklch|color|var)\(/.test(value)) continue;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 255] = context.getImageData(0, 0, 1, 1).data;
      element.setAttribute(attribute, `rgba(${r},${g},${b},${a / 255})`);
    }
}
