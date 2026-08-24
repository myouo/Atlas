import { describe, expect, it, vi } from "vitest";

import { onRequest } from "./[[path]]";

describe("Pages same-origin API proxy", () => {
  it("removes the /api prefix and preserves the query, method, body, and Set-Cookie", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://nivalis.internal/v1/auth/github/callback?code=a&state=b");
      expect(request.method).toBe("POST");
      expect(await request.text()).toBe("payload");
      return new Response(null, {
        headers: {
          Location: "https://pages.invalid/settings?auth=success",
          "Set-Cookie": "nivalis_session=opaque; Path=/; HttpOnly; Secure; SameSite=Lax"
        },
        status: 302
      });
    });

    const response = await onRequest({
      env: { NIVALIS_API: { fetch } },
      params: { path: ["v1", "auth", "github", "callback"] },
      request: new Request("https://pages.invalid/api/v1/auth/github/callback?code=a&state=b", {
        body: "payload",
        method: "POST"
      })
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toContain("nivalis_session=opaque");
  });
});
