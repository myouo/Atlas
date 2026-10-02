import type { DashboardReadModel } from "@nivalis/api-client";

import {
  renderDashboardSvg,
  renderNeteaseSvg,
  renderProfileSvg,
  renderWidgetSvg,
  type PublishedWidget
} from "./svg-renderer";

const MAX_DASHBOARD_BYTES = 16_000_000;

const aliases: Readonly<Record<string, string>> = {
  "/netease/ranking.svg": "music.netease.ranking",
  "/netease/identity.svg": "music.netease.identity",
  "/netease/playlists.svg": "music.netease.playlists",
  "/netease/showcase.svg": "music.netease.showcase",
  "/netease/calendar.svg": "music.netease.calendar",
  "/steam/profile.svg": "steam.profile"
};

type Selection =
  | { readonly kind: "dashboard" }
  | { readonly kind: "manifest" }
  | { readonly kind: "profile" }
  | { readonly kind: "netease" }
  | { readonly kind: "widget-id"; readonly value: string }
  | { readonly kind: "widget-type"; readonly value: string };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { headers: { Allow: "GET, HEAD" }, status: 405 });
    }
    const url = new URL(request.url);
    const selection = selectRoute(url.pathname);
    if (!selection) return new Response("Card not found", { status: 404 });

    let dashboard: DashboardReadModel;
    try {
      dashboard = await loadPublishedDashboard(env.NIVALIS_API);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "svg_dashboard_unavailable",
          reason: error instanceof Error ? error.name : "unknown"
        })
      );
      return new Response("Published dashboard unavailable", {
        headers: { "Cache-Control": "no-store" },
        status: 503
      });
    }

    if (selection.kind === "manifest") {
      const manifest = {
        dashboard: `${url.origin}/dashboard.svg`,
        profile: `${url.origin}/profile.svg`,
        netease: `${url.origin}/netease.svg`,
        styles: ["soft", "vinyl"],
        site: env.SITE_URL,
        widgets: dashboard.widgets
          .filter((widget) => widget.enabled)
          .map((widget) => ({
            id: widget.id,
            title: widget.title,
            type: widget.type,
            svg: `${url.origin}/widgets/${encodeURIComponent(widget.id)}.svg`,
            typeSvg: `${url.origin}/types/${encodeURIComponent(widget.type)}.svg`,
            ...(widget.type.startsWith("music.netease.")
              ? {
                  vinylSvg: `${url.origin}/widgets/${encodeURIComponent(widget.id)}.svg?style=vinyl`
                }
              : {})
          }))
      };
      return new Response(request.method === "HEAD" ? null : JSON.stringify(manifest), {
        headers: {
          "Cache-Control": "public, max-age=300",
          "Content-Type": "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    let svg: string;
    if (selection.kind === "dashboard")
      svg = renderDashboardSvg(dashboard, env.SITE_URL, url.searchParams);
    else if (selection.kind === "netease") {
      if (
        !dashboard.widgets.some(
          (widget) => widget.enabled && widget.type.startsWith("music.netease.")
        )
      )
        return new Response("Published NetEase cards not found", { status: 404 });
      svg = renderNeteaseSvg(dashboard, env.SITE_URL, url.searchParams);
    } else if (selection.kind === "profile")
      svg = renderProfileSvg(dashboard.profile, env.SITE_URL);
    else {
      const widget = selectWidget(dashboard.widgets, selection, url.searchParams.get("id"));
      if (!widget) return new Response("Published card not found", { status: 404 });
      svg = renderWidgetSvg(widget, env.SITE_URL, url.searchParams);
    }

    const etag = await svgEtag(svg);
    const headers = new Headers({
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Type": "image/svg+xml; charset=utf-8",
      ETag: etag,
      "X-Content-Type-Options": "nosniff"
    });
    if (etagMatches(request.headers.get("If-None-Match"), etag)) {
      return new Response(null, { headers, status: 304 });
    }
    return new Response(request.method === "HEAD" ? null : svg, { headers });
  }
} satisfies ExportedHandler<Env>;

export function selectRoute(pathname: string): Selection | null {
  if (pathname === "/" || pathname === "/dashboard.svg") return { kind: "dashboard" };
  if (pathname === "/manifest.json") return { kind: "manifest" };
  if (pathname === "/profile.svg") return { kind: "profile" };
  if (pathname === "/netease.svg" || pathname === "/netease/dashboard.svg")
    return { kind: "netease" };
  const alias = aliases[pathname];
  if (alias) return { kind: "widget-type", value: alias };
  const widgetId = pathname.match(/^\/widgets\/([^/]+)\.svg$/)?.[1];
  if (widgetId && /^[a-zA-Z0-9_-]{1,100}$/.test(widgetId)) {
    return { kind: "widget-id", value: widgetId };
  }
  const widgetType = pathname.match(/^\/types\/([^/]+)\.svg$/)?.[1];
  if (widgetType && /^[a-z0-9._-]{1,100}$/.test(widgetType)) {
    return { kind: "widget-type", value: widgetType };
  }
  return null;
}

function selectWidget(
  widgets: readonly PublishedWidget[],
  selection: Extract<Selection, { readonly kind: "widget-id" | "widget-type" }>,
  requestedId: string | null
) {
  const enabled = widgets.filter((widget) => widget.enabled);
  if (selection.kind === "widget-id") {
    return enabled.find((widget) => widget.id === selection.value);
  }
  return enabled.find(
    (widget) => widget.type === selection.value && (!requestedId || widget.id === requestedId)
  );
}

async function loadPublishedDashboard(service: Fetcher): Promise<DashboardReadModel> {
  const response = await service.fetch(
    new Request("https://nivalis.internal/v1/public/dashboards/about", {
      headers: { Accept: "application/json" },
      method: "GET"
    })
  );
  if (!response.ok) throw new Error(`Public API returned ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DASHBOARD_BYTES) {
    throw new Error("Public dashboard exceeds SVG render budget");
  }
  if (!response.body) throw new Error("Public dashboard response is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > MAX_DASHBOARD_BYTES) {
      await reader.cancel();
      throw new Error("Public dashboard exceeds SVG render budget");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isDashboard(value)) throw new Error("Public dashboard shape is invalid");
  return value;
}

function isDashboard(value: unknown): value is DashboardReadModel {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const profile = candidate.profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return false;
  const fields = profile as Record<string, unknown>;
  return (
    candidate.dashboardId === "about" &&
    typeof fields.displayName === "string" &&
    typeof fields.handle === "string" &&
    typeof fields.headline === "string" &&
    typeof fields.bio === "string" &&
    Array.isArray(fields.tags) &&
    fields.tags.every((tag) => typeof tag === "string") &&
    Array.isArray(candidate.widgets) &&
    candidate.widgets.every((widget) => {
      if (!widget || typeof widget !== "object" || Array.isArray(widget)) return false;
      const row = widget as Record<string, unknown>;
      return (
        typeof row.id === "string" &&
        typeof row.type === "string" &&
        typeof row.title === "string" &&
        typeof row.enabled === "boolean" &&
        typeof row.schemaVersion === "number" &&
        typeof row.stale === "boolean"
      );
    })
  );
}

async function svgEtag(svg: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(svg));
  const hex = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `"svg:${hex}"`;
}

function etagMatches(header: string | null, etag: string) {
  return (
    header?.split(",").some((candidate) => {
      const value = candidate.trim();
      return value === "*" || value.replace(/^W\//, "") === etag;
    }) ?? false
  );
}
