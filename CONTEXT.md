# anki-decks — AI Context File
_Last synced: 2026-06-12 @ 478b72c_

## 1. What This Is (Plain English)

- **In one sentence:** A curated store of Anki flashcard decks for medical students, served as a single-page website where you can browse and download decks.
- **Why it exists:** To give Moroccan and French medical students one place to find and download quality Anki decks — pharmacology, radiology, anatomy, ECG, and more — instead of hunting across Facebook groups and Google Drive.
- **Who uses it:** Moroccan and French medical students preparing for ECNi/EDN exams. Public-facing.
- **Vibe:** Scrappy personal project with real users. One HTML file is the entire website. No framework, no build step.

---

## 2. How To Run It

- **Setup once:** Nothing to install.
- **Run dev:** Open `index.html` directly in a browser, or `python3 -m http.server 8080` then visit `http://localhost:8080`.
- **Build / deploy:** Push to `main` → GitHub Pages auto-deploys the site at `https://achma-learning.github.io/anki-decks/`.
- **Required env vars:** None.

---

## 3. Tech Stack

- **Language + runtime:** Plain HTML + CSS + vanilla JavaScript. No Node, no Python, no build step.
- **Framework / key libraries:** None. Zero dependencies.
- **What kind of project:** Static website + binary file hosting (`.apkg` decks, PDFs hosted directly in this repo).
- **External services:**
  - GitHub raw URLs for file downloads (`raw/refs/heads/main/...`)
  - Google Drive (backup copies of large decks)
  - AnkiWeb / AnkiHub (third-party deck hosting)
  - AMMPS (`ammps.gov.ma`) — Moroccan medicines registry, source for RMMG data

---

## 4. Code Map (The Important Files Only)

- `index.html` — **The entire website.** CSS, layout, and all deck data live here. The `STORE` constant in the `<script>` block is the single source of truth for every card on the page. The rendering functions below it generate the HTML automatically.
- `RMMG-AMMPS/` — Moroccan generic medicines deck (v4 ~2k cards), dictionnaire pharmacologique PDF, MSF essential medicines PDF, and a scraper userscript. Main active project.
- `pharmaco-suffix/pharmaco-dci-suffixes-v1.apkg` — DCI suffixes deck.
- `chest x-ray by Dr HOURI/` — Chest X-ray radiology deck + PDFs.
- `rx thoax-tubercolose/` — TB radiology deck (24 MB).
- `anki-decks-backups/` — Older/backup copies of various decks. `rmmg/v2-RMMG_Maroc_2026.apkg` is a 2-byte placeholder — don't link to it.
- `pharmaco/` — Reference PDFs for pharmacology (WHO INN nomenclature, DCI glossary, etc.).

---

## 5. Rules For Editing This Code

- **To add or update a deck card:** edit the `STORE` array in `index.html`'s `<script>` block only. Never touch the rendering functions or CSS unless the page layout itself needs to change.
- **Never add npm packages or a build step** — this project stays zero-dependency by design.
- **Use `raw/` URLs for all download buttons**, not `blob/` URLs. Pattern:
  ```
  https://github.com/achma-learning/anki-decks/raw/refs/heads/main/FOLDER/FILE
  ```
  URL-encode spaces as `%20`, `é` as `%C3%A9`, `à` as `%C3%A0`, parentheses as `%28` / `%29`.
- **Button classes available:** `btn-primary` (purple), `btn-green`, `btn-teal`, `btn-orange`, `btn-red`, `btn-secondary` (grey), `btn-backup` (dark, small — for fallback links).
- **Badge colors available:** `green`, `blue`, `purple`, `teal`, `orange`, `red`, `yellow`.

---

## 6. Fragile Bits & Landmines

- **`blob/` vs `raw/` in GitHub URLs matters.** `blob/` opens a GitHub preview page, not a direct download. Always use `raw/refs/heads/main/` for `.apkg` and PDF download buttons.
- **`anki-decks-backups/rmmg/v2-RMMG_Maroc_2026.apkg` is 2 bytes (empty placeholder).** The old index.html linked to it as "v2 (3000+)". Don't restore that link — use the v4 file in `RMMG-AMMPS/` instead.
- **Large files and GitHub limits.** GitHub raw serving works up to ~100 MB. The TB radiology deck (`rx_thorax_tuberculose (1).apkg`) is 24 MB — fine. Files over ~50 MB should have a Drive backup link as primary.
- **The `STORE` rendering runs synchronously at page load** (`init()` called at bottom of script, no `DOMContentLoaded` needed because the script is at end of `<body>`). Don't move the script to `<head>` without adding `defer` or a `DOMContentLoaded` wrapper.
- **Subsection layout** (used in `med-fr`): use `subsections: [{ label, items }]` instead of `items`. Can't mix both on the same section.

---

## 7. Current State

- **Last shipped:** Refactored `index.html` to a data-driven structure (all deck data in a `STORE` JS constant, rendering auto-generated). Added RMMG v4 (~2k cards), dictionnaire pharmacologique PDF, MSF essential medicines guide, and updated AMMPS source URL to `ammps.gov.ma`.
- **Working on now:** Making the site easy to maintain with AI agents — done via the `STORE` data approach.
- **Next up:** Add VVP catheters section (deck already exists at `vvp/catheters_osmosis_v6.apkg`); auto-update RMMG deck from AMMPS scraper (`RMMG-AMMPS/userscript-scrap-ammps.js`).

---

## 8. How To Add a New Deck Card (Quick Reference)

Open `index.html`, find the right section in `STORE`, and add an object:

```javascript
// Inside any section's `items` array:
{
  banner: "💊",                                       // emoji shown in the card header
  bg: "linear-gradient(135deg, #1a3a1a, #0d280d)",   // card header background
  compact: true,                                      // optional: smaller card (for cards-compact sections)
  title: "My Deck Name",
  titleNote: " by Author",                            // optional: small grey note after title
  desc: "Short description of the deck.",
  badges: [                                           // optional
    { label: "Maroc", color: "green" }
  ],
  buttons: [
    { label: "⬇ Download", href: "https://github.com/achma-learning/anki-decks/raw/refs/heads/main/FOLDER/file.apkg", cls: "btn-green" },
    { label: "Backup", href: "https://drive.google.com/...", cls: "btn-backup" }
  ]
}
```

---

## 9. Update Protocol (Verbatim)

> **For the AI Assistant:** When asked to "Update CONTEXT.md":
> 1. Re-run Phase 0 — check for new `GEMINI.md` / `CLAUDE.md` / `.github/` files.
> 2. Re-scan the tree and `.github/workflows/` for new sections or files.
> 3. Read our recent conversation for new decisions, fragile bits discovered, or shifted goals.
> 4. Refresh the `_Last synced_` line with today's date and current commit SHA (`git rev-parse --short HEAD`).
> 5. Rewrite — do not append. One clean source of truth. Preserve still-true content, revise the rest.
> 6. Keep §1 and §2 in plain English. Keep the file under ~350 lines.
