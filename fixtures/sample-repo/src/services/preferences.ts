export type Preferences = {
  deploymentAlerts: boolean;
  weeklyDigest: boolean;
};

const defaultPreferences: Preferences = {
  deploymentAlerts: true,
  weeklyDigest: false,
};

export async function getPreferences(): Promise<Preferences> {
  await new Promise((resolve) => window.setTimeout(resolve, 220));
  const stored = window.localStorage.getItem("northstar-preferences");
  return stored ? (JSON.parse(stored) as Preferences) : defaultPreferences;
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 320));
  window.localStorage.setItem("northstar-preferences", JSON.stringify(preferences));
}
