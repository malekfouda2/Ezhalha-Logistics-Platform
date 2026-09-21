import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { useLocale } from "@marketing/i18n";
import { CarrierMark } from "@marketing/components/carrier-mark";
import { Reveal, Rise, Stagger } from "@marketing/components/motion";

/**
 * The carrier fan-out.
 *
 * Illustrative, but structurally true: `getEligibleIntegrationAccountsForShipment` really does
 * fan a rate request across every carrier AND every account under each carrier that serves the
 * lane, caps each at eight seconds, drops the ones that overrun, and keeps the cheapest. That is
 * the difference between this platform and a one-account-per-carrier aggregator, and it is the
 * kind of thing nobody reads as a paragraph.
 */
const FAN = [
  { code: "ARAMEX", name: "Aramex", account: "KSA", price: 163.59, ms: 640 },
  { code: "DHL", name: "DHL", account: "KSA", price: 186.49, ms: 910 },
  { code: "FEDEX", name: "FedEx", account: "Jeddah", price: 201.22, ms: 1180 },
  { code: "FEDEX", name: "FedEx", account: "UAE", price: 214.8, ms: 1460 },
  { code: "ARAMEX", name: "Aramex", account: "UAE", price: 178.05, ms: 1720 },
  { code: "DHL", name: "DHL", account: "EU", price: 0, ms: 2100, timeout: true },
];

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The wires between the hub and the result rows.
 *
 * Drawn in a stretched 100×100 box rather than at real pixel sizes, so a curve always lands on
 * the centre of its row whatever the card is sized to — the rows are equal-height and separated
 * by rules rather than gaps, which makes each centre exactly (i + 0.5) / n of the height.
 * `vector-effect` keeps the stroke an honest 1px through that non-uniform scale.
 */
