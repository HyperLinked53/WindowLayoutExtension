import { runAppleScript } from "@raycast/utils";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import { LayoutWindow } from "./types";

const execFileAsync = promisify(execFile);

// Front-to-back stacking order isn't exposed by System Events. CGWindowListCopyWindowInfo
// (Core Graphics) returns on-screen windows already ordered front-to-back, but JXA's CF<->NS
// bridging for it is unreliable (bridging a CFArrayRef return value silently drops elements),
// so this shells out to a tiny Swift script, which bridges it natively.
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
  const scriptPath = join(tmpdir(), `window-layouts-zorder-${Date.now()}-${Math.random().toString(36).slice(2)}.swift`);
  await writeFile(scriptPath, CAPTURE_Z_ORDER_SCRIPT, "utf8");
  try {
    const { stdout } = await execFileAsync("swift", [scriptPath]);
    return JSON.parse(stdout.trim()) as string[];
  } catch {
    return [];
  } finally {
    await unlink(scriptPath).catch(() => {});
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

export async function captureVisibleWindows(): Promise<LayoutWindow[]> {
  const raw = await runAppleScript(CAPTURE_SCRIPT);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [appName, bundleId, x, y, width, height] = line.split("\t");
      return { appName, bundleId, x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
    });
}

function hasWindowScript(bundleId: string): string {
  return `
tell application "System Events"
  set procs to every application process whose bundle identifier is "${bundleId}"
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
  set proc to first application process whose bundle identifier is "${bundleId}"
  set position of window 1 of proc to {${w.x}, ${w.y}}
  set size of window 1 of proc to {${w.width}, ${w.height}}
end tell
`;
}

export interface ApplyResult {
  appName: string;
  ok: boolean;
  error?: string;
}

export async function applyWindow(w: LayoutWindow): Promise<ApplyResult> {
  try {
    await execFileAsync("open", ["-g", "-b", w.bundleId]);
    const appeared = await waitForWindow(w.bundleId);
    if (!appeared) {
      return { appName: w.appName, ok: false, error: "app did not open a window in time" };
    }
    await runAppleScript(positionScript(w.bundleId, w));
    return { appName: w.appName, ok: true };
  } catch (error) {
    return { appName: w.appName, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
