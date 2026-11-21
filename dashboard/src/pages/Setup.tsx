import { useState } from "react";
import { ApiError, confirmSetup, setup, type Enrollment } from "../api";
import { EnrollmentView } from "../components/EnrollmentView";

export function Setup({ onComplete }: { onComplete: () => void }): JSX.Element {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  return enrollment ? (
    <ConfirmStep enrollment={enrollment} onComplete={onComplete} />
  ) : (
    <CreateStep onCreated={setEnrollment} />
  );
}

function CreateStep({ onCreated }: { onCreated: (e: Enrollment) => void }): JSX.Element {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      onCreated(await setup({ email, displayName, password }));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "La configuration initiale a déjà été effectuée."
          : "Impossible de créer le compte. Vérifiez les champs et réessayez.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-card">
      <h1>Bienvenue sur AwladShield</h1>
      <p className="muted">Créez le premier compte parent pour commencer.</p>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="su-name">Nom affiché</label>
        <input id="su-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" required />

        <label htmlFor="su-email">E-mail</label>
        <input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />

        <label htmlFor="su-password">Mot de passe</label>
        <input id="su-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />

        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Création…" : "Créer le compte"}</button>
      </form>
    </main>
  );
}

function ConfirmStep({ enrollment, onComplete }: { enrollment: Enrollment; onComplete: () => void }): JSX.Element {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await confirmSetup(enrollment.parentId, token);
      onComplete();
    } catch {
      setError("Code invalide. Réessayez avec le code affiché par votre application.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-card">
      <h1>Activez l'authentification</h1>
      <EnrollmentView enrollment={enrollment} />
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="su-totp">Code à 6 chiffres</label>
        <input
          id="su-totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Validation…" : "Valider et continuer"}</button>
      </form>
    </main>
  );
}
