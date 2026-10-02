# Original Web cards as SVG

The SVG Worker exports the actual published Web components through Browser Run. Layout, fonts,
Phosphor icons, covers, the ranking switcher and the monthly record wall come from the website;
they are not independently redrawn. Images are embedded and text remains vector text. The result
contains no scripts or `foreignObject` elements.

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
The Worker needs the existing API Service Binding, Browser Run, a KV cache and the bundled
capture asset binding. Local/production KV instance IDs stay in ignored deployment config.

A capture set is keyed by the complete public read model and the render options. A privacy or
publication change cannot reuse a previous set. Original card metadata (`data-widget-id` and
`data-widget-type`) makes export independent of title and order, including duplicate titles.
The six-hour SVG Cron prewarms both modes after the Provider sync; a cache miss renders the
current public model. Failure returns an uncached error rather than a redesigned substitute.

Responses use five-minute caching and content ETags. GitHub's image proxy can cache images
longer than the origin. Headless sessions are closed in `finally` and assets are size bounded.
