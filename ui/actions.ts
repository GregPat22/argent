// Late-bound application actions, so view modules can trigger work without
// importing the orchestrator (which imports them).
import type { DesktopBridge } from "../src/desktop/contracts.js";

const bridge = window.argent;

export function hasBridge(): boolean {
  return !!bridge;
}

export function api(): DesktopBridge {
  if (!bridge)
    throw new Error(
      "Open Argent from the installed desktop application to connect to its local service.",
    );
  return bridge;
}

export const actions = {
  render: (): void => {},
  refresh: async (): Promise<void> => {},
  selectWorkspace: (_id: string): void => {},
  mutate: async (_action: () => Promise<void>): Promise<void> => {},
  showError: (_error: unknown): void => {},
  clearError: (): void => {},
  addRepository: (): void => {},
  newWorkspaceFrom: (_id: string): void => {},
  openDemo: (): void => {},
  openSettings: (): void => {},
  openPalette: (): void => {},
  resolveRun: (_id: string): void => {},
  focusComposer: (): void => {},
};
