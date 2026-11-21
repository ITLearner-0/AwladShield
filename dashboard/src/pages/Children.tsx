import { useEffect, useState } from "react";
import { createChild, getChildren, type AgeBand, type Child } from "../api";

const AGE_BANDS: AgeBand[] = ["7-10", "11-14", "15-17"];

export function Children(): JSX.Element {
  const [children, setChildren] = useState<Child[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [ageBand, setAgeBand] = useState<AgeBand>("7-10");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    try {
      setChildren(await getChildren());
    } catch {
      setError("Impossible de charger la liste des enfants.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await createChild({ displayName, ageBand });
      setDisplayName("");
      setAgeBand("7-10");
      await refresh();
    } catch {
      setError("Impossible d'ajouter cet enfant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Enfants</h2>
      <ul className="list">
        {children.map((c) => (
          <li key={c.id}>
            <strong>{c.displayName}</strong> <span className="muted">({c.ageBand})</span>
          </li>
        ))}
      </ul>

      <h3>Ajouter un enfant</h3>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="ch-name">Nom affiché</label>
        <input id="ch-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />

        <label htmlFor="ch-age">Tranche d'âge</label>
        <select id="ch-age" value={ageBand} onChange={(e) => setAgeBand(e.target.value as AgeBand)}>
          {AGE_BANDS.map((band) => (
            <option key={band} value={band}>{band} ans</option>
          ))}
        </select>

        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Ajout…" : "Ajouter"}</button>
      </form>
    </section>
  );
}
