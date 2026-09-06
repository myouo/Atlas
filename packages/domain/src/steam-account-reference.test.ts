import { describe, expect, it } from "vitest";
import { parseSteamAccountReference } from "./steam-account-reference";

describe("Steam account references", () => {
  it.each([
    "76561198000000001",
    " 76561198000000001 ",
    "39734273",
    "STEAM_0:1:19867136",
    "[U:1:39734273]",
    "https://steamcommunity.com/profiles/76561198000000001/",
    "steamcommunity.com/profiles/76561198000000001/?l=schinese"
  ])("normalizes a numeric account reference: %s", (value) => {
    expect(parseSteamAccountReference(value)).toEqual({
      kind: "steam_id",
      value: "76561198000000001"
    });
  });
  it.each([
    "fixture_user",
    "https://steamcommunity.com/id/fixture_user/",
    "http://www.steamcommunity.com/id/fixture_user?l=schinese",
    "steamcommunity.com/id/fixture_user/#profile"
  ])("accepts a vanity profile reference: %s", (value) =>
    expect(parseSteamAccountReference(value)).toEqual({ kind: "vanity", value: "fixture_user" })
  );
  it.each([
    "",
    "0",
    "76561197960265728",
    "4294967296",
    "[U:1:0]",
    "显示昵称",
    "https://example.com/id/foo",
    "https://steamcommunity.com.evil.test/id/foo",
    "https://user@steamcommunity.com/id/foo",
    "https://steamcommunity.com:444/id/foo",
    "https://steamcommunity.com/groups/foo",
    "https://steamcommunity.com/profiles/123",
    76561198000000001
  ])("rejects an invalid or ambiguous reference: %s", (value) =>
    expect(() => parseSteamAccountReference(value)).toThrow()
  );
});
