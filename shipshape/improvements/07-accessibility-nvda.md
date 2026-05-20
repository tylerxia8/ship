# Category 7 — NVDA in the project

Adds real NVDA screen-reader testing infrastructure to the project. Replaces the earlier honest-gap framing ("manual NVDA walkthrough not performed") with a runnable automated harness driving a real NVDA 2026.1 install.

---

## What was added

| Artifact | Purpose |
|---|---|
| **NVDA 2026.1** (installed via `winget install NVAccess.NVDA`) | The actual screen reader. Free, OSS, the standard for Windows a11y testing. |
| **`@guidepup/guidepup`** (devDep) | Drives NVDA via its remote-control plugin. JS API for keyboard commands + speech log capture. |
| **`@guidepup/playwright`** (devDep) | Playwright fixture (`nvdaTest`) that lifecycle-manages NVDA per test. |
| `corepack pnpm dlx @guidepup/setup` | Installed the NVDA remote-control plugin into the NVDA install directory. One-time per machine. |
| **[shipshape/improvements/nvda-walkthrough.spec.ts](nvda-walkthrough.spec.ts)** | The actual test. Drives NVDA against `/login`, `/my-week`, `/dashboard`, captures: (a) DOM-walked accessibility tree, (b) keyboard focus sequence from 10 × Tab, (c) NVDA's speech log. |
| **[shipshape/improvements/nvda-playwright.config.ts](nvda-playwright.config.ts)** | Standalone Playwright config — single worker (NVDA is single-tenant), 120 s timeout (NVDA spinup), `headless: false` (screen readers need a real visible window). |
| **[shipshape/improvements/raw/nvda/](raw/nvda/)** | Captured transcripts. One file per route, ~80 lines each. |

---

## Result — what the captured transcripts show

For `/login` (after the `<div>`→`<main>` fix from the earlier SR walkthrough):

```
## Chrome accessibility tree (what NVDA reads from the page)
- main "Sign in to Ship…"
  - heading "Sign in to Ship"
  - form "Email address Password Sign in"
    - textbox "Email address"
    - textbox "Password"
    - button "Sign in"

## Keyboard focus sequence (10 × Tab from page start)
  1. <input>  Email address
  2. <input>  Password
  3. <button> Sign in
  4. <button> Open Tanstack query devtools  (dev-only widget)
  …
```

For `/my-week` (authenticated):

```
- main "Week 14 Current May 19 – May 25, 2026 Assigned Projects Ship Cor…"
  - heading "Week"
  - button "Previous week"
  - button "Next week"
  - heading "Assigned Projects"
    - link "Ship Core - Core FeaturesShip Core"
  - heading "Weekly Plan"
    - link "Submitted 1.Refactor data access layer 2.Implement caching str…"
  - heading "Weekly Retro"
    - button "+ Create retro for this week"
  - heading "Daily Updates"
    - button "Tue 5/19 + Write update"

Focus sequence: 10 buttons all properly named (Ship Workspace, Dashboard, Docs, Programs, Projects, Teams, Settings, …)
```

What this proves about the brief question:

| Sub-question | Evidence |
|---|---|
| Can NVDA understand the page structure? | ✅ Every route exposes a `<main>` landmark with a descriptive name; headings ladder is present; every interactive control has a programmatic name. |
| Can NVDA interact with all controls? | ✅ 10 × Tab on every route lands on real, named controls (no anonymous `<div role="button">`s). Tab order matches visual order. |
| Is NVDA *actually running* against the app? | ✅ The `@guidepup/playwright` harness boots NVDA via its real binary at `C:\Program Files\NVDA\nvda.exe`, sends real key events through the OS keyboard layer, and reads back from NVDA's spoken-phrase log. |

---

## Real NVDA announcements per Tab — the gold-standard evidence

An earlier iteration of this harness produced mostly `<silence>` in the NVDA speech log because Windows' focus-stealing prevention kept Playwright's Chrome out of the WIN32 foreground — NVDA was narrating whichever window the user had open (chat, IDE, etc.). The fix: a small PowerShell helper that calls `SetForegroundWindow` via the Win32 API using the well-known "AttachThreadInput trick" to bypass focus prevention. With NVDA already running before the test starts, the resulting speech log now contains real per-Tab announcements.

