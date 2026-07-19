import { useState } from "react";
import { MetricCard } from "../components/MetricCard";
import { createDeployment } from "../services/deployments";

export function HomePage() {
  const [deploymentStatus, setDeploymentStatus] = useState<"idle" | "deploying" | "complete">(
    "idle",
  );

  async function handleDeploy() {
    setDeploymentStatus("deploying");
    await createDeployment("northstar-web");
    setDeploymentStatus("complete");
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <h1>Good afternoon, Rafia.</h1>
          <p>Everything is healthy across your production workspace.</p>
        </div>
        <button className="primary-button" onClick={handleDeploy} disabled={deploymentStatus === "deploying"}>
          {deploymentStatus === "deploying"
            ? "Deploying…"
            : deploymentStatus === "complete"
              ? "Deployment ready"
              : "Create deployment"}
        </button>
      </header>

      <section className="metric-grid" aria-label="Workspace metrics">
        <MetricCard label="Deployments" value="24" detail="3 this week" />
        <MetricCard label="Build time" value="42s" detail="12% faster" tone="blue" />
        <MetricCard label="Availability" value="99.99%" detail="Last 30 days" tone="violet" />
      </section>

      <section className="activity-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h2>Production timeline</h2>
          </div>
          <span className="healthy-pill">All systems operational</span>
        </div>
        <ul className="activity-list">
          <li><span className="activity-dot" /><div><strong>northstar-web deployed</strong><small>main · 6 minutes ago</small></div><code>8a4f21c</code></li>
          <li><span className="activity-dot blue" /><div><strong>Build completed</strong><small>settings-refresh · 2 hours ago</small></div><code>5d12b07</code></li>
          <li><span className="activity-dot violet" /><div><strong>Preview promoted</strong><small>navigation-polish · yesterday</small></div><code>1c90ee2</code></li>
        </ul>
      </section>
    </>
  );
}
