import type { OAuthIdentityProvider } from "@nivalis/application";

interface GitHubOAuthOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export class WorkerGitHubOAuthClient implements OAuthIdentityProvider {
  constructor(private readonly options: GitHubOAuthOptions) {}

  createAuthorizationUrl(input: { readonly codeChallenge: string; readonly state: string }) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", this.options.redirectUri);
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  async exchangeCode(input: { readonly code: string; readonly codeVerifier: string }) {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        code: input.code,
        code_verifier: input.codeVerifier,
        redirect_uri: this.options.redirectUri
      }),
      headers: { accept: "application/json" },
      method: "POST"
    });
    if (!tokenResponse.ok) throw new Error("GitHub token exchange failed.");
    const token: unknown = await tokenResponse.json();
    const accessToken = objectString(token, "access_token");

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${accessToken}`,
        "user-agent": "Nivalis",
        "x-github-api-version": "2026-03-10"
      }
    });
    if (!userResponse.ok) throw new Error("GitHub identity request failed.");
    const user: unknown = await userResponse.json();
    if (!isObject(user) || !(typeof user.id === "number" || typeof user.id === "string")) {
      throw new Error("GitHub identity response omitted its stable id.");
    }
    return { provider: "github" as const, subject: String(user.id) };
  }
}

function objectString(value: unknown, key: string) {
  if (!isObject(value) || typeof value[key] !== "string" || value[key].length === 0) {
    throw new Error("GitHub OAuth response was invalid.");
  }
  return value[key];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
