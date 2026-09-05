import { LocalStorage } from "@raycast/api";
import { Layout } from "./types";

const STORAGE_KEY = "layouts";

export async function getLayouts(): Promise<Layout[]> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Layout[];
}

export async function saveLayout(layout: Layout): Promise<void> {
  const layouts = await getLayouts();
  const withoutExisting = layouts.filter((l) => l.name !== layout.name);
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify([...withoutExisting, layout]));
}

export async function deleteLayout(name: string): Promise<void> {
  const layouts = await getLayouts();
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(layouts.filter((l) => l.name !== name)));
}
