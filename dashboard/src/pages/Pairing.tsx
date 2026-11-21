import { useEffect, useState } from "react";
import { createPairingCode, getChildren, type Child, type PairingCode } from "../api";

export function Pairing(): JSX.Element {
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [code, setCode] = useState<PairingCode | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getChildren()
      .then((list) => {
        if (!active) return;
        setChildren(list);
        if (list.length > 0) setChildId(list[0].id);
      })
      .catch(() => active && setError("Impossible de charger la liste des enfants."));
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setCode(null);
    setBusy(true);
    try {
      setCode(await createPairingCode({ childId, deviceName }));
    } catch {
      setError("Impossible de générer un code d'appairage.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Appairage d'un appareil</h2>
      {children.length === 0 ? (
        <p className="muted">Ajoutez d'abord un enfant depuis l'onglet Enfants.</p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="pr-child">Enfant</label>
          <select id="pr-child" value={childId} onChange={(e) => setChildId(e.target.value)}>
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.displayName}</option>
            ))}
          </select>

          <label htmlFor="pr-device">Nom de l'appareil</label>
          <input id="pr-device" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} required />

          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Génération…" : "Générer un code"}</button>
        </form>
      )}

      {code && (
        <div className="panel pairing-code">
          <h3>Code d'appairage</h3>
          <p className="code-value" aria-label="Code d'appairage">{code.code}</p>
          <p className="muted">Expire le {new Date(code.expiresAt).toLocaleString("fr-FR")}</p>
          <p className="muted">Saisissez ce code dans l'application AwladShield installée sur l'appareil de l'enfant.</p>
        </div>
      )}
    </section>
  );
}
