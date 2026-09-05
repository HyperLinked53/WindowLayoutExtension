# Issues — code review (2026-09-05)

Verified: `ray build` ✅ passes, `ray lint` ✅ passes.

## 1. Name matching is inconsistent — real bug
- `storage.ts:13`, `apply-layout.tsx:46`
- Save/dedupe compares exact (`l.name !== layout.name`), auto-apply compares case-insensitive.
- Saving "Coding" then "coding" creates two layouts; auto-apply matches the first.
- Fix: pick one (case-insensitive everywhere) and normalize on save.

## 2. Silent overwrite on duplicate name
- `storage.ts:12-16`, `save-layout.tsx:27`
- Re-saving an existing name replaces it with no confirmation.
- Fix: add a confirm, or at least surface "overwrote X" in the toast.

## 3. Corrupt storage crashes both commands
- `storage.ts:9`
- `JSON.parse(raw)` with no try/catch — one bad write bricks list + save.
- Fix: wrap and return `[]` (or reset the key).

## 4. `captureVisibleWindows` trusts AppleScript output
- `windows.ts:181-191`
- No validation: a malformed line yields `NaN` coords or `undefined` bundleId, later interpolated into `positionScript` / `open -b undefined`.
- Fix: filter lines where any coordinate is `!Number.isFinite` or bundleId is falsy.

## 5. Unrounded floats into AppleScript
- `windows.ts:141-159`, `windows.ts:214-222`
- `remapToCurrentDisplays` does float arithmetic (display bounds are `Double`), then emits `{100.5, 200.3}` into `set position/size`, which expects ints.
- Fix: `Math.round` x/y/width/height in `remapToCurrentDisplays` or `positionScript`.

## 6. `handleApply` has no outer try/catch
- `apply-layout.tsx:56-73`
- Any throw leaves the animated toast spinning forever. Partial failure still runs `restoreZOrder` on a half-applied set.
- Fix: wrap the body; comment the partial-apply behavior as intentional if kept.

## Minor
- `bundleId` interpolated raw into AppleScript (`windows.ts:193-202`, `windows.ts:214-222`) — low risk (system-controlled) but one escape helper closes the hole for hand-edited layouts.
- `quicklinkFor` hardcodes `neil/window-layouts` (`apply-layout.tsx:18-19`) — breaks on fork/rename. Derive if that matters.
- `runSwiftScript` has no timeout — a hung `swift` hangs save indefinitely. `execFileAsync(..., { timeout })` is one line.
- `useEffect(..., [])` references `props`/`handleApply` (`apply-layout.tsx:41-54`) — works, but exhaustive-deps would flag.

## Non-issues (intentional, documented)
- Parallel `swift` invocations, 150ms z-restore delay, single-window-per-app.
