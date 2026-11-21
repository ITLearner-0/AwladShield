import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, label }: { value: string; label: string }): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: 192 })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [value]);

  if (!dataUrl) return <p className="muted">Génération du QR code…</p>;
  return <img className="qr" src={dataUrl} alt={label} width={192} height={192} />;
}
