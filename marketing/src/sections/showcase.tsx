import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { useLocale } from "@marketing/i18n";
import { CarrierMark } from "@marketing/components/carrier-mark";
import { Reveal } from "@marketing/components/reveal";

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

export function FanOut() {
  const { t, content, dir } = useLocale();
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

  const rtl = dir === "rtl";
  const W = 520, H = 380;
  const ox = rtl ? W - 70 : 70;
  const oy = H / 2;
  const tx = rtl ? 176 : W - 176;

  return (
    <section id="network" className="sec-void on-void">
      <div className="wrap">
        <div className="fan">
          <Reveal className="fan-copy">
            <div className="kicker">{t("fan.kicker")}</div>
            <h2>{t("fan.title")}</h2>
            <p className="lead">{t("fan.lead")}</p>
            <div className="fan-facts">
              {content.fanFacts.map((fact) => (
                <div className="fan-fact" key={fact.title}>
                  <span className="n num">{fact.n}</span>
                  <span className="t">{fact.title}<span>{fact.body}</span></span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal className="fan-stage" delay={0.12}>
            <div ref={stageRef}>
              <div className="fan-stage-top">
                <span className="lbl">{t("fan.stage")}</span>
                <button className="replay" type="button" onClick={() => setRun((n) => n + 1)}>
                  ↻ <span>{t("fan.replay")}</span>
                </button>
              </div>

              <svg viewBox={`0 0 ${W} ${H}`} id="fanSvg" role="img" aria-label={t("fan.title")}>
                <circle cx={ox} cy={oy} r="26" fill="#fe5200" opacity=".14" />
                <circle cx={ox} cy={oy} r="15" fill="#fe5200" />
                <path
                  d={`M${ox - 5} ${oy - 1} l3.6 3.6 L${ox + 6} ${oy - 4}`}
                  stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"
                />
                {FAN.map((carrier, i) => {
                  const y = 34 + i * ((H - 68) / (FAN.length - 1));
                  const mx = (ox + tx) / 2;
                  const done = settled[i];
                  const won = done && i === cheapestIndex;
                  return (
                    <g key={`${carrier.code}-${carrier.account}`}>
                      <path
                        d={`M${ox} ${oy} C${mx} ${oy} ${mx} ${y} ${tx} ${y}`}
                        stroke="#fe5200"
                        strokeOpacity={carrier.timeout && done ? 0.08 : won ? 1 : 0.3}
                        strokeWidth={won ? 2.4 : 1.5}
                        fill="none"
                        style={{ transition: "stroke-opacity .4s ease, stroke-width .4s ease" }}
                      />
                      <g transform={`translate(${tx} ${y})`} opacity={carrier.timeout && done ? 0.38 : 1} style={{ transition: "opacity .4s ease" }}>
                        <circle r="4.5" fill={won ? "#fe5200" : "var(--void-2)"} stroke="#fe5200" strokeWidth="1.6" />
                        <foreignObject x={rtl ? -236 : 12} y="-19" width="224" height="38">
                          <div className="fan-node" style={{ display: "flex", alignItems: "center", gap: 8, height: 38, flexDirection: rtl ? "row-reverse" : "row" }}>
                            <CarrierMark code={carrier.code} name={carrier.name} />
                            <span style={{ color: "var(--void-ink-3)", fontSize: 11, whiteSpace: "nowrap" }}>{carrier.account}</span>
                            <span
                              style={{
                                marginInlineStart: "auto",
                                fontSize: 12.5,
                                fontVariantNumeric: "tabular-nums",
                                whiteSpace: "nowrap",
                                direction: "ltr",
                                fontWeight: won ? 700 : 400,
                                color: won ? "#fe5200" : done ? "var(--void-ink)" : "var(--void-ink-3)",
                              }}
                            >
                              {!done ? "…" : carrier.timeout ? "—" : `SAR ${money(carrier.price)}`}
                            </span>
                          </div>
                        </foreignObject>
                      </g>
                    </g>
                  );
                })}
              </svg>
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
        <Reveal className="sec-head center">
          <div className="kicker">{t("lab.kicker")}</div>
          <h2>{t("lab.title")}</h2>
          <p>{t("lab.sub")}</p>
        </Reveal>

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
