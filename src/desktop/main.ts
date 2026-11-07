import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session,
} from "electron";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_URL, DesktopClient, trustedSender } from "./bridge.js";
import { ensureService } from "./service-client.js";

if (process.env.ARGENT_DESKTOP_SMOKE === "1")
  console.log("[ARGENT_STAGE] main module loaded");
app.setName("Argent");
if (process.env.ARGENT_DESKTOP_DATA_DIR)
  app.setPath("userData", process.env.ARGENT_DESKTOP_DATA_DIR);
protocol.registerSchemesAsPrivileged([
  { scheme: "argent", privileges: { standard: true, secure: true } },
]);
const ownsApp = app.requestSingleInstanceLock();
if (!ownsApp) app.quit();
else {
  // Let Electron finish evaluating the entry module before awaiting its ready event.
  void (async () => {
    let window: BrowserWindow | null = null;
    app.on("second-instance", () => {
      window?.show();
      window?.focus();
    });
    await app.whenReady();
    if (process.env.ARGENT_DESKTOP_SMOKE === "1")
      console.log("[ARGENT_STAGE] electron ready");
    const directory = join(app.getPath("userData"), "execution");
    // The development smoke test cannot drive a native dialog.
    const smokeRepository =
      process.env.ARGENT_DESKTOP_SMOKE === "1"
        ? process.env.ARGENT_DESKTOP_SMOKE_REPOSITORY
        : undefined;
    const client = new DesktopClient(directory, async () => {
      if (smokeRepository) return smokeRepository;
      // The folder comes only from this native dialog, never from the renderer.
      const options = {
        title: "Choose a Git repository",
        buttonLabel: "Create workspace",
        message:
          "Argent creates a new branch in a private worktree. Your checkout is not changed.",
        properties: ["openDirectory" as const],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      return result.canceled || !result.filePaths[0]
        ? null
        : result.filePaths[0];
    });
    const assets = fileURLToPath(new URL("../../ui/", import.meta.url));
    const allowed = new Map([
      ["/index.html", "text/html"],
      ["/app.js", "text/javascript"],
      ["/history.js", "text/javascript"],
      ["/shell.js", "text/javascript"],
      ["/styles.css", "text/css"],
      ["/argent-icon.webp", "image/webp"],
    ]);
    for (const name of readdirSync(join(assets, "icons"))) {
      if (/^[a-z0-9-]+\.svg$/.test(name))
        allowed.set(`/icons/${name}`, "image/svg+xml");
    }
    const csp =
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    protocol.handle("argent", (request) => {
      const url = new URL(request.url);
      const type = allowed.get(url.pathname);
      if (url.host !== "app" || !type || request.method !== "GET" || url.search)
        return new Response("Not found", { status: 404 });
      try {
        return new Response(readFileSync(join(assets, url.pathname.slice(1))), {
          headers: {
            "Content-Type": type,
            "Content-Security-Policy": csp,
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch {
        return new Response("Packaged resource unavailable", { status: 404 });
      }
    });
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    ipcMain.handle(
      "argent:call",
      async (event, method: unknown, args: unknown) => {
        if (
          !window ||
          event.sender.id !== window.webContents.id ||
          !trustedSender(
            event.senderFrame?.url ?? "",
            event.senderFrame === window.webContents.mainFrame,
          )
        ) {
          return { ok: false, error: "Untrusted desktop caller" };
        }
        return client.call(method, args);
      },
    );

    function createWindow(): BrowserWindow {
      const created = new BrowserWindow({
        width: 1380,
        height: 900,
        minWidth: 900,
        minHeight: 620,
        title: "Argent",
        backgroundColor: "#141719",
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 19, y: 20 },
        webPreferences: {
          preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          webviewTag: false,
        },
      });
      window = created;
      created.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      created.webContents.on("will-navigate", (event, url) => {
        if (url !== APP_URL) event.preventDefault();
      });
      created.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      created.once("closed", () => {
        if (window === created) window = null;
      });
      void created
        .loadURL(APP_URL)
        .catch(() =>
          dialog.showErrorBox(
            "Argent could not open",
            "Rebuild the desktop resources and launch again.",
          ),
        );
      return created;
    }

    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Argent",
          submenu: [
            { role: "about" },
            { type: "separator" },
            {
              label: "Show Argent",
              click: () => {
                if (!window) createWindow();
                else {
                  window.show();
                  window.focus();
                }
              },
            },
            {
              label: "Stop local execution service…",
              click: async () => {
                const answer = await dialog.showMessageBox({
                  type: "question",
                  buttons: ["Keep running", "Stop service"],
                  defaultId: 0,
                  cancelId: 0,
                  message: "Stop the local execution service?",
                  detail:
                    "Active runs, including Claude Code sessions, are stopped and will need review. Workspaces, worktrees and history are preserved.",
                });
                if (answer.response === 1) await client.call("stopService", []);
              },
            },
            { type: "separator" },
            { role: "quit", label: "Quit Argent (keep service running)" },
          ],
        },
        { role: "editMenu" },
        {
          label: "View",
          submenu: [
            { role: "reload" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { role: "togglefullscreen" },
          ],
        },
        { role: "windowMenu" },
      ]),
    );
    try {
      await ensureService(directory);
    } catch {
      /* The UI exposes disconnected state and an explicit reconnect action. */
    }
    const initial = createWindow();
    app.on("activate", () => {
      if (!window) createWindow();
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
    // Controlled development smoke tests execute only when explicitly launched with this flag.
    if (process.env.ARGENT_DESKTOP_SMOKE === "1") {
      const { runDesktopSmoke } = await import("./smoke.js");
      try {
        await runDesktopSmoke(initial, client);
        app.exit(0);
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
    }
  })().catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
}
