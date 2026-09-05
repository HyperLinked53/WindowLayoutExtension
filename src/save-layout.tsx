import { Action, ActionPanel, Form, showToast, Toast, popToRoot, confirmAlert, Alert } from "@raycast/api";
import { useState } from "react";
import { captureVisibleWindows, captureZOrder, captureDisplays, findDisplayForWindow } from "./lib/windows";
import { saveLayout, findLayout } from "./lib/storage";

export default function SaveLayoutCommand() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(values: { name: string }) {
    const name = values.name.trim();
    if (!name) {
      await showToast({ style: Toast.Style.Failure, title: "Name is required" });
      return;
    }
    const existing = await findLayout(name);
    if (existing) {
      const confirmed = await confirmAlert({
        title: `Overwrite "${existing.name}"?`,
        message: "A layout with this name already exists.",
        primaryAction: { title: "Overwrite", style: Alert.ActionStyle.Destructive },
      });
      if (!confirmed) return;
    }
    setIsLoading(true);
    try {
      const [windows, zOrder, displays] = await Promise.all([
        captureVisibleWindows(),
        captureZOrder(),
        captureDisplays(),
      ]);
      if (windows.length === 0) {
        await showToast({ style: Toast.Style.Failure, title: "No visible windows found" });
        return;
      }
      const windowsWithDisplay = windows.map((w) => ({ ...w, display: findDisplayForWindow(w, displays) }));
      await saveLayout({ name, createdAt: new Date().toISOString(), windows: windowsWithDisplay, zOrder });
      await showToast({
        style: Toast.Style.Success,
        title: "Layout saved",
        message: `${windows.length} window${windows.length === 1 ? "" : "s"} captured`,
      });
      await popToRoot();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save layout",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Current Window Arrangement" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Arrange your windows the way you want them, then save that arrangement as a named layout." />
      <Form.TextField id="name" title="Layout Name" placeholder="e.g. Coding, Writing, Morning Setup" autoFocus />
    </Form>
  );
}
