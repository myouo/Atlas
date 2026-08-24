interface Environment {
  readonly CORS_ORIGINS?: string;
  readonly UPSTREAM_API_BASE_URL?: string;
}

const worker = {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const requestUrl = new URL(request.url);
    const corsHeaders = resolveCorsHeaders(request, environment.CORS_ORIGINS);

    if (request.method === "OPTIONS") {
      return corsHeaders
        ? new Response(null, { headers: corsHeaders, status: 204 })
        : problem(403, "origin-not-allowed", "Origin not allowed", requestUrl.pathname);
    }

    if (requestUrl.pathname === "/health") {
      return json({ service: "nivalis-edge", status: "ok" }, 200, corsHeaders);
    }

    const upstreamBaseUrl = environment.UPSTREAM_API_BASE_URL?.trim();
    if (!upstreamBaseUrl) {
      return problem(
        503,
        "upstream-not-configured",
        "Nivalis API upstream is not configured",
        requestUrl.pathname,
        corsHeaders
      );
    }

    if (!isNivalisRoute(requestUrl.pathname)) {
      return problem(404, "route-not-found", "Route not found", requestUrl.pathname, corsHeaders);
    }

    const upstreamUrl = createUpstreamUrl(upstreamBaseUrl, requestUrl);
    const upstreamRequest = new Request(upstreamUrl, request);
    const upstreamResponse = await fetch(upstreamRequest);
    const headers = new Headers(upstreamResponse.headers);
    applyCorsHeaders(headers, corsHeaders);

    return new Response(upstreamResponse.body, {
      headers,
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText
    });
  }
};

export default worker;

function createUpstreamUrl(baseUrl: string, requestUrl: URL) {
  const upstream = new URL(baseUrl);
  const basePath = upstream.pathname.endsWith("/")
    ? upstream.pathname.slice(0, -1)
    : upstream.pathname;
  upstream.pathname = `${basePath}${requestUrl.pathname}`;
  upstream.search = requestUrl.search;
  return upstream;
}

function isNivalisRoute(pathname: string) {
  return pathname === "/ready" || pathname.startsWith("/v1/");
}

function resolveCorsHeaders(request: Request, configuredOrigins?: string) {
  const origin = request.headers.get("origin");
  if (!origin) return undefined;

  const allowed = new Set(
    (configuredOrigins ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
  if (!allowed.has(origin)) return undefined;

  return new Headers({
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, If-Match",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin"
  });
}

function json(body: unknown, status: number, corsHeaders?: Headers) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  applyCorsHeaders(headers, corsHeaders);
  return new Response(JSON.stringify(body), { headers, status });
}

function problem(
  status: number,
  code: string,
  title: string,
  instance: string,
  corsHeaders?: Headers
) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/problem+json; charset=utf-8"
  });
  applyCorsHeaders(headers, corsHeaders);
  return new Response(
    JSON.stringify({
      instance,
      status,
      title,
      type: `urn:nivalis:problem:${code}`
    }),
    { headers, status }
  );
}

function applyCorsHeaders(target: Headers, corsHeaders?: Headers) {
  corsHeaders?.forEach((value, key) => target.set(key, value));
}
