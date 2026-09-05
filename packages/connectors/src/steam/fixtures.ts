export const steamFixtureId = "76561198000000001";
export type SteamFixtureScenario =
  "normal" | "private" | "empty" | "hidden_playtime" | "rate_limit" | "invalid_key";

export function createSteamFixtureFetcher(scenario: SteamFixtureScenario = "normal"): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== "https://api.steampowered.com")
      throw new Error("Unexpected Steam fixture host.");
    if (scenario === "invalid_key") return new Response("Rejected", { status: 403 });
    if (scenario === "rate_limit")
      return new Response("Limited", { status: 429, headers: { "retry-after": "2" } });
    if (url.pathname.includes("GetPlayerSummaries"))
      return Response.json({
        response: {
          players: [
            {
              steamid: steamFixtureId,
              personaname: "Steam Fixture",
              communityvisibilitystate: scenario === "private" ? 1 : 3,
              personastate: 1,
              avatarfull: "https://avatars.steamstatic.com/fixture.jpg",
              realname: "Not for public disclosure",
              loccountrycode: "XX"
            }
          ]
        }
      });
    if (url.pathname.includes("GetSteamLevel"))
      return Response.json({ response: { player_level: 12 } });
    const games =
      scenario === "empty"
        ? []
        : [
            {
              appid: 10,
              name: "Fixture Game A",
              img_icon_url: "b".repeat(40),
              ...(scenario === "hidden_playtime"
                ? {}
                : { playtime_forever: 125, playtime_2weeks: 20 })
            },
            {
              appid: 20,
              name: "Fixture Game B",
              img_icon_url: "c".repeat(40),
              ...(scenario === "hidden_playtime" ? {} : { playtime_forever: 0, playtime_2weeks: 0 })
            }
          ];
    if (url.pathname.includes("GetOwnedGames"))
      return Response.json({ response: { game_count: games.length, games } });
    if (url.pathname.includes("GetRecentlyPlayedGames"))
      return Response.json({ response: { total_count: games.length, games } });
    throw new Error("Unexpected Steam fixture method.");
  };
}
