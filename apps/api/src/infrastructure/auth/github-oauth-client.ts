import type { OAuthIdentityProvider } from "@nivalis/application";

export interface GitHubOAuthClientOptions {
  readonly apiBaseUrl?: string;
  readonly authorizationBaseUrl?: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly timeoutMs: number;
}

export class GitHubOAuthClient implements OAuthIdentityProvider {
  private readonly apiBaseUrl: string;
  private readonly authorizationBaseUrl: string;

  constructor(
    private readonly options: GitHubOAuthClientOptions,
    private readonly fetcher: typeof fetch = fetch
  ) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";
    this.authorizationBaseUrl = options.authorizationBaseUrl ?? "https://github.com";
  }

  createAuthorizationUrl(input: { readonly codeChallenge: string; readonly state: string }) {
    const url = new URL("/login/oauth/authorize", this.authorizationBaseUrl);
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", this.options.redirectUri);
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  async exchangeCode(input: { readonly code: string; readonly codeVerifier: string }) {
    const token = await this.fetchJson(
      new URL("/login/oauth/access_token", this.authorizationBaseUrl),
      {
        body: new URLSearchParams({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          code: input.code,
          code_verifier: input.codeVerifier,
          redirect_uri: this.options.redirectUri
        }),
        headers: { accept: "application/json" },
        method: "POST"
      }
    );
    const accessToken = requiredString(token, "access_token");
    const user = await this.fetchJson(new URL("/user", this.apiBaseUrl), {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${accessToken}`,
        "x-github-api-version": "2026-03-10"
      }
    });
    const id = user.id;
    if (!(typeof id === "number" || typeof id === "string")) {
      throw new Error("GitHub user response omitted stable id.");
    }
    return { provider: "github" as const, subject: String(id) };
  }

  private async fetchJson(url: URL, init: RequestInit) {
    const signal = AbortSignal.timeout(this.options.timeoutMs);
    const response = await this.fetcher(url, { ...init, signal });
    if (!response.ok) throw new Error("GitHub OAuth request failed.");
    const value: unknown = await response.json();
    if (!isObject(value)) throw new Error("GitHub OAuth response was invalid.");
    return value;
  }
}

export class FixtureGitHubOAuthClient implements OAuthIdentityProvider {
  constructor(
    private readonly callbackUrl: string,
    private readonly ownerSubject: string
  ) {}

  createAuthorizationUrl(input: { readonly codeChallenge: string; readonly state: string }) {
    void input.codeChallenge;
    const url = new URL(this.callbackUrl);
    url.searchParams.set("code", "fixture-owner");
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  async exchangeCode(input: { readonly code: string }) {
    await Promise.resolve();
    return {
      provider: "github" as const,
      subject: input.code === "fixture-viewer" ? `${this.ownerSubject}-viewer` : this.ownerSubject
    };
  }
}

function requiredString(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  if (typeof candidate !== "string" || !candidate)
    throw new Error("GitHub OAuth response invalid.");
  return candidate;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
