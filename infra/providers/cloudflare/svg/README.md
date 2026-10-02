# About Me SVG cards

`nivalis-about-svg` serves GitHub README friendly SVG images from the **published public**
Dashboard through the `NIVALIS_API` Service Binding. It never reads Owner sessions, Provider
credentials, or Draft data. All text is XML escaped; images contain no scripts, external artwork,
or `foreignObject` elements.

The `svg.aboutme.nivalis.is` Custom Domain is created by the Worker route in `wrangler.jsonc`.
Cloudflare manages its DNS record and certificate.

| URL path                             | Image                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| `/` or `/dashboard.svg`              | Profile and every enabled published Widget, including future types |
| `/profile.svg`                       | About Me profile                                                   |
| `/netease.svg`                       | Every enabled published NetEase Widget                             |
| `/widgets/{widget-id}.svg`           | One published Widget by stable ID                                  |
| `/types/{widget-type}.svg`           | First published Widget of a type; `?id=` selects an instance       |
| `/netease/ranking.svg?range=week`    | Weekly ranking; `range=all_time` selects the all-time ranking      |
| `/netease/identity.svg`              | NetEase account card                                               |
| `/netease/playlists.svg`             | Created playlists                                                  |
| `/netease/showcase.svg`              | Music showcase                                                     |
| `/netease/calendar.svg?period=month` | Monthly heatmap; `period=week` selects the week                    |
| `/steam/profile.svg`                 | Steam profile or its published empty state                         |
| `/manifest.json`                     | Current Widget IDs, types, and SVG links                           |

The named paths have tailored layouts. New Widget types automatically appear in `/dashboard.svg`,
`/manifest.json`, and `/types/{widget-type}.svg` using a generic published-data card until a
tailored layout is added. Disabled and draft Widgets are never exposed.

Cards show their last update time. Stale Steam data keeps its last known metrics and is marked
as awaiting an update.

Two styles are available for NetEase cards:

- `style=soft` (default): light blue and coral, rounded dashboard cards.
- `style=vinyl`: dark record sleeves, warm white typography, red listening bars, and vinyl artwork
  drawn directly in SVG. All five current NetEase card types have tailored layouts.

Append `?style=vinyl` to a NetEase Widget, type, or named route. It also works with ranking and
calendar parameters, for example `/netease/ranking.svg?style=vinyl&range=all_time` and
`/netease/calendar.svg?style=vinyl&period=week`. `/netease.svg?style=vinyl` includes all enabled
published NetEase cards and automatically includes future NetEase types. The manifest lists both
styles and each NetEase card's `vinylSvg` URL.

For a GitHub profile README:

```markdown
[![Nivalis About Me](https://svg.aboutme.nivalis.is/dashboard.svg)](https://aboutme.nivalis.is/)

[![NetEase Vinyl](https://svg.aboutme.nivalis.is/netease.svg?style=vinyl)](https://aboutme.nivalis.is/)
```

Run `pnpm build:svg` for a dry run and `pnpm deploy:svg` to deploy. SVG responses use a
five-minute cache policy and content-based ETags. GitHub's image proxy may keep an older image
longer; changing the README URL query string requests a fresh proxy cache key.
