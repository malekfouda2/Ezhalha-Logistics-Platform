/**
 * Carrier wordmarks, set in type rather than shipped as images.
 *
 * Mirrors client/src/components/carrier-logo.tsx, which does the same thing for the portal and is
 * the source of the FedEx / DHL / Aramex brand colours. Two reasons these stay type: the repo
 * holds no vector carrier assets (the portal's only image is a single DHL PNG, and the Apps tab
 * has uploads for FedEx and DHL alone), and a wordmark drawn in CSS stays crisp at any zoom where
 * a small PNG would not.
 *
 * The domestic carriers therefore get a *lockup* — a monogram tile plus the wordmark — rather
 * than an official logo. The tile colours are a deliberate house palette, not the carriers' own
 * brand colours, because printing a brand colour we are not sure of is worse than not using one.
 * When real logo files exist, this component is the single place to swap them in.
 *
 * `dir="ltr"` is not optional — these are Latin wordmarks, and under RTL the two FedEx spans swap
 * and it renders "ExFed".
 */

type MarkSpec = {
  /** Monogram shown in the tile. Kept to two characters so every tile is the same width. */
  tile: string;
  label: string;
};

const LOCKUPS: Record<string, MarkSpec> = {
  SMSA: { tile: "S", label: "SMSA" },
  NAQEL: { tile: "N", label: "Naqel" },
  JT: { tile: "J&T", label: "Express" },
  REDBOX: { tile: "R", label: "RedBox" },
  ZAJIL: { tile: "Z", label: "Zajil" },
  // The stylised "i" is iMile's own mark, so the tile carries it and the wordmark finishes it.
  IMILE: { tile: "i", label: "Mile" },
  FIZZPA: { tile: "F", label: "Fizzpa" },
  SHIPOX: { tile: "S", label: "Shipox" },
};

/** Resolves a code or a display name to the key used above. */
function resolve(code?: string, name?: string | null) {
  const hay = `${code ?? ""} ${name ?? ""}`.toUpperCase();
  if (hay.includes("FEDEX")) return "FEDEX";
  if (hay.includes("DHL")) return "DHL";
  if (hay.includes("ARAMEX")) return "ARAMEX";
  if (hay.includes("SMSA")) return "SMSA";
  if (hay.includes("NAQEL")) return "NAQEL";
  if (hay.includes("J&T") || hay.includes("JT")) return "JT";
  if (hay.includes("REDBOX") || hay.includes("RED BOX")) return "REDBOX";
  if (hay.includes("ZAJIL")) return "ZAJIL";
  if (hay.includes("IMILE") || hay.includes("I-MILE")) return "IMILE";
  if (hay.includes("FIZZPA")) return "FIZZPA";
  if (hay.includes("SHIPOX")) return "SHIPOX";
  return null;
}

export function CarrierMark({ code, name }: { code?: string; name?: string | null }) {
  const key = resolve(code, name);
  const label = name || code || "";

  if (key === "FEDEX") {
    return (
      <span className="mark mark-fedex" dir="ltr" title="FedEx">
        <span className="a">Fed</span>
        <span className="b">Ex</span>
      </span>
    );
  }
  if (key === "DHL") {
    return <span className="mark mark-dhl" dir="ltr" title="DHL">DHL</span>;
  }
  if (key === "ARAMEX") {
    return <span className="mark mark-aramex" dir="ltr" title="Aramex">Aramex</span>;
  }

  const lockup = key ? LOCKUPS[key] : undefined;
  if (key && lockup) {
    return (
      <span className={`mark mark-lockup mark-${key.toLowerCase()}`} dir="ltr" title={label}>
        <span className="tile">{lockup.tile}</span>
        <span className="wm">{lockup.label}</span>
      </span>
    );
  }

  return <span className="mark mark-neutral" dir="ltr">{label}</span>;
}
