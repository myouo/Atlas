import { expect, it } from "vitest";
import { composeNativeSvg } from "./svg-renderer";

it("composes original Web SVGs without resizing their layout or replacing their images", () => {
  const card = {
    id: "ranking",
    type: "music.netease.ranking",
    title: "听歌双榜",
    width: 668,
    height: 305,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="668" height="305" viewBox="53 129 668 305"><text>原卡片</text><image href="data:image/png;base64,aW1hZ2U=" width="28" height="28"/></svg>'
  };
  const svg = composeNativeSvg(
    "Nivalis & <Music>",
    [card, { ...card, id: "calendar", width: 667, height: 260 }],
    new URLSearchParams("theme=dark")
  );
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(document.querySelector("parsererror")).toBeNull();
  expect(document.documentElement.getAttribute("height")).toBe("581");
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  const nested = document.documentElement.querySelectorAll(":scope > svg");
  expect(nested[0]?.getAttribute("viewBox")).toBe("53 129 668 305");
  expect(nested[1]?.getAttribute("y")).toBe("321");
  expect(document.querySelectorAll("image")).toHaveLength(2);
  expect(svg).toContain("Nivalis &amp; &lt;Music&gt;");
});
