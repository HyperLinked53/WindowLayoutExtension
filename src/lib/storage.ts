import { LocalStorage } from "@raycast/api";
import { Layout } from "./types";

const STORAGE_KEY = "layouts";

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export async function getLayouts(): Promise<Layout[]> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Layout[];
  } catch {
    return [];
  }
}

export async function findLayout(name: string): Promise<Layout | undefined> {
  const layouts = await getLayouts();
  return layouts.find((l) => sameName(l.name, name));
}

export async function saveLayout(layout: Layout): Promise<void> {
  const layouts = await getLayouts();
  const withoutExisting = layouts.filter((l) => !sameName(l.name, layout.name));
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify([...withoutExisting, layout]));
}

export async function deleteLayout(name: string): Promise<void> {
  const layouts = await getLayouts();
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(layouts.filter((l) => !sameName(l.name, name))));
}
