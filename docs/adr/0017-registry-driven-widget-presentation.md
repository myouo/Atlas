# ADR 0017: Registry-driven Widget presentation controls

- Status: Accepted
- Date: 2026-08-25

## Context

Nivalis already separates data-affecting `dataConfig` from display-only `presentationConfig`, but Phase 1 exposed no generic editor for the latter. Adding one-off switches inside each Renderer would duplicate settings UI, make new Widget types harder to install, and tempt the API to return labels or styling. The Cloudflare D1 adapter also exposed read-only Dashboard configuration, so API-mode display choices could not be persisted or published.

“Expose every available value” cannot mean returning Provider Raw Snapshots. Raw evidence can contain private account metadata that is valid for replay/debugging but unsafe for a public Dashboard. The configurable surface must therefore operate only on normalized, explicitly public Widget Projection fields.

## Decision

1. `WidgetRegistry` owns a frontend-only `presentationControls` catalog. Controls are semantic toggles or selects with labels, descriptions, and defaults; no UI labels or CSS come from the backend.
2. A single `WidgetDisplaySettingsDialog` renders Registry controls for every known Widget. `ModuleShell` exposes the same configure affordance in edit mode, while display mode remains clean.
3. Renderers read `presentationConfig` through shared helpers and decide which safe Projection fields to render. Unknown/missing values fall back to Registry defaults.
4. `presentationConfig` remains part of immutable Dashboard Revision configuration. It is excluded from Projection Key generation, so changing visible fields never invokes a Provider sync or creates another projection partition.
5. Cloudflare D1 implements Contract-compatible Draft save and Publish. `D1Database.batch()` creates the new Revision, copies Widget configuration snapshots, and conditionally moves the Draft pointer in one transaction. `If-Match` supplies compare-and-swap semantics; stale writes return `412`. Publish conditionally moves only the Published pointer.
6. Raw Snapshot, encrypted credential, Provider-native private fields, and operational metadata never enter the display-field catalog.

## Privacy boundary

Presentation controls govern visual rendering, not API-level secrecy. The API may still carry the normalized public-safe Projection field so an Owner can preview a local toggle without another Provider request. A future field that requires disclosure control must use an explicit privacy policy/redaction layer rather than pretending CSS visibility is access control.

## Alternatives

- Backend returns a field editor schema: rejected because it would mix API semantics with frontend labels and interaction design.
- Per-Renderer settings dialogs: rejected because ModuleShell and lifecycle behavior would diverge across Providers.
- Rebuild Projection after every display toggle: rejected because presentation does not affect external data.
- Return Raw Snapshot fields and let the browser choose: rejected because Raw is not a public read model.

## Consequences

- Every registered card can expose coherent display controls without changing OpenAPI for each toggle.
- Save/Publish produces immutable, conflict-safe D1 revisions and preserves Draft/Published isolation.
- New Provider modules must explicitly choose which normalized fields are safe enough to enter Widget Projection before those fields can become configurable.
