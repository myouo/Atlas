import { ProviderSchemaMismatchError } from "@nivalis/domain";
import Value from "typebox/value";
import type { Static, TSchema } from "typebox";

import { NeteaseClient } from "./netease-client";
import {
  NeteaseAccountResponseSchema,
  NeteaseProfileMusicCardsResponseSchema,
  NeteaseSongDetailResponseSchema
} from "./schemas/provider-schemas";

export interface NeteaseMusicCardProbeItem {
  readonly artists: readonly string[];
  readonly position: number;
  readonly resourceType: string;
  readonly subtitle: string | null;
  readonly title: string;
}

export interface NeteaseMusicCardsProbeResult {
  readonly cardLimit: number;
  readonly cards: readonly NeteaseMusicCardProbeItem[];
  readonly open: boolean;
  readonly songDetailsResolved: number;
}

export async function probeNeteaseMusicCards(
  client: NeteaseClient,
  credential: string
): Promise<NeteaseMusicCardsProbeResult> {
  const account = checked(
    NeteaseAccountResponseSchema,
    await client.getAccount(credential),
    "netease.account"
  );
  const userId = String(account.profile?.userId ?? account.account.id);
  const exhibition = checked(
    NeteaseProfileMusicCardsResponseSchema,
    await client.getProfileMusicCards(credential, userId),
    "netease.profile_music_cards"
  );
  const songIds = [
    ...new Set(
      exhibition.data.cardVOList.flatMap((card) =>
        (card.resType === "song" || card.resType === "latest_heart_song") &&
        /^\d+$/.test(card.resId)
          ? [card.resId]
          : []
      )
    )
  ];
  const details =
    songIds.length === 0
      ? { code: 200 as const, songs: [] }
      : checked(
          NeteaseSongDetailResponseSchema,
          await client.getSongDetails(credential, songIds),
          "netease.music_card_tracks"
        );
  const artistsByTrack = new Map(
    details.songs.map((song) => [String(song.id), song.ar.map((artist) => artist.name)])
  );
  const unresolved = songIds.filter((id) => !artistsByTrack.has(id));
  if (unresolved.length > 0) {
    throw new Error(
      `NetEase returned no song detail for ${unresolved.length} exhibition card(s). No subtitle was fabricated.`
    );
  }

  return {
    cardLimit: exhibition.data.cardLimit,
    cards: exhibition.data.cardVOList.map((card, position) => {
      const artists = artistsByTrack.get(card.resId) ?? [];
      return {
        artists,
        position,
        resourceType: card.resType,
        subtitle: card.resType === "song" ? artists.join(" / ") || null : null,
        title: card.name
      };
    }),
    open: exhibition.data.open,
    songDetailsResolved: details.songs.length
  };
}

function checked<TSchemaValue extends TSchema>(
  schema: TSchemaValue,
  value: unknown,
  sourceKind: string
): Static<TSchemaValue> {
  if (!Value.Check(schema, value)) throw new ProviderSchemaMismatchError(sourceKind);
  return value as Static<TSchemaValue>;
}
