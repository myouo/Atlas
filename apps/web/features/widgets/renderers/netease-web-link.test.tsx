import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NeteaseWebLink } from "./netease-web-link";

describe("NeteaseWebLink", () => {
  it("renders only official NetEase HTTPS destinations", () => {
    const { rerender } = render(
      <NeteaseWebLink href="https://music.163.com/song?id=20001" label="打开歌曲">
        Song
      </NeteaseWebLink>
    );
    expect(screen.getByRole("link", { name: "打开歌曲" })).toHaveAttribute(
      "href",
      "https://music.163.com/song?id=20001"
    );

    rerender(
      <NeteaseWebLink href="orpheus://song/20001" label="打开客户端">
        Deep link
      </NeteaseWebLink>
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    rerender(
      <NeteaseWebLink href="https://example.invalid/song?id=20001" label="外部站点">
        Unsafe host
      </NeteaseWebLink>
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
