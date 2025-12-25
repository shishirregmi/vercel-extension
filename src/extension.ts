/// <reference types="node" />
// @ts-ignore: VS Code extension host provides setInterval/clearInterval
declare function setInterval(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
declare function clearInterval(handle?: any): void;
import * as vscode from "vscode";

import { TokenStore } from "./auth/tokenStore";
import { VercelClient } from "./api/vercelClient";
import { VercelTreeProvider } from "./views/vercelTreeProvider";

import { cmdCancelDeployment, cmdOpenDeployment, cmdRedeployLatest, cmdRefresh, cmdAddEnvVar, cmdEditEnvVar, cmdShowDeploymentLogs } from "./commands/actions";
// Use require for http to avoid type issues in VS Code extension context
const http = require("http");

export async function activate(context: vscode.ExtensionContext) {
  const tokenStore = new TokenStore(context);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "Vercel: (not connected)";
  statusBar.command = "vercel.setToken";
  statusBar.show();
  context.subscriptions.push(statusBar);

  const getClient = async (): Promise<VercelClient | null> => {
    const token = await tokenStore.getToken();
    if (!token) return null;
    return new VercelClient(token);
  };

  const treeProvider = new VercelTreeProvider(getClient);
  const treeView = vscode.window.createTreeView("vercelProjects", { treeDataProvider: treeProvider });
  context.subscriptions.push(treeView);

  // Commands
  // Removed manual token entry. Use OAuth only.
  context.subscriptions.push(
    ...[
      vscode.commands.registerCommand("vercel.setToken", async () => {
        const token = await vscode.window.showInputBox({
          prompt: "Enter your Vercel Personal Token (stored securely in VS Code)",
          password: true,
          ignoreFocusOut: true
        });
        if (!token) return;
        await tokenStore.setToken(token);
        vscode.window.showInformationMessage("Vercel token saved.");
        treeProvider.refresh();
        await updateStatusBar(statusBar, getClient);
      }),

      vscode.commands.registerCommand("vercel.clearToken", async () => {
        await tokenStore.clearToken();
        vscode.window.showInformationMessage("Vercel token cleared.");
        treeProvider.refresh();
        await updateStatusBar(statusBar, getClient);
      }),

      vscode.commands.registerCommand("vercel.refresh", async () => {
        await cmdRefresh(treeProvider);
        await updateStatusBar(statusBar, getClient);
      }),

      vscode.commands.registerCommand("vercel.openDeployment", async (node) => {
        await cmdOpenDeployment(node);
      }),

      vscode.commands.registerCommand("vercel.cancelDeployment", async (node) => {
        const client = await getClient();
        if (!client) return vscode.window.showWarningMessage("Authenticate with Vercel first (OAuth).");
        try {
          await cmdCancelDeployment(node, client);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Cancel failed: ${e?.message ?? e}`);
        } finally {
          treeProvider.refresh();
          await updateStatusBar(statusBar, getClient);
        }
      }),

      vscode.commands.registerCommand("vercel.redeployLatest", async (node) => {
        const client = await getClient();
        if (!client) return vscode.window.showWarningMessage("Authenticate with Vercel first (OAuth).");
        try {
          await cmdRedeployLatest(node, client);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Redeploy failed: ${e?.message ?? e}`);
        } finally {
          treeProvider.refresh();
          await updateStatusBar(statusBar, getClient);
        }
      }),

      vscode.commands.registerCommand("vercel.addEnvVar", async (node) => {
        const client = await getClient();
        if (!client) {
          vscode.window.showErrorMessage('Not authenticated with Vercel.');
          return;
        }
        await cmdAddEnvVar(node, treeProvider, client);
      }),
      vscode.commands.registerCommand("vercel.editEnvVar", async (node) => {
        const client = await getClient();
        if (!client) {
          vscode.window.showErrorMessage('Not authenticated with Vercel.');
          return;
        }
        await cmdEditEnvVar(node, treeProvider, client);
      }),
      vscode.commands.registerCommand("vercel.showDeploymentLogs", async (node) => {
        await cmdShowDeploymentLogs(node);
      }),

      vscode.commands.registerCommand("vercel.removeEnvVar", async (node) => {
        const client = await getClient();
        if (!client) {
          vscode.window.showErrorMessage('Not authenticated with Vercel.');
          return;
        }
        await (await import("./commands/actions")).cmdRemoveEnvVar(node, treeProvider, client);
      }),
    ]
  );

  // Initial status bar update + polling (optional)
  await updateStatusBar(statusBar, getClient);

  // --- Periodic and event-driven refresh logic ---
  let pollInterval = 60_000;
  let pollHandle: any = null;
  let lastDeploymentState: string | undefined = undefined;

  async function refreshAll() {
    await updateStatusBar(statusBar, getClient);
    treeProvider.refresh();
  }

  async function checkDeploymentsAndAdjustPolling() {
    const client = await getClient();
    if (!client) return;
    // Get current project
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let currentProjectNameOrId: string | undefined;
    if (workspaceFolders && workspaceFolders.length > 0) {
      currentProjectNameOrId = workspaceFolders[0].name;
    }
    const { projects } = await client.listProjects();
    if (!projects?.length) return;
    let project = projects[0];
    if (currentProjectNameOrId) {
      const found = projects.find(
        (p) =>
          p.name.toLowerCase() === currentProjectNameOrId!.toLowerCase() ||
          p.id === currentProjectNameOrId
      );
      if (found) project = found;
    }
    const { deployments } = await client.listDeploymentsByProject(project.id);
    // If any deployment is BUILDING or QUEUED, poll every 5s, else 60s
    const deploying = deployments.some(d => d.state === 'BUILDING' || d.state === 'QUEUED');
    const newInterval = deploying ? 5000 : 60000;
    if (pollInterval !== newInterval) {
      pollInterval = newInterval;
      if (pollHandle) clearInterval(pollHandle);
      pollHandle = setInterval(async () => {
        await refreshAll();
        await checkDeploymentsAndAdjustPolling();
      }, pollInterval);
    }
  }

  // Initial refresh and polling setup
  await refreshAll();
  pollHandle = setInterval(async () => {
    await refreshAll();
    await checkDeploymentsAndAdjustPolling();
  }, pollInterval);
  context.subscriptions.push({ dispose: () => clearInterval(pollHandle) });

  // Listen for git push events and refresh after 5s
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (gitExt) {
    await gitExt.activate();
    const gitApi = gitExt.exports.getAPI(1);
    gitApi.onDidRunGitOperation((e: any) => {
      if (e.operation === 4) { // 4 = Push
        setTimeout(() => {
          refreshAll();
          checkDeploymentsAndAdjustPolling();
        }, 5000);
      }
    });
  }
}

