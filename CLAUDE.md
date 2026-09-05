# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Raycast extension ("Window Layouts") that replicates Raycast Pro's paid window-layout feature for free: save the current window arrangement as a named preset, then re-apply it later, launching any apps that aren't currently running.

## Commands

- `npm install` — install dependencies
- `npm run dev` (`ray develop`) — load the extension into local Raycast for live testing; this is the only way to actually exercise the commands, since they drive real windows on the desktop
- `npm run build` (`ray build`) — type-checks and bundles; run this after any change to verify correctness (no automated test suite exists)
- `npm run lint` (`ray lint`) — ESLint (`@raycast/eslint-config`) + Prettier + manifest/icon validation
- `npm run fix-lint` (`ray lint --fix`) — auto-fix lint/format issues

There are no unit tests. Verification is: `ray build` passes (type check) and `ray lint` passes, then manual verification in Raycast itself since the logic ultimately moves real windows.

## Architecture

Two Raycast commands, both thin UI wrappers around `src/lib/windows.ts`:

- `src/save-layout.tsx` — form command. Captures the current window state and writes it to storage under a user-given name.
- `src/apply-layout.tsx` — list command. Lists saved layouts; selecting one re-launches/repositions/re-stacks windows to match.

`src/lib/`:
- `types.ts` — `Layout` (name, timestamp, `LayoutWindow[]`, `zOrder`) and `LayoutWindow` (appName, bundleId, x/y/width/height).
- `storage.ts` — persistence via Raycast's `LocalStorage`, storing all layouts as one JSON array under a single key.
- `windows.ts` — all OS interaction. This is the core of the extension and the only place that shells out to external processes.

### Window control approach

Raycast extensions run in Node and have no direct macOS window-management API, so everything goes through shelling out:

- **Capturing/positioning windows**: AppleScript via `System Events`, run through `@raycast/utils`'s `runAppleScript`. Only each app's *first* window is captured/restored — apps with multiple windows are not handled per-window. Single-display only (absolute pixel coordinates).
- **Launching missing apps**: `open -g -b <bundleId>` (child_process `execFile`). The `-g` flag launches in the background so parallel launches during "Apply" don't fight over which window ends up frontmost — final stacking is corrected afterward (see below).
- **Z-order (window layering)**: System Events has no concept of front-to-back stacking order across apps. Capturing it requires Core Graphics' `CGWindowListCopyWindowInfo`, which returns on-screen windows already ordered front-to-back. This is NOT called via JXA (`osascript -l JavaScript`) — JXA's automatic CF→NS bridging for this specific API is unreliable (`kCGNullWindowID` is a C `#define`, not a linked symbol, so JXA resolves it to `undefined` and the bridged array silently comes back empty/non-iterable). Instead, `captureZOrder()` writes a small Swift source file to a temp path and runs it via `swift <file>` (Xcode Command Line Tools), which bridges `CFArrayRef` → `[[String: Any]]` natively. If Swift isn't installed, this fails soft and returns `[]` — layering is a best-effort enhancement, not something a save should fail over.
- **Restoring z-order**: after all windows in a layout are launched and repositioned, `restoreZOrder()` re-activates apps in back-to-front order (each activation raises that app above previously-activated ones), reproducing the saved stack.

When modifying `windows.ts`, keep this shell-out boundary contained there — commands (`.tsx` files) should stay UI-only and call into it, not construct AppleScript/Swift/`open` invocations themselves.
