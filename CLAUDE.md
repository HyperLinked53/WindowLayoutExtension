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

- `src/save-layout.tsx` — form command. Captures the current window state (windows, z-order, display geometry) and writes it to storage under a user-given name.
- `src/apply-layout.tsx` — list command. Lists saved layouts; selecting one re-launches/repositions/re-stacks windows to match. Also accepts an optional hidden `name` argument (declared in `package.json`'s command `arguments`) — when present, it skips rendering the list and applies that layout immediately, then closes Raycast. This is how the per-layout "Create Quicklink to Apply Instantly" action (`quicklinkFor()` in `apply-layout.tsx`) works: the quicklink is a `raycast://extensions/<author>/<name>/apply-layout?arguments=...` deeplink carrying the layout name, so a pinned/hotkeyed quicklink applies a layout without ever opening the command's list UI.

`src/lib/`:
- `types.ts` — `Layout` (name, timestamp, `LayoutWindow[]`, `zOrder`) and `LayoutWindow` (appName, bundleId, x/y/width/height, optional `display`). `DisplayBounds` (x/y/width/height of a monitor).
- `storage.ts` — persistence via Raycast's `LocalStorage`, storing all layouts as one JSON array under a single key.
- `windows.ts` — all OS interaction. This is the core of the extension and the only place that shells out to external processes.

### Window control approach

Raycast extensions run in Node and have no direct macOS window-management API, so everything goes through shelling out:

- **Capturing/positioning windows**: AppleScript via `System Events`, run through `@raycast/utils`'s `runAppleScript`. Only each app's *first* window is captured/restored — apps with multiple windows are not handled per-window.
- **Launching missing apps**: `open -g -b <bundleId>` (child_process `execFile`). The `-g` flag launches in the background so parallel launches during "Apply" don't fight over which window ends up frontmost — final stacking is corrected afterward (see below).
- **Z-order (window layering)**: System Events has no concept of front-to-back stacking order across apps. Capturing it requires Core Graphics' `CGWindowListCopyWindowInfo`, which returns on-screen windows already ordered front-to-back. **Multi-monitor**: AppleScript window coordinates are already global across all displays (not relative to one screen), so basic positioning works across monitors with no extra effort — what actually needs handling is the display *arrangement changing* between save and apply. `captureDisplays()` records each active display's bounds (`CGGetActiveDisplayList` / `CGDisplayBounds`); `save-layout.tsx` tags each captured window with the display it was on (`findDisplayForWindow`, by center-point containment). At apply time, `remapToCurrentDisplays()` (in `windows.ts`) checks whether that exact display still exists — if so, the saved position is used as-is; if the monitor was disconnected/moved/resized, the window is replayed at the same offset from the closest current display's origin and clamped to stay fully on-screen. Layouts saved before this existed simply lack `display` on their windows and skip remapping (no migration).
- **Core Graphics from JS**: both z-order and display-bounds capture need Core Graphics APIs that JXA (`osascript -l JavaScript`) bridges unreliably — e.g. `kCGNullWindowID` is a C `#define`, not a linked symbol, so JXA resolves it to `undefined` and a CFArrayRef return value silently comes back empty/non-iterable. Both instead shell out to a small Swift script (via the shared `runSwiftScript()` helper, which writes a temp `.swift` file and runs `swift <file>`), since Swift bridges these CF types natively. If Swift isn't installed, this fails soft (`[]`) — both are best-effort enhancements, not something a save/apply should fail over.
- **Restoring z-order**: after all windows in a layout are launched and repositioned, `restoreZOrder()` re-activates apps in back-to-front order (each activation raises that app above previously-activated ones), reproducing the saved stack.

When modifying `windows.ts`, keep this shell-out boundary contained there — commands (`.tsx` files) should stay UI-only and call into it, not construct AppleScript/Swift/`open` invocations themselves.
