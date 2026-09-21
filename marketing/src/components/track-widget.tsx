import { useRef, useState } from "react";
import { useLocale } from "@marketing/i18n";
import { ApiError, fetchTracking, type TrackResponse } from "@marketing/api";
import { CarrierMark } from "./carrier-mark";

/**
 * Public shipment tracking.
 *
 * The server returns movement and nothing else — no names, addresses, phone numbers or prices —
 * because a tracking number is semi-guessable and anything shown here is effectively public. That
 * constraint is stated on screen rather than left implied, so a visitor understands why the page
 * shows less than their account would.
 */

const CHIP: Record<string, string> = {
  delivered: "chip-done",
  customs_clearance: "chip-hold",
  on_hold: "chip-hold",
  returned: "chip-hold",
  cancelled: "chip-hold",
};

export function TrackWidget() {
  const { t, locale } = useLocale();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackResponse | null>(null);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const place = (p: { city: string | null; country: string | null }) =>
    [p.city, p.country].filter(Boolean).join(", ") || "—";

  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });

  async function run(next?: string) {
    const raw = (next ?? value).trim();
    if (!raw) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setLoading(true);
    setError(null);
    try {
      setResult(await fetchTracking(raw, controller.signal));
    } catch (err) {
      if (controller.signal.aborted) return;
      setResult(null);
      // The server distinguishes a malformed number from an unknown one, and so does this: a typo
      // should read as a typo rather than as "your shipment does not exist".
      const malformed = err instanceof ApiError && err.code === "invalid_tracking_number";
      setError({
        title: t(malformed ? "trk.short" : "trk.none"),
        body: t(malformed ? "trk.shortMsg" : "trk.noneMsg"),
      });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <>
      <div className="trk-form">
        <div className="field">
          <label htmlFor="trk">{t("trk.label")}</label>
          <input
            id="trk"
            type="text"
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            placeholder="EZH100200300"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          />
        </div>
        <button className="btn btn-primary" type="button" style={{ minHeight: 48 }} onClick={() => run()} disabled={loading}>
          {loading ? t("trk.searching") : t("trk.cta")}
        </button>
      </div>

      {!result && !error && !loading && <p className="trk-empty">{t("trk.empty")}</p>}

      {error && (
        <div className="trk-err">
          <b>{error.title}</b>
          {error.body}
        </div>
      )}

      {result && !loading && (
        <div className="trk-res">
          <div className="trk-top">
            {result.carrier && <CarrierMark name={result.carrier} />}
            <span className="trk-awb" dir="ltr">{result.trackingNumber}</span>
            <span className={`trk-chip ${CHIP[result.status] ?? "chip-move"}`}>
              <span className="d" />
              {t(`st.${result.status}`)}
            </span>
          </div>

          <div className="trk-meta">
            <div>
              <span>{t("trk.route")}</span>
              <b className="trk-route">
                <span className="leg">{place(result.origin)}</span>
                <span className="arrow">→</span>
                <span className="leg">{place(result.destination)}</span>
              </b>
            </div>
            {result.carrier && (
              <div><span>{t("trk.carrier")}</span><b>{result.carrier}</b></div>
            )}
            <div><span>{t("trk.pieces")}</span><b className="num">{result.pieces}</b></div>
            {(result.actualDelivery || result.estimatedDelivery) && (
              <div>
                <span>{t(result.actualDelivery ? "trk.delivered" : "trk.eta")}</span>
                <b><bdi>{when((result.actualDelivery ?? result.estimatedDelivery)!)}</bdi></b>
              </div>
            )}
          </div>

          <div className="trk-events">
            {result.events.map((event, i) => (
              <div className={`trk-ev${i === 0 ? " now" : ""}`} key={`${event.occurredAt}-${i}`} style={{ animationDelay: `${i * 70}ms` }}>
                <div className="trk-ev-d">{event.description}</div>
                <div className="trk-ev-m">
                  {event.location ? `${event.location} · ` : ""}
                  {/* <bdi> isolates the Latin date inside Arabic text; without it the day number
                      jumps to the wrong end of the string under bidi reordering. */}
                  <bdi>{when(event.occurredAt)}</bdi>
                </div>
              </div>
            ))}
          </div>

          <p className="trk-privacy">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            </svg>
            {t("trk.privacy")}
          </p>
        </div>
      )}
    </>
  );
}