function Wires({ count, settled, cheapest }: {
  count: number;
  settled: Record<number, boolean>;
  cheapest: number;
}) {
  return (
    <svg className="fan-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const y = ((i + 0.5) / count) * 100;
        const timedOut = FAN[i].timeout && settled[i];
        const won = settled[i] && i === cheapest;
        return (
          <path
            key={i}
            d={`M0 50 C55 50 45 ${y} 100 ${y}`}
            className={`wire${won ? " is-won" : ""}${timedOut ? " is-dropped" : ""}`}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

export function FanOut() {
  const { t, content } = useLocale();
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(stageRef, { once: true, margin: "0px 0px -80px 0px" });
  const [run, setRun] = useState(0);
  const [settled, setSettled] = useState<Record<number, boolean>>({});

  const cheapestIndex = FAN.reduce(
    (best, x, i) => (!x.timeout && (best < 0 || x.price < FAN[best].price) ? i : best),
    -1,
  );

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setSettled(Object.fromEntries(FAN.map((_, i) => [i, true])));
      return;
    }
    setSettled({});
    const timers = FAN.map((carrier, i) =>
      setTimeout(() => setSettled((s) => ({ ...s, [i]: true })), 500 + carrier.ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [inView, reduced, run]);

  const answered = FAN.filter((_, i) => settled[i]).length;

  return (
    <section id="network" className="sec-void on-void">
      <div className="wrap">
        <div className="fan">
          <Reveal className="fan-copy">
            <div className="kicker">{t("fan.kicker")}</div>
            <h2>{t("fan.title")}</h2>
            <p className="lead">{t("fan.lead")}</p>
            <Stagger className="fan-facts" gap={0.1} delay={0.2}>
              {content.fanFacts.map((fact) => (
                <Rise className="fan-fact" key={fact.title} distance={14}>
                  <span className="n num">{fact.n}</span>
                  <span className="t">{fact.title}<span>{fact.body}</span></span>
                </Rise>
              ))}
            </Stagger>
          </Reveal>

          <Reveal className="fan-stage" delay={0.12}>
            <div className="fan-stage-top">
              <span className="lbl">{t("fan.stage")}</span>
              <button className="replay" type="button" onClick={() => setRun((n) => n + 1)}>
                ↻ <span>{t("fan.replay")}</span>
              </button>
            </div>

            <div className="fan-grid" ref={stageRef}>
              <div className="fan-hub">
                <span className="pulse" aria-hidden="true" />
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v18M5 8l7-5 7 5" />
                </svg>
                <b>{t("fan.hub")}</b>
                <span className="num">{answered}/{FAN.length}</span>
              </div>

              <Wires count={FAN.length} settled={settled} cheapest={cheapestIndex} />

              <ul className="fan-rows">
                {FAN.map((carrier, i) => {
                  const done = settled[i];
                  const won = done && i === cheapestIndex;
                  const dropped = carrier.timeout && done;
                  return (
                    <li
                      key={`${carrier.code}-${carrier.account}`}
                      className={`fan-row${won ? " is-won" : ""}${dropped ? " is-dropped" : ""}${done ? " is-done" : ""}`}
                    >
                      <CarrierMark code={carrier.code} name={carrier.name} />
                      <span className="acct">
                        {carrier.account}
                        <em>{t("fan.acct")}</em>
                      </span>
                      <span className="val num">
                        {!done ? (
                          <span className="wait">{t("fan.waiting")}</span>
                        ) : dropped ? (
                          <span className="drop">{t("fan.timeout")}</span>
                        ) : (
                          <>SAR {money(carrier.price)}</>
                        )}
                      </span>
                      {won && <span className="won">{t("fan.won")}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * Chargeable weight, made draggable.
 *
 * Carriers bill on whichever is greater — actual weight, or the space the box occupies — and the
 * divisor differs per carrier and unit system (`shared/chargeable-weight.ts` implements /139,
 * /305 and /5000). Getting it wrong is the difference between a quote that matches the carrier's
 * invoice and one that does not, which is a dull sentence and an interesting slider.
 */
export function WeightLab() {
  const { t } = useLocale();
  const [w, setW] = useState(5);
  const [l, setL] = useState(40);
  const [wi, setWi] = useState(30);
  const [h, setH] = useState(25);

  const volumetric = (l * wi * h) / 5000;
  const billed = Math.max(w, volumetric);
  const volumetricWins = volumetric > w;
  const scale = 2.4;

  const faces: Array<[string, number, number]> = [
    [`translateZ(${(wi * scale) / 2}px)`, l * scale, h * scale],
    [`rotateY(180deg) translateZ(${(wi * scale) / 2}px)`, l * scale, h * scale],
    [`rotateY(90deg) translateZ(${(l * scale) / 2}px)`, wi * scale, h * scale],
    [`rotateY(-90deg) translateZ(${(l * scale) / 2}px)`, wi * scale, h * scale],
    [`rotateX(90deg) translateZ(${(h * scale) / 2}px)`, l * scale, wi * scale],
    [`rotateX(-90deg) translateZ(${(h * scale) / 2}px)`, l * scale, wi * scale],
  ];

  const sliders: Array<[string, number, number, number, number, (v: number) => void, string]> = [
    [t("lab.actual"), w, 1, 40, 0.5, setW, `${w.toFixed(1)} ${t("q.kg")}`],
    [t("lab.len"), l, 10, 120, 1, setL, `${l} cm`],
    [t("lab.wid"), wi, 10, 120, 1, setWi, `${wi} cm`],
    [t("lab.hei"), h, 10, 120, 1, setH, `${h} cm`],
  ];

  return (
    <section id="weight" className="sec-void on-void">
      <div className="wrap">
        <Stagger className="sec-head center" gap={0.09}>
          <Rise className="kicker">{t("lab.kicker")}</Rise>
          <Rise as="div"><h2>{t("lab.title")}</h2></Rise>
          <Rise as="div"><p>{t("lab.sub")}</p></Rise>
        </Stagger>

        <Reveal className="lab">
          <div className="lab-box">
            <div className="cube" style={{ width: l * scale, height: h * scale }}>
              {faces.map(([transform, fw, fh], i) => (
                <div
                  key={i}
                  className="face"
                  style={{ width: fw, height: fh, transform: `translate(-50%,-50%) ${transform}`, left: "50%", top: "50%" }}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="controls">
              {sliders.map(([label, value, min, max, step, set, display]) => (
                <div className="slider-row" key={label}>
                  <label>
                    <span>{label}</span>
                    <b>{display}</b>
                  </label>
                  <input
                    type="range" min={min} max={max} step={step} value={value}
                    aria-label={label}
                    onChange={(e) => set(Number(e.target.value))}
                  />
                </div>
              ))}
            </div>

            <div className="vs">
              <div className={`vs-row${!volumetricWins ? " win" : ""}`}>
                <span className="vs-lbl">{t("lab.actual")}</span>
                <span className="vs-bar"><span className="vs-fill" style={{ width: `${(w / billed) * 100}%` }} /></span>
                <span className="vs-val num">{w.toFixed(2)}</span>
              </div>
              <div className={`vs-row${volumetricWins ? " win" : ""}`}>
                <span className="vs-lbl">{t("lab.volumetric")}</span>
                <span className="vs-bar"><span className="vs-fill" style={{ width: `${(volumetric / billed) * 100}%` }} /></span>
                <span className="vs-val num">{volumetric.toFixed(2)}</span>
              </div>
            </div>

            <div className="lab-math">
              <code dir="ltr">{l} × {wi} × {h} ÷ 5000 = {volumetric.toFixed(2)} kg</code>
              <span className="out">
                {t("lab.billed")} {billed.toFixed(2)} {t("q.kg")} — {t(volumetricWins ? "lab.by" : "lab.byw")}
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
