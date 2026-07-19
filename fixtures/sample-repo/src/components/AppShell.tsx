import type { PropsWithChildren } from "react";

type AppShellProps = PropsWithChildren<{
  activeRoute: "/" | "/settings";
}>;

export function AppShell({ activeRoute, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="logo" href="#/" aria-label="Northstar home">
          <span>N</span>
          Northstar
        </a>
        <nav aria-label="Application navigation">
          <a className={activeRoute === "/" ? "active" : undefined} href="#/">
            Overview
          </a>
          <a className={activeRoute === "/settings" ? "active" : undefined} href="#/settings">
            Settings
          </a>
        </nav>
        <div className="workspace-user">
          <span>RA</span>
          <div>
            <strong>Rafia Ali</strong>
            <small>Builder plan</small>
          </div>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
