# doc/ — in-app Document tab source

**Parent covers:** why the bundle exists (offline `file://`), rebuild command. This file covers section bookkeeping.

## OVERVIEW
One `.md` per manual section (~24), registered in `manifest.json`; `docs_bundle.js` is generated and is what the app actually loads.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add a page | new `.md` + `manifest.json` entry | `id`, `title`, `file`, `group` (group must match a tab family) |
| Publish edits | `python doc/build_doc_bundle.py` | Regenerates `docs_bundle.js`; never hand-edit the bundle |
| Section order | `manifest.json` `sections` array | Titles carry manual numbers (`14. Outlier detection`) |

## CONVENTIONS
- Titles are manually numbered — inserting a section means renumbering every later title **and** the `### N.` heading inside each shifted `.md` (faq's heading has no number; only its manifest title changes).
- Heading anchors in-app are by section `id`, so renames of `file`/`title` are safe but `id` changes break deep links.
- Check for stale in-text section-number references (`section 1x`) after a renumber.

## ANTI-PATTERNS
- Editing `docs_bundle.js` directly — always regenerate.
- Adding a feature without its doc page — the wiring checklist (root AGENTS.md) requires one.
