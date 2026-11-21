import { useState } from "react";
import { addParent, ApiError, type Enrollment } from "../api";
import { EnrollmentView } from "../components/EnrollmentView";

export function Parents(): JSX.Element {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await addParent({ email, displayName, password });
      setEnrollment(result);
      setEmail("");
      setDisplayName("");
      setPassword("");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Cet e-mail est déjà utilisé."
          : "Impossible d'ajouter ce parent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Parents</h2>
      <p className="muted">Ajoutez un deuxième compte parent. Il devra activer l'authentification à son tour.</p>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="pa-name">Nom affiché</label>
        <input id="pa-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" required />

        <label htmlFor="pa-email">E-mail</label>
        <input id="pa-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="pa-password">Mot de passe</label>
        <input id="pa-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />

        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Ajout…" : "Ajouter le parent"}</button>
      </form>

      {enrollment && (
        <div className="panel">
          <h3>Compte créé</h3>
          <p className="muted">Transmettez ces informations au nouveau parent pour qu'il configure son authentification.</p>
          <EnrollmentView enrollment={enrollment} />
        </div>
      )}
    </section>
  );
}
