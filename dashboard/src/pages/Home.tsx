import { useEffect, useState } from "react";
import { getChildren, getDevices, type Child, type Device } from "../api";

const AGE_LABEL: Record<Child["ageBand"], string> = {
  "7-10": "7 à 10 ans",
  "11-14": "11 à 14 ans",
  "15-17": "15 à 17 ans",
};

export function Home(): JSX.Element {
  const [children, setChildren] = useState<Child[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getChildren(), getDevices()])
      .then(([c, d]) => {
        if (!active) return;
        setChildren(c);
        setDevices(d);
      })
      .catch(() => active && setError("Impossible de charger le tableau de bord."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="muted">Chargement…</p>;
  if (error) return <p className="error" role="alert">{error}</p>;

  return (
    <section>
      <h2>Accueil</h2>
      {children.length === 0 ? (
        <p className="muted">Aucun enfant pour l'instant. Ajoutez-en un depuis l'onglet Enfants.</p>
      ) : (
        <ul className="cards">
          {children.map((child) => {
            const childDevices = devices.filter((d) => d.childId === child.id);
            return (
              <li key={child.id} className="card">
                <h3>{child.displayName}</h3>
                <p className="muted">{AGE_LABEL[child.ageBand]}</p>
                {childDevices.length === 0 ? (
                  <p className="muted">Aucun appareil appairé.</p>
                ) : (
                  <ul className="devices">
                    {childDevices.map((d) => (
                      <li key={d.id}>
                        <span className={d.online ? "dot online" : "dot offline"} aria-hidden="true" />
                        <span>{d.name}</span>
                        <span className="status">{d.online ? "En ligne" : "Hors ligne"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
