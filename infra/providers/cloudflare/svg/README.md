# Original Web cards as SVG

The SVG Worker exports the actual published Web components through Browser Run. Layout, fonts,
Phosphor icons, covers, the ranking switcher and the monthly record wall come from the website;
they are not independently redrawn. Images are embedded and text remains vector text. The result
contains no scripts or `foreignObject` elements.

The capture session explicitly selects the original Glass card theme. The website's newer
Porcelain default and browser-local appearance choices therefore do not change existing profile
exports; both themes still use the shared website components.

## Universal entry

`/render.svg` is the common entry for every published card and both color modes.

| Query                                      | Selection                               |
| ------------------------------------------ | --------------------------------------- |
| none                                       | Profile and all enabled published cards |
| `view=profile`                             | Original Web profile heading            |
| `provider=netease`                         | All published NetEase cards             |
| `provider=steam`                           | All published Steam cards               |
| `type=music.netease.ranking`               | First published dual-ranking card       |
| `type=music.netease.calendar&period=month` | Current monthly listening card          |
| `id=<widget-id>`                           | One exact published card                |
| `type=<type>&id=<widget-id>`               | A particular instance of a card type    |

`theme=light` and `theme=dark` apply to every entry. `style=soft` preserves the original Web
presentation; `style=vinyl` retains that layout with a warm dark palette. An explicit `theme`
overrides the style default (soft/light, vinyl/dark). `range=week` or `range=all_time` selects the
original ranking tab, and `period=month` or `period=week` selects the original calendar tab.

Legacy `/dashboard.svg`, `/profile.svg`, `/netease.svg`, `/widgets/{id}.svg`, `/types/{type}.svg`
and named NetEase/Steam routes remain aliases. `/providers/{provider}.svg` works for future
providers. The manifest exposes canonical `/render.svg` links and all style/theme variants.
Disabled or Draft cards are not exported.

## GitHub profile

Use `picture` to switch with GitHub's light/dark scheme. The personal profile displays only the
listening dual-ranking and current monthly listening card, for example:

```html
<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://svg.aboutme.nivalis.is/render.svg?type=music.netease.ranking&amp;theme=dark"
  />
  <img
    src="https://svg.aboutme.nivalis.is/render.svg?type=music.netease.ranking&amp;theme=light"
    alt="网易云听歌双榜"
    width="720"
  />
</picture>
```

Use the corresponding calendar URL with `type=music.netease.calendar&period=month` for the
second card. No Provider credentials, Owner sessions or unpublished configuration reach the
browser export session; its public API responses are pinned to the Worker’s public read model.

## Runtime and validation

Run `pnpm build:svg` and `pnpm deploy:svg`. The build also bundles the browser-side converter.
The Worker needs the existing API Service Binding and KV cache. Chromium rendering runs
separately in GitHub Actions (or locally); image reads do not launch a Cloudflare browser.
Local/production KV instance IDs stay in ignored deployment config.

A capture set is keyed by public content and the render options. Only non-rendered Widget sync
timestamps and equivalent numbered NetEase artwork CDN hosts are normalized. Actual data,
artwork identities, public policies, presentation settings, stale state, layout and publication
revision remain part of the key, so a privacy or publication change cannot reuse a previous set.
Original card metadata (`data-widget-id` and
`data-widget-type`) makes export independent of title and order, including duplicate titles.
The hourly `refresh-profile-svg.yml` workflow checks the current public content, skips
unchanged captures, and publishes all 16 combinations of theme, style, ranking range and
calendar period. It retries on the next hourly run after failures. The Provider sync remains
every six hours. Set the repository variable `SVG_PUBLISH_ENABLED=true` in exactly one
repository, and share a dedicated `SVG_PUBLISH_TOKEN` secret with the SVG Worker.

The authenticated `GET /internal/scenes` endpoint reports capture readiness; authenticated
`POST /internal/scenes` accepts bounded native scenes only for the current public snapshot.
Use `pnpm svg:publish` with `SVG_PUBLISH_TOKEN` to generate and publish from local Chromium,
or `SVG_OUTPUT_DIR` to inspect captures without publishing. Both paths use the same original
Web DOM converter and rounded backdrop clipping.

The last successful capture is retained without expiry. Provider data updates can temporarily
serve that original SVG while a new render is pending; `X-Nivalis-SVG-State` and
`X-Nivalis-SVG-Captured-At` identify this state. A change to publication revision, public
disclosure, enabled cards, profile identity, presentation or the selected listening period
blocks reuse. A failed or obsolete upload never replaces the previous successful artifact.
Two-day immutable copies are also retained; latest keys overwrite by public scope and variant
so listening periods do not accumulate permanent copies.

Responses use five-minute caching and content ETags. GitHub's image proxy can cache images
longer than the origin. CI headless sessions are closed in `finally` and assets are size bounded.
