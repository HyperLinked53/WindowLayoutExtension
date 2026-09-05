export interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutWindow {
  appName: string;
  bundleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Bounds of the display this window was on when saved. Absent for layouts saved before multi-monitor support. */
  display?: DisplayBounds;
}

export interface Layout {
  name: string;
  createdAt: string;
  windows: LayoutWindow[];
  /** App names front-to-back (index 0 = topmost) at save time. */
  zOrder: string[];
}
