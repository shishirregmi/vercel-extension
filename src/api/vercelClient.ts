import { ListDeploymentsResponse, ListProjectsResponse, VercelDeployment } from "./types";

export class VercelClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`https://api.vercel.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {})
      }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vercel API error ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }

  async listProjects(): Promise<ListProjectsResponse> {
    // Docs: GET /v9/projects
    return this.request<ListProjectsResponse>("/v9/projects");
  }

  async listDeploymentsByProject(projectId: string): Promise<ListDeploymentsResponse> {
    // Docs: GET /v6/deployments?projectId=...
    return this.request<ListDeploymentsResponse>(`/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=20`);
  }

  async cancelDeployment(deploymentId: string): Promise<void> {
    // Docs: POST /v12/deployments/{id}/cancel
    await this.request(`/v12/deployments/${encodeURIComponent(deploymentId)}/cancel`, { method: "POST" });
  }

  async promoteDeployment(deploymentId: string): Promise<void> {
    // Docs: POST /v13/deployments/{id}/promote
    await this.request(`/v13/deployments/${encodeURIComponent(deploymentId)}/promote`, { method: "POST" });
  }

  async redeployFromDeployment(latestDeployment: VercelDeployment): Promise<void> {
    // The Vercel "redeploy" is typically done by creating a new deployment from the same source.
    // A convenient approach: use /v13/deployments?forceNew=1 with deploymentId
    // This is supported for redeploying existing deployments in many cases.
    // If your account/project setup differs, you may need to create a new deployment using git hooks or integrations.
    await this.request(`/v13/deployments?forceNew=1`, {
      method: "POST",
      body: JSON.stringify({
        deploymentId: latestDeployment.uid
      })
    });
  }

  async listEnvVarsByProject(projectId: string): Promise<{ envs: import("./types").VercelEnvVar[] }> {
    // Docs: GET /v9/projects/{projectId}/env
    return this.request<{ envs: import("./types").VercelEnvVar[] }>(`/v9/projects/${encodeURIComponent(projectId)}/env?decrypt=true`);
  }

  async createEnvVar(projectId: string, key: string, value: string, targets: string[], type: string = 'encrypted'): Promise<any> {
    // Docs: POST /v9/projects/{projectId}/env
    return this.request(`/v9/projects/${encodeURIComponent(projectId)}/env`, {
      method: "POST",
      body: JSON.stringify({ key, value, target: targets, type })
    });
  }

  async updateEnvVar(projectId: string, envId: string, value: string, targets: string[]): Promise<any> {
    // Docs: PATCH /v9/projects/{projectId}/env/{id}
    return this.request(`/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(envId)}`, {
      method: "PATCH",
      body: JSON.stringify({ value, target: targets })
    });
  }

  async deleteEnvVar(projectId: string, envId: string): Promise<any> {
    // Docs: DELETE /v9/projects/{projectId}/env/{id}
    return this.request(`/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(envId)}`, {
      method: "DELETE"
    });
  }
}
