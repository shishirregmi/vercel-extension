import * as vscode from 'vscode';
import { VercelClient } from '../api/vercelClient';
import { VercelProject, VercelDeployment, VercelEnvVar } from '../api/types';

export type TreeNode =
  | { kind: 'root' }
  | { kind: 'project'; project: VercelProject }
  | { kind: 'envGroup'; project: VercelProject }
  | { kind: 'envVar'; project: VercelProject; env: VercelEnvVar }
  | { kind: 'envAdd'; project: VercelProject }
  | { kind: 'deploymentsFolder'; project: VercelProject }
  | { kind: 'deploymentsEnvFolder'; project: VercelProject; target: 'production' | 'preview' }
  | { kind: 'deployment'; project: VercelProject; deployment: VercelDeployment }
  | { kind: 'deploymentLogs'; project: VercelProject; deployment: VercelDeployment };

        export class VercelTreeProvider implements vscode.TreeDataProvider<TreeNode> {
          private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
          readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

          constructor(private getClient: () => Promise<VercelClient | null>) {}

          refresh(): void {
            this._onDidChangeTreeData.fire(undefined);
          }

          getTreeItem(element: TreeNode): vscode.TreeItem {
            switch (element.kind) {
              case "root": {
                return new vscode.TreeItem("Vercel", vscode.TreeItemCollapsibleState.Expanded);
              }
              case "project": {
                const item = new vscode.TreeItem(element.project.name, vscode.TreeItemCollapsibleState.Collapsed);
                item.contextValue = "vercelProject";
                item.iconPath = new vscode.ThemeIcon("repo");
                item.description = element.project.id;
                return item;
              }
              case "envGroup": {
                const item = new vscode.TreeItem("Environment Variables", vscode.TreeItemCollapsibleState.Expanded);
                item.contextValue = "vercelEnvGroup";
                item.iconPath = new vscode.ThemeIcon("symbol-variable");
                return item;
              }
              case "deploymentsFolder": {
                const item = new vscode.TreeItem("Deployments", vscode.TreeItemCollapsibleState.Expanded);
                item.contextValue = "vercelDeploymentsFolder";
                item.iconPath = new vscode.ThemeIcon("cloud-upload");
                return item;
              }
              case "deploymentsEnvFolder": {
                const label = element.target === 'production' ? 'Production' : 'Preview';
                const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
                item.contextValue = `vercelDeploymentsEnvFolder_${element.target}`;
                item.iconPath = new vscode.ThemeIcon(element.target === 'production' ? 'rocket' : 'beaker');
                return item;
              }
              case "envVar": {
                const env = element.env;
                const isRedacted = typeof env.value === 'string' && (env.value.length > 20 && /[A-Za-z0-9+/=]{20,}/.test(env.value));
                // Only show the key, not the value
                const item = new vscode.TreeItem(`${env.key}`, vscode.TreeItemCollapsibleState.None);
                item.contextValue = "vercelEnvVar";
                item.iconPath = new vscode.ThemeIcon("symbol-key");
                let tooltip = `Type: ${env.type}\nTargets: ${env.target.join(', ')}\nCreated: ${formatWhen(env.createdAt)}\nUpdated: ${formatWhen(env.updatedAt)}`;
                if (env.gitBranch) tooltip += `\nBranch: ${env.gitBranch}`;
                if (env.comment) tooltip += `\nComment: ${env.comment}`;
                if (isRedacted) tooltip += `\n\n⚠️ Value is redacted by Vercel API. Even with decrypt=true and full access, some values may be hidden for security reasons.`;
                item.tooltip = tooltip;
                item.command = {
                  command: "vercel.editEnvVar",
                  title: "Edit Environment Variable",
                  arguments: [element]
                };
                return item;
              }
              case "envAdd": {
                const item = new vscode.TreeItem("Add Environment Variable", vscode.TreeItemCollapsibleState.None);
                item.contextValue = "vercelEnvAdd";
                item.iconPath = new vscode.ThemeIcon("add");
                item.command = {
                  command: "vercel.addEnvVar",
                  title: "Add Environment Variable",
                  arguments: [element]
                };
                return item;
              }
              case "deployment": {
                const d = element.deployment;
                // Try to extract commit info from meta (Vercel provides these if connected to GitHub)
                const commitMsg = d.meta?.githubCommitMessage || d.meta?.githubCommitMessageOriginal || d.meta?.githubCommitMessageTitle;
                const commitSha = d.meta?.githubCommitSha || d.meta?.githubCommitRef;
                const commitAuthor = d.meta?.githubCommitAuthorName || d.meta?.githubCommitAuthorLogin;
                const branch = d.meta?.githubCommitRef || d.meta?.githubBranch;
                let label = `${d.target === "production" ? "prod" : "preview"} • ${d.state ?? "UNKNOWN"}`;
                if (branch) label += ` • ${branch}`;
                if (commitMsg) label += ` • ${commitMsg.substring(0, 40)}${commitMsg.length > 40 ? '…' : ''}`;
                const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
                // Show redeploy for READY, cancel for BUILDING/QUEUED
                if (d.state === 'READY') {
                  item.contextValue = "vercelDeployment_redeploy";
                } else if (d.state === 'BUILDING' || d.state === 'QUEUED') {
                  item.contextValue = "vercelDeployment_cancel";
                } else {
                  item.contextValue = "vercelDeployment";
                }
                item.iconPath = iconForStateColored(d.state);
                let tooltip = `${element.project.name}\n${d.url ?? ""}\n${formatWhen(d.created)}\n${d.uid}`;
                if (branch) tooltip += `\nBranch: ${branch}`;
                if (commitMsg) tooltip += `\nCommit: ${commitMsg}`;
                if (commitSha) tooltip += `\nSHA: ${commitSha}`;
                if (commitAuthor) tooltip += `\nAuthor: ${commitAuthor}`;
                item.tooltip = tooltip;
                item.description = d.url ?? d.uid;
                if (d.url) {
                  item.command = {
                    command: "vercel.openDeployment",
                    title: "Open Deployment",
                    arguments: [element]
                  };
                }
                return item;
              }
              case "deploymentLogs": {
                const d = element.deployment;
                const label = `Logs: ${d.target === 'production' ? 'Production' : 'Preview'} • ${d.state ?? 'UNKNOWN'}${d.url ? ' • ' + d.url : ''}`;
                const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
                item.contextValue = "vercelDeploymentLogs";
                item.iconPath = new vscode.ThemeIcon("output");
                item.command = {
                  command: "vercel.showDeploymentLogs",
                  title: "Show Deployment Logs",
                  arguments: [element]
                };
                return item;
              }
              default:
                return new vscode.TreeItem("Unknown", vscode.TreeItemCollapsibleState.None);
            }
          }

          async getChildren(element?: TreeNode): Promise<TreeNode[]> {
            const client = await this.getClient();
            if (!client) {
              return [
                {
                  kind: 'deployment',
                  project: { id: 'token', name: 'No token set' } as VercelProject,
                  deployment: { uid: 'set-token', state: 'Set Vercel token (Command: Vercel: Set Personal Token)', created: Date.now() } as VercelDeployment
                }
              ];
            }
            let currentProjectNameOrId: string | undefined;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
              currentProjectNameOrId = workspaceFolders[0].name;
            }
            const { projects } = await client.listProjects();
            if (!projects?.length) return [];
            let project = projects[0];
            if (currentProjectNameOrId) {
              const found = projects.find(
                (p) =>
                  p.name.toLowerCase() === currentProjectNameOrId!.toLowerCase() ||
                  p.id === currentProjectNameOrId
              );
              if (found) project = found;
            }
            if (!element || element.kind === 'root') {
              return [{ kind: 'project', project }];
            }
            if (element.kind === 'project') {
              return [
                { kind: 'envGroup', project: element.project },
                { kind: 'deploymentsFolder', project: element.project }
              ];
            }
            if (element.kind === 'deploymentsFolder') {
              // Show two subfolders: Production and Preview
              return [
                { kind: 'deploymentsEnvFolder', project: element.project, target: 'production' },
                { kind: 'deploymentsEnvFolder', project: element.project, target: 'preview' }
              ];
            }
            if (element.kind === 'deploymentsEnvFolder') {
              const { deployments } = await client.listDeploymentsByProject(element.project.id);
              // Only show deployments for the selected environment
              return deployments
                .filter(d => d.target === element.target)
                .map((d) => ({ kind: 'deployment' as const, project: element.project, deployment: d }));
            }
            if (element.kind === 'envGroup') {
              // Fetch real environment variables from Vercel API
              const { envs } = await client.listEnvVarsByProject(element.project.id);
              return [
                ...envs.map(env => ({ kind: "envVar" as const, project: element.project, env })),
                { kind: "envAdd" as const, project: element.project }
              ];
            }
            if (element.kind === 'deployment') {
              return [
                { kind: 'deploymentLogs' as const, project: element.project, deployment: element.deployment }
              ];
            }
            return [];
          }
}


function iconForStateColored(state?: string): vscode.ThemeIcon {
  switch ((state || '').toUpperCase()) {
    case 'READY':
      return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed')); // green
    case 'ERROR':
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed')); // red
    case 'BUILDING':
      return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('testing.iconQueued')); // yellow
    case 'QUEUED':
      return new vscode.ThemeIcon('clock', new vscode.ThemeColor('testing.iconQueued'));
    case 'CANCELED':
      return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
    default:
      return new vscode.ThemeIcon('question', new vscode.ThemeColor('foreground'));
  }
}

function formatWhen(ts: number): string {
  // Vercel timestamps sometimes come as ms; if it's too small assume seconds.
  const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString();
}

// Remove all code after this point (duplicate class, methods, and misplaced code)
