import { useState } from "react";
import { login, type Parent } from "../api";

export function Login({ onSuccess }: { onSuccess: (parent: Parent) => void }): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      onSuccess(await login({ email, password, totp }));
    } catch {
      setError("Identifiants ou code incorrects.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-card">
      <h1>Connexion</h1>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="li-email">E-mail</label>
        <input id="li-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />

        <label htmlFor="li-password">Mot de passe</label>
        <input id="li-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />

        <label htmlFor="li-totp">Code à 6 chiffres</label>
        <input id="li-totp" inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value)} required />

        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
      </form>
    </main>
  );
}
