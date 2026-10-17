export function publicDashboardResponse(
  request: Request,
  body: unknown,
  viewVersion: string,
  corsHeaders?: Headers
): Response {
  return dashboardResponse(request, body, `view:${viewVersion}`, "public, max-age=60", corsHeaders);
}

export function ownerDashboardResponse(
  request: Request,
  body: unknown,
  dataVersion: string,
  corsHeaders?: Headers
): Response {
  return dashboardResponse(request, body, `data:${dataVersion}`, "no-store", corsHeaders);
}

function dashboardResponse(
  request: Request,
  body: unknown,
  version: string,
  cacheControl: string,
  corsHeaders?: Headers
): Response {
  const etag = `W/"${version}"`;
  const headers = new Headers(corsHeaders);
  headers.set("Cache-Control", cacheControl);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("ETag", etag);
  headers.set("Vary", [headers.get("Vary"), "Accept-Encoding"].filter(Boolean).join(", "));
  if (
    request.headers
      .get("If-None-Match")
      ?.split(",")
      .some((candidate) => {
        const value = candidate.trim();
        return value === "*" || value.replace(/^W\//, "") === etag.replace(/^W\//, "");
      })
  ) {
    return new Response(null, { status: 304, headers });
  }
  const response = new Response(JSON.stringify(body), { headers });
  const encodings = (request.headers.get("Accept-Encoding") ?? "").split(",").map((entry) => {
    const [name, ...parameters] = entry.trim().toLowerCase().split(";");
    const quality = parameters.find((value) => value.trim().startsWith("q="));
    return { name, quality: quality ? Number(quality.trim().slice(2)) : 1 };
  });
  const gzip =
    encodings.find((encoding) => encoding.name === "gzip") ??
    encodings.find((encoding) => encoding.name === "*");
  if (!gzip || !Number.isFinite(gzip.quality) || gzip.quality <= 0 || !response.body)
    return response;
  headers.set("Content-Encoding", "gzip");
  return new Response(response.body.pipeThrough(new CompressionStream("gzip")), {
    encodeBody: "manual",
    headers
  });
}
