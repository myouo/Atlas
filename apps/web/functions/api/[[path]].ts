interface ApiProxyEnvironment {
  readonly NIVALIS_API: {
    fetch(request: Request): Promise<Response>;
  };
}

interface ApiProxyContext {
  readonly env: ApiProxyEnvironment;
  readonly params: Readonly<Record<string, string | readonly string[]>>;
  readonly request: Request;
}

export async function onRequest(context: ApiProxyContext) {
  const incomingUrl = new URL(context.request.url);
  const path = context.params.path;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  const upstreamUrl = new URL("https://nivalis.internal");
  upstreamUrl.pathname = `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.set("x-nivalis-proxy", "cloudflare-pages");
  const body =
    context.request.method === "GET" || context.request.method === "HEAD"
      ? undefined
      : await context.request.arrayBuffer();
  const upstreamRequest = new Request(upstreamUrl, {
    ...(body === undefined ? {} : { body }),
    headers,
    method: context.request.method,
    redirect: "manual"
  });
  const upstream = await context.env.NIVALIS_API.fetch(upstreamRequest);
  return new Response(upstream.body, {
    headers: new Headers(upstream.headers),
    status: upstream.status,
    statusText: upstream.statusText
  });
}
