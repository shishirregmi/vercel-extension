import * as vscode from "vscode";
import { VercelClient } from "../api/vercelClient";
import { TreeNode } from "../views/vercelTreeProvider";

export async function cmdShowDeploymentLogs(node: TreeNode) {
  if (node.kind !== 'deploymentLogs') return;
  const deployment = node.deployment;
  const project = node.project;
  // Simulate fetching logs from Vercel API (replace with real API call if available)
  const logs = [
    `Deployment: ${deployment.uid}`,
    `Project: ${project.name}`,
    `State: ${deployment.state}`,
    `Created: ${new Date(deployment.created).toLocaleString()}`,
    '',
    '--- Logs ---',
    'Build started...',
    'Build completed.',
    'Deployment ready!'
  ];
  const output = vscode.window.createOutputChannel(`Vercel Logs: ${deployment.uid}`);
  output.clear();
  output.appendLine(logs.join('\n'));
  output.show(true);
}

export async function cmdAddEnvVar(node: TreeNode, treeProvider?: { refresh(): void }, client?: VercelClient) {
  if (node.kind !== 'envAdd' && node.kind !== 'envGroup') return;
  const key = await vscode.window.showInputBox({ prompt: 'Environment Variable Key' });
  if (!key) return;
  const value = await vscode.window.showInputBox({ prompt: `Value for ${key}` });
  if (value === undefined) return;
  const targets = await vscode.window.showQuickPick(['production', 'preview', 'development'], { placeHolder: 'Select target(s)', canPickMany: true });
  if (!targets || targets.length === 0) return;
  if (!client) {
    vscode.window.showErrorMessage('Not authenticated with Vercel.');
    return;
  }
  try {
    await client.createEnvVar(node.project.id, key, value, targets, 'encrypted');
    vscode.window.showInformationMessage(`Added env var: ${key} (${targets.join(', ')})`);
    if (treeProvider && typeof treeProvider.refresh === 'function') treeProvider.refresh();
  } catch (e: any) {
    vscode.window.showErrorMessage(`Failed to add env var: ${e?.message ?? e}`);
  }
}

export async function cmdEditEnvVar(node: TreeNode, treeProvider?: { refresh?: () => void }, client?: VercelClient) {
  if (node.kind !== 'envVar') return;
  const newValue = await vscode.window.showInputBox({ prompt: `Edit value for ${node.env.key}`, value: node.env.value });
  if (newValue === undefined) return;
  const allTargets = ['production', 'preview', 'development'];
  const items = allTargets.map(t => ({ label: t, picked: node.env.target.includes(t) }));
  const newTargets = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select target(s)',
    canPickMany: true
  });
  if (!newTargets || newTargets.length === 0) return;
  const selectedTargets = newTargets.map(item => item.label);
  if (!client) {
    vscode.window.showErrorMessage('Not authenticated with Vercel.');
    return;
  }
  try {
    await client.updateEnvVar(node.project.id, node.env.id, newValue, selectedTargets);
    vscode.window.showInformationMessage(`Updated env var: ${node.env.key}=${newValue} (${selectedTargets.join(', ')})`);
    if (treeProvider && typeof treeProvider.refresh === 'function') treeProvider.refresh();
  } catch (e: any) {
    vscode.window.showErrorMessage(`Failed to update env var: ${e?.message ?? e}`);
  }
}

export async function cmdRemoveEnvVar(node: TreeNode, treeProvider?: { refresh?: () => void }, client?: VercelClient) {
  if (node.kind !== 'envVar') return;
  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to delete the environment variable '${node.env.key}'?`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') return;
  if (!client) {
    vscode.window.showErrorMessage('Not authenticated with Vercel.');
    return;
  }
  try {
    await client.deleteEnvVar(node.project.id, node.env.id);
    vscode.window.showInformationMessage(`Deleted env var: ${node.env.key}`);
    if (treeProvider && typeof treeProvider.refresh === 'function') treeProvider.refresh();
  } catch (e: any) {
    vscode.window.showErrorMessage(`Failed to delete env var: ${e?.message ?? e}`);
  }
}

export async function cmdRefresh(treeProvider: { refresh(): void }) {
  treeProvider.refresh();
}

export async function cmdOpenDeployment(node: TreeNode) {
  if (node.kind !== "deployment") return;

  const url = node.deployment.url ? `https://${node.deployment.url}` : undefined;
  if (!url) {
    vscode.window.showWarningMessage("No deployment URL found.");
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

export async function cmdCancelDeployment(node: TreeNode, client: VercelClient) {
  if (node.kind !== "deployment") return;

  const confirm = await vscode.window.showWarningMessage(
    `Cancel deployment ${node.deployment.uid}?`,
    { modal: true },
    "Cancel Deployment"
  );
  if (confirm !== "Cancel Deployment") return;

  await client.cancelDeployment(node.deployment.uid);
  vscode.window.showInformationMessage("Deployment cancel requested.");
}

export async function cmdRedeployLatest(node: TreeNode, client: VercelClient) {
  if (node.kind !== "project") return;

  const { deployments } = await client.listDeploymentsByProject(node.project.id);
  const latest = deployments?.[0];

  if (!latest) {
    vscode.window.showWarningMessage("No deployments found for this project.");
    return;
  }

  const confirm = await vscode.window.showInformationMessage(
    `Redeploy latest deployment (${latest.uid}) for ${node.project.name}?`,
    { modal: true },
    "Redeploy"
  );
  if (confirm !== "Redeploy") return;

  await client.redeployFromDeployment(latest);
  vscode.window.showInformationMessage("Redeploy triggered 🚀");
}
