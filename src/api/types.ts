export type VercelProject = {
  id: string;
  name: string;
};

export type VercelDeployment = {
  uid: string; // deployment id
  name?: string;
  url?: string;
  state?: string; // READY, ERROR, BUILDING, QUEUED, CANCELED...
  created: number; // unix ms or s? Vercel returns ms? Usually ms for some endpoints; for /v6 it's ms since epoch (often). We'll treat as ms and fallback.
  meta?: Record<string, any>;
  target?: "production" | "preview";
};

export type VercelEnvVar = {
  id: string;
  key: string;
  value: string;
  target: string[];
  type: string;
  configurationId?: string;
  createdAt: number;
  updatedAt: number;
  gitBranch?: string;
  comment?: string;
};

export type ListProjectsResponse = {
  projects: VercelProject[];
};

export type ListDeploymentsResponse = {
  deployments: VercelDeployment[];
};