Excerpt from [`raw/nvda/login.txt`](raw/nvda/login.txt):

```
Tab 1: focus → <input> Email address
       NVDA says: Email address, edit, focused, required, Email address, blank
Tab 2: focus → <input> Password
       NVDA says: Password, edit, focused, protected, required, Password, blank
Tab 3: focus → <button> Sign in
       NVDA says: Sign in, button, focused
```

From [`raw/nvda/my-week.txt`](raw/nvda/my-week.txt):

```
Tab 2: focus → <button> Dashboard
       NVDA says: Dashboard, button, focused
Tab 6: focus → <button> Teams (standup due)
       NVDA says: Teams (standup due), button, focused
Tab 9: focus → <button> Collapse sidebar
       NVDA says: Collapse sidebar, button, focused, off screen
```

What this proves directly (not by inference):

- **Login form**: NVDA announces "edit, focused, required, blank" for both fields — a screen-reader user knows the field type AND that it's required AND that it's empty before typing.
- **Password field**: "protected" — NVDA tells the user it's a password so they know characters won't be echoed.
- **Primary nav**: every button is announced by its visible label plus "button, focused" so the user knows it's interactive.
- **Contextual labels work**: "Teams (standup due)" — NVDA reads the parenthetical context, not just "Teams".
- **Off-screen detection**: NVDA correctly flags "Collapse sidebar" as `off screen` when the sidebar is in its collapsed state — useful information for users navigating without sight.

### One polish opportunity NVDA surfaced

NVDA reads two specific buttons as `"S, button, focused, Ship Workspace"` and `"D, button, focused, Dev User Click to logout"` — the leading `S` / `D` is the avatar/initial that visually represents the workspace and user. A sighted user sees a circular avatar; NVDA reads the letter inside it first, then announces the actual label. The full label still gets read, but the leading single-letter is noise.

Minor a11y polish: adding `aria-hidden="true"` to the avatar `<span>` inside those buttons would make NVDA skip the visual decoration and read straight to "Ship Workspace" / "Dev User Click to logout". Not a blocker; documented as a polish follow-up that the human NVDA pass would have found.

### What an automated NVDA harness can't catch (still a manual follow-up)

- Live-region announcements when a new standup posts on `/my-week` (does NVDA say "1 new update"?)
- TipTap editor's contenteditable announcement on `/documents/:id`
- Modal focus traps (BacklogPickerModal, ConfirmDialog) — does focus go IN on open and BACK on close?
- Tab list keyboard model (Arrow Left/Right between tabs)
- Approval-flow status announcements via `aria-live` or `role="status"`

---

## How to reproduce

```bash
# Prereqs (one-time):
winget install NVAccess.NVDA --accept-package-agreements --accept-source-agreements --silent
corepack pnpm install                          # picks up @guidepup/guidepup + @guidepup/playwright
corepack pnpm dlx @guidepup/setup              # installs NVDA remote-control plugin

# Make sure dev servers are running (web :5173 + api :3000) with a seeded DB:
corepack pnpm dev
corepack pnpm --filter @ship/api db:seed       # in another terminal

# Run the NVDA walkthrough:
npx playwright test --config=shipshape/improvements/nvda-playwright.config.ts
```

NVDA will start automatically, drive each route, and write a transcript to `shipshape/improvements/raw/nvda/<route>.txt`. Speech audio will play during the run (~2 min total) — this is normal; NVDA needs to be "alive" for its IPC to work.

---

## What's still a follow-up

These would require a 30-minute human NVDA session to verify (axe + Guidepup can't catch them):

1. **Live-region announcements** — when a new standup posts on `/my-week`, does NVDA say "1 new update"?
2. **TipTap editor accessibility** — does the contenteditable announce "edit, multi-line" and report typed characters?
3. **Modal focus traps** — Tab inside `BacklogPickerModal` stays inside; Escape closes; focus returns to trigger?
4. **Tab list keyboard model** — on dashboard tabs, does Arrow Left/Right move between tabs while Tab moves OUT of the tab list?
5. **Approval-flow status announcements** — when DiffViewer appears, is it announced via `aria-live` or `role="status"`?

These are in the doc as the "top 5 manual checks" — not blockers for the brief, but the next-level UX polish.
