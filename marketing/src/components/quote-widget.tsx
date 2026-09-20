import { useRef, useState } from "react";
import { useLocale } from "@marketing/i18n";
import { COUNTRIES } from "@marketing/data/countries";
import { ApiError, fetchQuote, signupHref, type QuoteRate, type QuoteRequest, type QuoteResponse } from "@marketing/api";
import { CarrierMark } from "./carrier-mark";

/**
 * The Quick Quote widget — the reason this page exists.
 *
 * Quoting is explicit, on a button press, not debounced on keystroke. Every request spends a live
 * FedEx/DHL/Aramex call, and express-rate-limit counts the request before the server's 3-minute
 * response cache can answer it — so a debounced widget would burn a visitor's whole budget on one
 * lane. One press, one intent, one quote.
 */

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function transit(days: number | null, t: (k: string) => string) {
  if (days == null) return null;
  return days === 1 ? `1 ${t("r.day")}` : `${days} ${t("r.days")}`;
}

function RateRow({ rate, best, index }: { rate: QuoteRate; best: boolean; index: number }) {
  const { t } = useLocale();
  const eta = transit(rate.transitDays, t);
  const title = rate.serviceName || rate.carrierName || t(rate.transportMethod === "sea" ? "r.sea" : "r.air");
  const note = rate.transportMethod ? t("r.customs") : null;

  return (
    <div className="rate" style={{ animationDelay: `${index * 80}ms` }}>
      <div>
        {rate.carrierCode || rate.carrierName ? (
          <CarrierMark code={rate.carrierCode} name={rate.carrierName} />
        ) : (
          <span className="mark mark-neutral" dir="ltr">{rate.transportMethod === "sea" ? "SEA" : "AIR"}</span>
        )}
      </div>
      <div>
        <div className="rate-svc">
          {title}
          {best && <span className="best">★ {t("r.best")}</span>}
        </div>
        <div className="rate-eta">{[note, eta].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="rate-price">
        <div className="rate-amt num">SAR {money(rate.clientTotal)}</div>
        <div className="rate-vat">{t("r.vat")}</div>
      </div>
    </div>
  );
}

function RateGroup({ titleKey, rates, live }: { titleKey: string; rates: QuoteRate[]; live: boolean }) {
  const { t } = useLocale();
  if (!rates.length) return null;
  return (
    <div className="res-group">
      <div className="res-title">
        {live && <span className="live-dot" />}
        {t(titleKey)}
      </div>
      {rates.map((rate, i) => (
        <RateRow key={`${rate.carrierCode ?? rate.transportMethod}-${rate.serviceType ?? i}`} rate={rate} best={i === 0} index={i} />
      ))}
    </div>
  );
}

function Skeleton() {
  const { t } = useLocale();
  return (
    <div className="res-group">
      <div className="res-title">
        <span className="live-dot" />
        {t("r.live")}
      </div>
      {[0, 1, 2].map((i) => (
        <div className="skel-row" key={i}>
          <div className="shimmer" style={{ height: 30, width: 92 }} />
          <div style={{ flex: 1 }}>
            <div className="shimmer" style={{ height: 12, width: "46%" }} />
            <div className="shimmer" style={{ height: 10, width: "27%", marginTop: 7 }} />
          </div>
          <div className="shimmer" style={{ height: 18, width: 96 }} />
        </div>
      ))}
    </div>
  );
}

export function QuoteWidget() {
  const { t, locale } = useLocale();
  const [from, setFrom] = useState("SA");
  const [to, setTo] = useState("AE");
  const [weight, setWeight] = useState("5");
  const [dimsOpen, setDimsOpen] = useState(false);
  const [dims, setDims] = useState({ l: "", w: "", h: "", pieces: "1" });

  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoted, setQuoted] = useState<QuoteRequest | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const kg = Number(weight);
  const pieces = Math.max(1, Number(dims.pieces) || 1);
  const canQuote = Number.isFinite(kg) && kg > 0;

  async function runQuote() {
    if (!canQuote) return;
    // A second press supersedes the first rather than racing it.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    const request: QuoteRequest = {
      origin: { countryCode: from },
      destination: { countryCode: to },
      weightKg: kg,
      pieces,
      ...(dimsOpen && dims.l && dims.w && dims.h
        ? { length: Number(dims.l), width: Number(dims.w), height: Number(dims.h) }
        : {}),
    };

    setLoading(true);
    setError(null);
    try {
      const result = await fetchQuote(request, controller.signal);
      setQuote(result);
      setQuoted(request);
      if (!result.available.express && !result.available.local && !result.available.ddp) {
        setError(t("q.none"));
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setQuote(null);
      setError(err instanceof ApiError ? err.message : t("q.failed"));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const chargeable = quote?.chargeable;
  const volumetricWins = chargeable ? chargeable.chargeableAirKg > chargeable.totalWeightKg + 0.001 : false;

  return (
    <>
      <div className="fields">
        <div className="field">
          <label htmlFor="q-from">{t("q.from")}</label>
          <select id="q-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{locale === "ar" ? c.ar : c.en}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="q-to">{t("q.to")}</label>
          <select id="q-to" value={to} onChange={(e) => setTo(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{locale === "ar" ? c.ar : c.en}</option>
            ))}
          </select>
        </div>
        <div className="field field-weight">
          <label htmlFor="q-kg">{t("q.weight")}</label>
          <input
            id="q-kg"
            type="number"
            min="0.1"
            step="0.5"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runQuote(); }}
          />
          <span className="unit">{t("q.kg")}</span>
        </div>
      </div>

      <button className="dims-toggle" type="button" aria-expanded={dimsOpen} onClick={() => setDimsOpen((v) => !v)}>
        <span className="chev">▶</span>
        <span>{t("q.dims")}</span>
      </button>

      {dimsOpen && (
        <div className="dims open">
          {([["l", "q.length", "40"], ["w", "q.width", "30"], ["h", "q.height", "25"]] as const).map(([key, label, placeholder]) => (
            <div className="field" key={key}>
              <label htmlFor={`q-${key}`}>{t(label)}</label>
              <input
                id={`q-${key}`}
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                placeholder={placeholder}
                value={dims[key]}
                onChange={(e) => setDims((d) => ({ ...d, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="q-pieces">{t("q.pieces")}</label>
            <input
              id="q-pieces"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={dims.pieces}
              onChange={(e) => setDims((d) => ({ ...d, pieces: e.target.value }))}
            />
          </div>
        </div>
      )}

      <div className="quote-actions">
        <button className="btn btn-primary btn-block" type="button" onClick={runQuote} disabled={!canQuote || loading}>
          {loading ? t("q.pricing") : t("q.getPrices")}
        </button>
      </div>

      {chargeable && !loading && (
        <div className="calc-strip">
          <span>
            {t("c.total")} <b className="num">{chargeable.totalWeightKg.toFixed(2)} {t("q.kg")}</b>
          </span>
          <span>
            {t("c.charge")}{" "}
            <b className={volumetricWins ? "vol-win num" : "num"}>{chargeable.chargeableAirKg.toFixed(2)} {t("q.kg")}</b>
            {volumetricWins && <span className="vol-win"> ({t("c.vol")})</span>}
          </span>
          {chargeable.pieces > 1 && (
            <span>{t("c.pieces")} <b className="num">{chargeable.pieces}</b></span>
          )}
        </div>
      )}

      <div className="results">
        {loading && <Skeleton />}
        {!loading && error && <div className="trk-err"><b>{error}</b>{t("q.retry")}</div>}
        {!loading && !error && !quote && <p className="quote-empty">{t("q.idle")}</p>}
        {!loading && quote && (
          <>
            <RateGroup titleKey="r.express" rates={quote.express} live />
            <RateGroup titleKey="r.local" rates={quote.local} live />
            <RateGroup titleKey="r.ddp" rates={quote.ddp} live={false} />
          </>
        )}
      </div>

      <div className="quote-foot">
        <a className="btn btn-primary btn-lg btn-block" href={signupHref(quoted ?? undefined)}>
          {t("q.cta")}
        </a>
        <p className="disclaimer">{t("q.disclaimer")}</p>
      </div>
    </>
  );
}
