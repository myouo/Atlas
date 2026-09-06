import { InvalidProviderCredentialError } from "./errors";

const BASE = 76561197960265728n;
const MAX_ACCOUNT = 4294967295n;
export type SteamAccountReference = {
  readonly kind: "steam_id" | "vanity";
  readonly value: string;
};

export function isSteamId64(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{17}$/.test(value) &&
    BigInt(value) > BASE &&
    BigInt(value) <= BASE + MAX_ACCOUNT
  );
}

export function parseSteamAccountReference(input: unknown): SteamAccountReference {
  if (typeof input !== "string") throw new InvalidProviderCredentialError();
  const value = input.trim();
  if (!value || value.length > 512) throw new InvalidProviderCredentialError();
  if (isSteamId64(value)) return { kind: "steam_id", value };
  if (/^\d+$/.test(value)) return accountId(value);
  const steam2 = /^STEAM_[01]:([01]):(\d{1,10})$/i.exec(value);
  if (steam2) return accountId(String(BigInt(steam2[2]!) * 2n + BigInt(steam2[1]!)));
  const steam3 = /^\[U:1:(\d{1,10})\]$/i.exec(value);
  if (steam3) return accountId(steam3[1]!);
  if (/^[a-z0-9_-]{1,64}$/i.test(value)) return { kind: "vanity", value };
  let url: URL;
  try {
    url = new URL(/^(?:www\.)?steamcommunity\.com\//i.test(value) ? `https://${value}` : value);
  } catch {
    throw new InvalidProviderCredentialError();
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    !["steamcommunity.com", "www.steamcommunity.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new InvalidProviderCredentialError();
  const path = /^\/(profiles|id)\/([^/]+)\/?$/.exec(url.pathname);
  if (!path) throw new InvalidProviderCredentialError();
  let identifier: string;
  try {
    identifier = decodeURIComponent(path[2]!);
  } catch {
    throw new InvalidProviderCredentialError();
  }
  if (path[1] === "profiles") {
    if (!isSteamId64(identifier)) throw new InvalidProviderCredentialError();
    return { kind: "steam_id", value: identifier };
  }
  if (!/^[a-z0-9_-]{1,64}$/i.test(identifier)) throw new InvalidProviderCredentialError();
  return { kind: "vanity", value: identifier };
}

function accountId(value: string): SteamAccountReference {
  if (!/^\d{1,10}$/.test(value)) throw new InvalidProviderCredentialError();
  const id = BigInt(value);
  if (id < 1n || id > MAX_ACCOUNT) throw new InvalidProviderCredentialError();
  return { kind: "steam_id", value: String(BASE + id) };
}
