# Visual asset provenance

Nivalis keeps deployable visual assets inside `apps/web/public/images`. Runtime code does not call an image-generation or avatar service.

## Background

`nivalis-background.jpg` is the user-provided cherry-blossom winter illustration selected for the public Dashboard background. The repository does not claim authorship or generate derivatives from it. Anyone publishing a fork is responsible for confirming that they have permission to distribute the image.

## Mock avatars

The four `mock-avatar-*.webp` files are deterministic placeholders generated from fixed random seeds using DiceBear's `lorelei-neutral` style. They are procedural, not generative-AI output.

- Generator: <https://www.dicebear.com/>
- Style creator: Lisa Wischofsky
- Style license: CC0 1.0
- Stored locally: yes; the browser, API, and Worker never call DiceBear

These files represent fixture identities only. Real Provider projections must use truthful Provider data or explicitly report that data is unavailable.
