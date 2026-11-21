import { useEffect, useState } from "react";
import { getSetupStatus, logout, type Parent } from "./api";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import { Children } from "./pages/Children";
import { Parents } from "./pages/Parents";
import { Pairing } from "./pages/Pairing";

type Route = "loading" | "setup" | "login";
type Tab = "home" | "children" | "parents" | "pairing";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Accueil" },
  { id: "children", label: "Enfants" },
  { id: "parents", label: "Parents" },
  { id: "pairing", label: "Appairage" },
];

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>("loading");
  const [parent, setParent] = useState<Parent | null>(null);

  useEffect(() => {
    let active = true;
    getSetupStatus()
      .then((s) => active && setRoute(s.needsSetup ? "setup" : "login"))
      .catch(() => active && setRoute("login"));
    return () => {
      active = false;
    };
  }, []);

  if (parent) return <Shell parent={parent} onLogout={() => setParent(null)} />;
  if (route === "loading") return <p className="muted center">Chargement…</p>;
  if (route === "setup") return <Setup onComplete={() => setRoute("login")} />;
  return <Login onSuccess={setParent} />;
}

function Shell({ parent, onLogout }: { parent: Parent; onLogout: () => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>("home");

  async function onLogoutClick(): Promise<void> {
    try {
      await logout();
    } finally {
      onLogout();
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">AwladShield</span>
        <span className="who muted">{parent.displayName}</span>
        <button type="button" className="link" onClick={onLogoutClick}>Se déconnecter</button>
      </header>
      <nav className="tabs" aria-label="Navigation principale">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? "tab active" : "tab"}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === "home" && <Home />}
        {tab === "children" && <Children />}
        {tab === "parents" && <Parents />}
        {tab === "pairing" && <Pairing />}
      </main>
    </div>
  );
}