export function deactivate() {}

async function updateStatusBar(
  statusBar: vscode.StatusBarItem,
  getClient: () => Promise<VercelClient | null>
) {
  const client = await getClient();
  if (!client) {
    statusBar.text = "Vercel: (not connected)";
    statusBar.command = "vercel.setToken";
    return;
  }

  try {
    // Get the open workspace folder name
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let currentProjectNameOrId: string | undefined;
    if (workspaceFolders && workspaceFolders.length > 0) {
      // Use the first workspace folder's name as the project name
      currentProjectNameOrId = workspaceFolders[0].name;
    }

    const { projects } = await client.listProjects();
    if (!projects?.length) {
      statusBar.text = "Vercel: no projects";
      statusBar.command = "vercel.refresh";
      return;
    }

    // Try to find a project matching the open folder name or id
    let project = projects[0];
    if (currentProjectNameOrId) {
      const found = projects.find(
        (p) =>
          p.name.toLowerCase() === currentProjectNameOrId!.toLowerCase() ||
          p.id === currentProjectNameOrId
      );
      if (found) project = found;
    }

    const { deployments } = await client.listDeploymentsByProject(project.id);
    const latest = deployments?.[0];

    if (!latest) {
      statusBar.text = `Vercel: ${project.name} (no deployments)`;
      statusBar.command = "vercel.refresh";
      return;
    }

    statusBar.text = `Vercel: ${project.name} • ${latest.state ?? "UNKNOWN"}`;
    statusBar.command = "vercel.refresh";
  } catch {
    statusBar.text = "Vercel: error (check authentication)";
    statusBar.command = "vercel.setToken";
  }
}
