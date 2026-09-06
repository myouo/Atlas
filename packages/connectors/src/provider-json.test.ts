import { describe, expect, it } from "vitest";
import { parseProviderJson, readProviderJson } from "./provider-json";

describe("Provider JSON precision", () => {
  it("preserves large IDs before JavaScript rounds them", () => {
    expect(
      parseProviderJson(
        '{"picId":9007199254740993,"nested":[9223372036854775807,-9007199254740993,1e400],"count":20,"ratio":1.25}'
      )
    ).toEqual({
      picId: "9007199254740993",
      nested: ["9223372036854775807", "-9007199254740993", "1e400"],
      count: 20,
      ratio: 1.25
    });
  });
  it("preserves escaped strings and rejects malformed JSON", () => {
    expect(parseProviderJson('{"text":"\\\"9007199254740993","id":9007199254740993}')).toEqual({
      text: '\"9007199254740993',
      id: "9007199254740993"
    });
    expect(() => parseProviderJson("{9007199254740993:0}")).toThrow();
    expect(() => parseProviderJson("[01,9007199254740993]")).toThrow();
  });
  it("limits streamed response size", async () => {
    await expect(readProviderJson(new Response('{"picId":9007199254740993}'))).resolves.toEqual({
      picId: "9007199254740993"
    });
    await expect(readProviderJson(new Response(" ".repeat(100)), 50)).rejects.toThrow("byte limit");
  });
});
