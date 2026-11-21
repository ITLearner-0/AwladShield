import type { Enrollment } from "../api";
import { QrCode } from "./QrCode";

export function EnrollmentView({ enrollment }: { enrollment: Enrollment }): JSX.Element {
  return (
    <div className="enrollment">
      <h3>Scannez ce QR code</h3>
      <p className="muted">
        Ouvrez votre application d'authentification (Google Authenticator, Aegis…) et scannez ce code.
      </p>
      <QrCode value={enrollment.otpauthUrl} label="QR code TOTP à scanner" />

      <h3>Codes de secours</h3>
      <p className="muted">Conservez-les en lieu sûr : chacun n'est utilisable qu'une fois.</p>
      <ul className="backup-codes">
        {enrollment.backupCodes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
