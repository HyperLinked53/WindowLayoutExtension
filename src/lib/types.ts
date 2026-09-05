export interface LayoutWindow {
  appName: string;
  bundleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  name: string;
  createdAt: string;
  windows: LayoutWindow[];
  /** App names front-to-back (index 0 = topmost) at save time. */
  zOrder: string[];
}
