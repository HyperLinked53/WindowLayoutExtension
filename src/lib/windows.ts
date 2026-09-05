import { runAppleScript } from "@raycast/utils";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import { DisplayBounds, LayoutWindow } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Runs a Swift source file as a script and returns its stdout. Used for anything that needs
 * Core Graphics APIs System Events can't expose (z-order, display geometry) — Swift bridges
 * CoreGraphics's CF types natively, where JXA's automatic CF<->NS bridging is unreliable.
 * Fails soft by design: callers treat a missing Swift toolchain as "feature unavailable", not fatal.
 */
async function runSwiftScript(source: string): Promise<string> {
  const scriptPath = join(tmpdir(), `window-layouts-${Date.now()}-${Math.random().toString(36).slice(2)}.swift`);
  await writeFile(scriptPath, source, "utf8");
  try {
    const { stdout } = await execFileAsync("swift", [scriptPath], { timeout: 10_000 });
    return stdout.trim();
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}

/** Escapes a value for safe interpolation inside a double-quoted AppleScript string literal. */
function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const CAPTURE_Z_ORDER_SCRIPT = `
import CoreGraphics
import Foundation

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    print("[]")
    exit(0)
}

var seen = Set<String>()
var order: [String] = []
for window in list {
    guard let layer = window[kCGWindowLayer as String] as? Int, layer == 0 else { continue }
    guard let name = window[kCGWindowOwnerName as String] as? String else { continue }
    if seen.contains(name) { continue }
    seen.insert(name)
    order.append(name)
}

if let data = try? JSONSerialization.data(withJSONObject: order),
   let json = String(data: data, encoding: .utf8) {
    print(json)
} else {
    print("[]")
}
`;

/**
 * Front-to-back list of app names for currently on-screen windows (index 0 = topmost).
 * Returns [] if the Swift toolchain isn't installed — layering is a best-effort enhancement,
 * not something a save should fail over.
 */
export async function captureZOrder(): Promise<string[]> {
  try {
    return JSON.parse(await runSwiftScript(CAPTURE_Z_ORDER_SCRIPT)) as string[];
  } catch {
    return [];
  }
}

/** Re-activates apps back-to-front so the final on-screen stack matches the saved order. */
export async function restoreZOrder(order: string[], windows: LayoutWindow[]): Promise<void> {
  const bundleIdByAppName = new Map(windows.map((w) => [w.appName, w.bundleId]));
  const backToFront = [...order].reverse();
  for (const appName of backToFront) {
    const bundleId = bundleIdByAppName.get(appName);
    if (!bundleId) continue;
    try {
      await execFileAsync("open", ["-b", bundleId]);
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch {
      // best effort — a failed activation shouldn't block restoring the rest of the stack
    }
  }
}

const CAPTURE_DISPLAYS_SCRIPT = `
import CoreGraphics
import Foundation

var displayCount: UInt32 = 0
CGGetActiveDisplayList(0, nil, &displayCount)
var displayIDs = [CGDirectDisplayID](repeating: 0, count: Int(displayCount))
CGGetActiveDisplayList(displayCount, &displayIDs, &displayCount)

let bounds = displayIDs.map { id -> [String: Double] in
    let b = CGDisplayBounds(id)
    return ["x": Double(b.origin.x), "y": Double(b.origin.y), "width": Double(b.size.width), "height": Double(b.size.height)]
}

if let data = try? JSONSerialization.data(withJSONObject: bounds),
   let json = String(data: data, encoding: .utf8) {
    print(json)
} else {
    print("[]")
}
`;

/**
 * Bounds of every active display, in the same global (top-left origin, y-down) coordinate
 * space AppleScript/System Events use for window position — so they're directly comparable
 * to captured LayoutWindow coordinates. Returns [] if Swift isn't installed.
 */
export async function captureDisplays(): Promise<DisplayBounds[]> {
  try {
    return JSON.parse(await runSwiftScript(CAPTURE_DISPLAYS_SCRIPT)) as DisplayBounds[];
  } catch {
    return [];
  }
}

/** Which display (if any) a window's center point falls on. */
export function findDisplayForWindow(w: LayoutWindow, displays: DisplayBounds[]): DisplayBounds | undefined {
  const centerX = w.x + w.width / 2;
  const centerY = w.y + w.height / 2;
  return displays.find((d) => centerX >= d.x && centerX < d.x + d.width && centerY >= d.y && centerY < d.y + d.height);
}

function distanceBetween(a: DisplayBounds, b: DisplayBounds): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sameBounds(a: DisplayBounds, b: DisplayBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Maps a saved window onto the current display setup. If the display it was saved on is still
 * present (same bounds), the position is used as-is. Otherwise it's replayed at the same offset
 * from the closest current display's origin, clamped so the window stays fully on-screen —
 * handles a monitor being disconnected, resized, or rearranged since the layout was saved.
 */
export function remapToCurrentDisplays(w: LayoutWindow, currentDisplays: DisplayBounds[]): LayoutWindow {
  if (!w.display || currentDisplays.length === 0) return w;
  const target =
    currentDisplays.find((d) => sameBounds(d, w.display as DisplayBounds)) ??
    currentDisplays.reduce((closest, d) =>
      distanceBetween(d, w.display as DisplayBounds) < distanceBetween(closest, w.display as DisplayBounds)
        ? d
        : closest,
    );
  if (sameBounds(target, w.display)) return w;

  const offsetX = w.x - w.display.x;
  const offsetY = w.y - w.display.y;
  const width = Math.round(Math.min(w.width, target.width));
  const height = Math.round(Math.min(w.height, target.height));
  const x = Math.round(Math.min(Math.max(target.x + offsetX, target.x), target.x + target.width - width));
  const y = Math.round(Math.min(Math.max(target.y + offsetY, target.y), target.y + target.height - height));
  return { ...w, x, y, width, height };
}

const CAPTURE_SCRIPT = `
set output to ""
tell application "System Events"
  set procs to every application process whose visible is true
  repeat with proc in procs
    try
      if (count of windows of proc) > 0 then
        set win to window 1 of proc
        set {posX, posY} to position of win
        set {winW, winH} to size of win
        set appName to name of proc
        set bId to bundle identifier of proc
        set output to output & appName & "\\t" & bId & "\\t" & posX & "\\t" & posY & "\\t" & winW & "\\t" & winH & "\\n"
      end if
    end try
  end repeat
end tell
return output
`;

function parseCapturedWindowLine(line: string): LayoutWindow | undefined {
  const fields = line.split("\t");
  if (fields.length !== 6) return undefined;
  const [appName, bundleId, x, y, width, height] = fields;
  const window = { appName, bundleId, x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
  const isValid =
    !!window.appName &&
    !!window.bundleId &&
    Number.isFinite(window.x) &&
    Number.isFinite(window.y) &&
    Number.isFinite(window.width) &&
    Number.isFinite(window.height);
  return isValid ? window : undefined;
}

export async function captureVisibleWindows(): Promise<LayoutWindow[]> {
  const raw = await runAppleScript(CAPTURE_SCRIPT);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCapturedWindowLine)
    .filter((w): w is LayoutWindow => w !== undefined);
}

function hasWindowScript(bundleId: string): string {
  return `
tell application "System Events"
  set procs to every application process whose bundle identifier is "${escapeForAppleScript(bundleId)}"
  if (count of procs) = 0 then return "false"
  if (count of windows of item 1 of procs) = 0 then return "false"
  return "true"
end tell
`;
}

async function waitForWindow(bundleId: string, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await runAppleScript(hasWindowScript(bundleId));
    if (result.trim() === "true") return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

function positionScript(bundleId: string, w: LayoutWindow): string {
  return `
tell application "System Events"
  set proc to first application process whose bundle identifier is "${escapeForAppleScript(bundleId)}"
  set position of window 1 of proc to {${Math.round(w.x)}, ${Math.round(w.y)}}
  set size of window 1 of proc to {${Math.round(w.width)}, ${Math.round(w.height)}}
end tell
`;
}

export interface ApplyResult {
  appName: string;
  ok: boolean;
  error?: string;
}

export async function applyWindow(w: LayoutWindow, currentDisplays: DisplayBounds[]): Promise<ApplyResult> {
  try {
    await execFileAsync("open", ["-g", "-b", w.bundleId]);
    const appeared = await waitForWindow(w.bundleId);
    if (!appeared) {
      return { appName: w.appName, ok: false, error: "app did not open a window in time" };
    }
    await runAppleScript(positionScript(w.bundleId, remapToCurrentDisplays(w, currentDisplays)));
    return { appName: w.appName, ok: true };
  } catch (error) {
    return { appName: w.appName, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
