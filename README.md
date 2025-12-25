
# Vercel VS Code Extension

Easily manage your Vercel projects, deployments, and environment variables directly from VS Code.

## Features & Step-by-Step Usage

### 1. Authenticate with Vercel
1. Open VS Code.
2. Open the Command Palette (`Ctrl+Shift+P`).
3. Run `Vercel: Set Token`.
4. Paste your Vercel Personal Token (get it from your Vercel dashboard).
5. You are now authenticated.

### 2. View Projects & Deployments
1. Click the Vercel icon in the Activity Bar.
2. The sidebar shows your current project (based on the open folder name).
3. Expand the project node to see:
	 - **Environment Variables**
	 - **Deployments** (separated by Production/Preview)

### 3. Manage Deployments
- **Redeploy:**
	1. Right-click a deployment with status `READY`.
	2. Click `Redeploy Latest` to trigger a new deployment from the same source.
- **Cancel Deployment:**
	1. Right-click a deployment with status `BUILDING` or `QUEUED`.
	2. Click `Cancel Deployment` to stop it.
- **View Deployment:**
	1. Click any deployment to open it in your browser.
- **View Logs:**
	1. Expand a deployment and click the `Logs` node to see build/deploy logs in the Output panel.

### 4. Manage Environment Variables
- **Add:**
	1. Click `Add Environment Variable` under the Environment Variables section.
	2. Enter the key, value, and select the target environments.
- **Edit:**
	1. Right-click any environment variable and select `Edit`.
	2. Update the value and/or targets.
- **Delete:**
	1. Right-click any environment variable and select `Delete Environment Variable`.
- **Note:** Values are always hidden/redacted for security (Vercel API limitation).

### 5. Automatic Refresh
- The sidebar and status bar auto-refresh every 60 seconds.
- If any deployment is in progress (`BUILDING` or `QUEUED`), refreshes every 5 seconds.
- After a Git push, refreshes after 5 seconds.

## Troubleshooting
- If you see `(not connected)`, run `Vercel: Set Token` again.
- If values are redacted, this is a Vercel API security feature.
- For issues, reload VS Code or re-authenticate.

## Requirements
- VS Code 1.85+
- A Vercel account

## Feedback
Open an issue or PR on GitHub, or contact the extension author via the VS Code Marketplace.
