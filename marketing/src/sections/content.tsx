import { useLocale } from "@marketing/i18n";
import { APP_ORIGIN, signupHref } from "@marketing/api";
import { CarrierMark } from "@marketing/components/carrier-mark";
import { CountUp, Reveal } from "@marketing/components/reveal";

/** The ten carriers a client can actually book. Aggregators and credentials-only entries excluded. */
const BOOKABLE_CARRIERS = [
  "FEDEX", "DHL", "ARAMEX",
  "SMSA Express", "Naqel Express", "J&T Express", "RedBox", "Zajil Express", "iMile",
];

const FLOW_ART: Record<string, JSX.Element> = {
  express: (
    <svg viewBox="0 0 300 118" aria-hidden="true">
      <defs>
        <linearGradient id="gx" x1="0" x2="1">
          <stop offset="0" stopColor="#fe5200" stopOpacity=".1" />
          <stop offset="1" stopColor="#fe5200" stopOpacity=".85" />
        </linearGradient>
      </defs>
      <path d="M14 96 Q150 4 286 62" stroke="url(#gx)" strokeWidth="2.5" fill="none" strokeDasharray="5 6">
        <animate attributeName="stroke-dashoffset" from="44" to="0" dur="1.6s" repeatCount="indefinite" />
      </path>
      <circle cx="14" cy="96" r="5" fill="#fe5200" />
      <circle cx="286" cy="62" r="5" fill="#fe5200" />
      <circle r="4.5" fill="#fff" stroke="#fe5200" strokeWidth="2">
        <animateMotion dur="3.4s" repeatCount="indefinite" path="M14 96 Q150 4 286 62" />
      </circle>
    </svg>
  ),
  local: (
    <svg viewBox="0 0 300 118" aria-hidden="true">
      <rect x="12" y="20" width="276" height="82" rx="10" fill="none" stroke="#fe5200" strokeOpacity=".2" strokeDasharray="4 5" />
      {[[58, 52], [116, 38], [172, 66], [232, 46], [92, 80], [196, 88]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          <circle r="7" fill="#fe5200" opacity=".14">
            <animate attributeName="r" values="7;13;7" dur="2.6s" begin={`${i * 0.34}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values=".26;0;.26" dur="2.6s" begin={`${i * 0.34}s`} repeatCount="indefinite" />
          </circle>
          <circle r="4" fill="#fe5200" />
        </g>
      ))}
    </svg>
  ),
  freight: (
    <svg viewBox="0 0 300 118" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => {
        const x = 30 + (i % 4) * 44;
        const y = i < 4 ? 30 : 62;
        const o = 0.18 + (i % 4) * 0.17;
        return (
          <rect key={i} x={x} y={y} width="40" height="28" rx="3" fill="#fe5200" opacity={o}>
            <animate attributeName="opacity" values={`${o};0.85;${o}`} dur="3.2s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
          </rect>
        );
      })}
    </svg>
  ),
  dg: (
    <svg viewBox="0 0 300 118" aria-hidden="true">
      <g transform="translate(150 58)">
        <rect x="-34" y="-34" width="68" height="68" rx="7" transform="rotate(45)" fill="none" stroke="#fe5200" strokeWidth="2.5" />
        <rect x="-25" y="-25" width="50" height="50" rx="5" transform="rotate(45)" fill="#fe5200" opacity=".1">
          <animate attributeName="opacity" values=".06;.26;.06" dur="2.2s" repeatCount="indefinite" />
        </rect>
        <path d="M0 -15 v17 M0 11 v3" stroke="#fe5200" strokeWidth="3.2" strokeLinecap="round" />
      </g>
      <path d="M6 58 H86 M214 58 H294" stroke="#fe5200" strokeOpacity=".22" strokeWidth="2" strokeDasharray="4 6" />
    </svg>
  ),
};

const BIZ_ICONS: Record<string, string> = {
  card: "M2 9h20M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM6 14h4",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  store: "M3 9V5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5V9M3 9a3 3 0 1 0 6 0 3 3 0 1 0 6 0 3 3 0 1 0 6 0M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M9 13h6M9 17h4",
  vat: "M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6",
  ops: "M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5ZM4 22a8 8 0 0 1 16 0M9 21v-3M15 21v-3",
};

export function CarrierMarquee() {
  const { t } = useLocale();
  return (
    <div className="marquee on-void">
      <div className="marquee-label">{t("mq.label")}</div>
      {/* Doubled so the -50% slide loops seamlessly. */}
      <div className="marquee-track">
        {[...BOOKABLE_CARRIERS, ...BOOKABLE_CARRIERS].map((code, i) => (
          <CarrierMark key={`${code}-${i}`} code={code} name={code} />
        ))}
      </div>
    </div>
  );
}

export function Flows() {
  const { t, content } = useLocale();
  return (
    <section id="flows">
      <div className="wrap">
        <Reveal className="sec-head">
          <div className="kicker">{t("fl.kicker")}</div>
          <h2>{t("fl.title")}</h2>
          <p>{t("fl.sub")}</p>
        </Reveal>
        <div className="bento">
          {content.flows.map((flow, i) => (
            <Reveal key={flow.title} className={`tile ${i < 2 ? "tile-lg" : "tile-md"}`} delay={i * 0.07}>
              <div className="art">{FLOW_ART[flow.art]}</div>
              <h3>{flow.title}</h3>
              <p>{flow.body}</p>
              <span className="tag">{flow.tag}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const { t, content } = useLocale();
  return (
    <section id="how" className="sec-alt">
      <div className="wrap">
        <Reveal className="sec-head center">
          <div className="kicker">{t("how.kicker")}</div>
          <h2>{t("how.title")}</h2>
        </Reveal>
        <Reveal className="pipe">
          <div className="pipe-steps">
            {content.steps.map((step, i) => (
              <div className="pipe-step" key={step.title}>
                <span className="pipe-n num">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal className="pipe-note" delay={0.1}>{t("how.note")}</Reveal>
      </div>
    </section>
  );
}

export function TrackingPreview() {
  const { t, content } = useLocale();
  return (
    <section id="track">
      <div className="wrap">
        <Reveal className="sec-head">
          <div className="kicker">{t("tr.kicker")}</div>
          <h2>{t("tr.title")}</h2>
          <p>{t("tr.sub")}</p>
        </Reveal>
        <div className="track-wrap">
          <Reveal>
            <div className="timeline">
              {content.timeline.map((item) => (
                <div className="tl-item on" key={item.title}>
                  <div className="tl-t">{item.title}</div>
                  <div className="tl-m">{item.meta}</div>
                  <div className="tl-c"><bdi>{item.time}</bdi></div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal className="docs" delay={0.12}>
            <div className="doc doc-label">
              <div className="doc-hd"><b>AIR WAYBILL</b><span>1 / 25</span></div>
              <div className="doc-row"><span>SA · Riyadh</span><b>AE · Dubai</b></div>
              <div className="barcode">
                {Array.from({ length: 42 }, (_, i) => (
                  <i key={i} style={{ width: i % 3 === 0 ? 3 : 1.5 }} />
                ))}
              </div>
              <div className="doc-awb num">8772 0650 2140</div>
            </div>
            <div className="doc doc-inv">
              <div className="doc-hd"><b>COMMERCIAL INVOICE</b><span>EZH0438</span></div>
              <div className="doc-row"><span>Cotton shirts · 6109.10</span><b className="num">SAR 480.00</b></div>
              <div className="doc-row"><span>Leather belts · 4203.30</span><b className="num">SAR 260.00</b></div>
              <div className="doc-row" style={{ borderTop: "1px solid var(--rule)", marginTop: 6, paddingTop: 7 }}>
                <span>Declared value</span><b className="num">SAR 740.00</b>
              </div>
              <div className="doc-row"><span>Incoterm</span><b>DAP</b></div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function ForBusiness() {
  const { t, content } = useLocale();
  return (
    <section id="business" className="sec-alt">
      <div className="wrap">
        <Reveal className="sec-head">
          <div className="kicker">{t("bz.kicker")}</div>
          <h2>{t("bz.title")}</h2>
          <p>{t("bz.sub")}</p>
        </Reveal>
        <div className="bento">
          {content.biz.map((item, i) => (
            <Reveal key={item.title} className="tile tile-sm" delay={i * 0.06}>
              <div className="icon">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d={BIZ_ICONS[item.icon]} /></svg>
              </div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <span className="tag"><b>{item.tag}</b></span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Reach() {
  const { t, content } = useLocale();
  return (
    <section className="sec-void on-void">
      <div className="wrap">
        <Reveal className="sec-head center">
          <div className="kicker">{t("st.kicker")}</div>
          <h2>{t("st.title")}</h2>
        </Reveal>
        <Reveal className="stats">
          {content.stats.map((stat) => (
            <div className="stat" key={stat.label}>
              <div className="stat-n num"><CountUp to={stat.value} /></div>
              <div className="stat-l">{stat.label}</div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function Closing() {
  const { t } = useLocale();
  return (
    <section className="closing">
      <div className="closing-bg" />
      <div className="glow glow-a" /><div className="glow glow-b" />
      <div className="wrap">
        <h2>{t("cta.title")}</h2>
        <p>{t("cta.sub")}</p>
        <div className="cta-row">
          <a className="btn btn-white btn-lg" href={signupHref()}>{t("cta.primary")}</a>
          <a className="btn btn-glass btn-lg" href="#top">{t("cta.secondary")}</a>
        </div>
        <p className="fine">{t("cta.fine")}</p>
      </div>
    </section>
  );
}

export function Footer() {
  const { t, alternate } = useLocale();
  return (
    <footer>
      <div className="wrap">
        <span className="fbrand">ezhalha</span>
        <span className="sep" />
        <span>{t("copyright")}</span>
        <span className="flinks">
          <a href={`${APP_ORIGIN}/policy/privacy-policy`}>{t("ft.privacy")}</a>
          <a href={`${APP_ORIGIN}/policy/shipping-return-policy`}>{t("ft.terms")}</a>
          <a href={alternate.href} lang={alternate.locale} hrefLang={alternate.locale}>{alternate.label}</a>
        </span>
      </div>
    </footer>
  );
}
