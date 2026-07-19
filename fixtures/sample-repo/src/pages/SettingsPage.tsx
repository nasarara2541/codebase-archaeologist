import { useEffect, useState } from "react";
import { Toggle } from "../components/Toggle";
import { getPreferences, savePreferences, type Preferences } from "../services/preferences";

export function SettingsPage() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPreferences().then(setPreferences);
  }, []);

  if (!preferences) {
    return <p className="loading-message">Loading settings…</p>;
  }

  async function handleSave() {
    if (!preferences) return;
    await savePreferences(preferences);
    setSaved(true);
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace preferences</p>
          <h1>Settings</h1>
          <p>Choose when Northstar should keep your team informed.</p>
        </div>
        <button className="primary-button" onClick={handleSave}>
          {saved ? "Saved" : "Save changes"}
        </button>
      </header>
      <section className="settings-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Notifications</p>
            <h2>Delivery preferences</h2>
          </div>
        </div>
        <Toggle
          label="Deployment alerts"
          description="Notify me when a production deployment finishes."
          checked={preferences.deploymentAlerts}
          onChange={(deploymentAlerts) => setPreferences({ ...preferences, deploymentAlerts })}
        />
        <Toggle
          label="Weekly digest"
          description="Receive a weekly summary of workspace activity."
          checked={preferences.weeklyDigest}
          onChange={(weeklyDigest) => setPreferences({ ...preferences, weeklyDigest })}
        />
      </section>
    </>
  );
}
