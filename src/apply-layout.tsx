import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
  confirmAlert,
  Alert,
  LaunchProps,
  popToRoot,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { Layout } from "./lib/types";
import { getLayouts, deleteLayout } from "./lib/storage";
import { applyWindow, restoreZOrder } from "./lib/windows";

const EXTENSION_AUTHOR = "neil";
const EXTENSION_NAME = "window-layouts";

export function quicklinkFor(layoutName: string): string {
  const args = encodeURIComponent(JSON.stringify({ name: layoutName }));
  return `raycast://extensions/${EXTENSION_AUTHOR}/${EXTENSION_NAME}/apply-layout?arguments=${args}`;
}

type Props = LaunchProps<{ arguments: { name?: string } }>;

export default function ApplyLayoutCommand(props: Props) {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const ranAutoApply = useRef(false);

  async function reload() {
    setIsLoading(true);
    const loaded = await getLayouts();
    setLayouts(loaded);
    setIsLoading(false);
    return loaded;
  }

  useEffect(() => {
    reload().then(async (loaded) => {
      const requestedName = props.arguments.name?.trim();
      if (!requestedName || ranAutoApply.current) return;
      ranAutoApply.current = true;
      const layout = loaded.find((l) => l.name.toLowerCase() === requestedName.toLowerCase());
      if (!layout) {
        await showToast({ style: Toast.Style.Failure, title: `No layout named "${requestedName}"` });
        return;
      }
      await handleApply(layout);
      await popToRoot();
    });
  }, []);

  async function handleApply(layout: Layout) {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Applying "${layout.name}"...` });
    const results = await Promise.all(layout.windows.map(applyWindow));
    if (layout.zOrder?.length) {
      await restoreZOrder(layout.zOrder, layout.windows);
    }
    const failures = results.filter((r) => !r.ok);
    if (failures.length === 0) {
      toast.style = Toast.Style.Success;
      toast.title = `Applied "${layout.name}"`;
      toast.message = `${results.length} window${results.length === 1 ? "" : "s"} restored`;
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = `Applied with ${failures.length} error${failures.length === 1 ? "" : "s"}`;
      toast.message = failures.map((f) => `${f.appName}: ${f.error}`).join("; ");
    }
  }

  async function handleDelete(layout: Layout) {
    const confirmed = await confirmAlert({
      title: `Delete "${layout.name}"?`,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    await deleteLayout(layout.name);
    await reload();
  }

  return (
    <List isLoading={isLoading}>
      <List.EmptyView
        title="No saved layouts yet"
        description="Run 'Save Layout' after arranging your windows the way you like them."
        icon={Icon.Window}
      />
      {layouts.map((layout) => (
        <List.Item
          key={layout.name}
          icon={Icon.AppWindowGrid2x2}
          title={layout.name}
          subtitle={`${layout.windows.length} window${layout.windows.length === 1 ? "" : "s"}`}
          accessories={[{ text: new Date(layout.createdAt).toLocaleDateString() }]}
          actions={
            <ActionPanel>
              <Action title="Apply Layout" icon={Icon.Play} onAction={() => handleApply(layout)} />
              <Action.CreateQuicklink
                title="Create Quicklink to Apply Instantly"
                quicklink={{ name: `Apply ${layout.name}`, link: quicklinkFor(layout.name) }}
              />
              <Action
                title="Delete Layout"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                onAction={() => handleDelete(layout)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
