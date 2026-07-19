export type Deployment = {
  id: string;
  project: string;
  status: "ready";
};

export async function createDeployment(project: string): Promise<Deployment> {
  await new Promise((resolve) => window.setTimeout(resolve, 650));
  return {
    id: `dep_${Date.now()}`,
    project,
    status: "ready",
  };
}
