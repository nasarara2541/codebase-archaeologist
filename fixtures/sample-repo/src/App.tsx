import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { SettingsPage } from "./pages/SettingsPage";

type Route = "/" | "/settings";

function currentRoute(): Route {
  return window.location.hash === "#/settings" ? "/settings" : "/";
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <AppShell activeRoute={route}>
      {route === "/settings" ? <SettingsPage /> : <HomePage />}
    </AppShell>
  );
}
