/**
 * Carrier wordmarks, set in type rather than shipped as images.
 *
 * Mirrors client/src/components/carrier-logo.tsx, which does the same thing for the portal and is
 * the source of these brand colours. Two reasons it stays type: the repo has no vector carrier
 * assets, and a wordmark drawn in CSS stays crisp at any zoom where a small PNG would not.
 *
 * `dir="ltr"` is not optional — these are Latin wordmarks, and under RTL the two FedEx spans
 * swap and it renders "ExFed".
 */
export function CarrierMark({ code, name }: { code?: string; name?: string | null }) {
  const label = name || code || "";
  const upper = (code || label).toUpperCase();

  if (upper.includes("FEDEX")) {
    return (
      <span className="mark mark-fedex" dir="ltr">
        <span className="a">Fed</span>
        <span className="b">Ex</span>
      </span>
    );
  }
  if (upper.includes("DHL")) {
    return <span className="mark mark-dhl" dir="ltr">DHL</span>;
  }
  if (upper.includes("ARAMEX")) {
    return <span className="mark mark-aramex" dir="ltr">Aramex</span>;
  }
  return <span className="mark mark-neutral" dir="ltr">{label}</span>;
}
