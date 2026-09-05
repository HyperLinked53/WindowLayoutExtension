# Window Layouts

A [Raycast](https://raycast.com) extension that replicates Raycast Pro's paid window-layout feature for free: save the current window arrangement as a named preset, then re-apply it later — launching any apps that aren't currently running, repositioning every window, and restoring which app was on top of which.

## Features

- **Save Layout** — arrange your windows the way you want, then capture that arrangement (which apps, where, what size, what order) under a name.
- **Apply Layout** — pick a saved layout and it launches any missing apps, moves every window back into place, and restores the original front-to-back stacking order.
- **Instant quicklinks** — turn any saved layout into a Raycast quicklink so you can apply it from root search or a hotkey without ever opening the Apply Layout list.
- **Multi-monitor aware** — tracks which display each window was on. If your monitor setup changes (a display gets disconnected, moved, or resized), windows are remapped onto the closest current display instead of ending up off-screen.

## Requirements

- macOS with [Raycast](https://raycast.com) installed
- Accessibility permission granted to Raycast (macOS will prompt for this the first time a layout is saved or applied — needed for the `System Events` window control)
- Xcode Command Line Tools (`swift` on your `PATH`) — used for window stacking order and multi-monitor support. Without it, those two features are skipped; save/apply still work.

## Installation

This isn't published to the Raycast Store, so install it locally:

```bash
npm install
npm run dev
```

`ray develop` loads the extension into your local Raycast install. Once it's loaded you can close the terminal and use it like any other Raycast extension.

## Usage

1. Arrange your windows the way you want them.
2. Run **Save Layout**, give it a name.
3. Later, run **Apply Layout** and select that layout — or, from the layout's action panel, choose **Create Quicklink to Apply Instantly** to pin it to root search or a hotkey.

## Limitations

- Only each app's first/main window is captured and restored — apps with multiple open windows aren't handled per-window.
- Z-order restoration and multi-monitor remapping both require the Swift toolchain; if it's missing they fail soft rather than blocking save/apply.

## Development

- `npm run dev` (`ray develop`) — load into local Raycast for live testing; this is the only way to exercise the commands, since they drive real windows on the desktop
- `npm run build` (`ray build`) — type-checks and bundles
- `npm run lint` / `npm run fix-lint` (`ray lint`) — ESLint + Prettier + manifest/icon validation

There's no automated test suite. Verification is `ray build` + `ray lint` passing, then manual testing in Raycast itself.

See `CLAUDE.md` for architecture notes.
