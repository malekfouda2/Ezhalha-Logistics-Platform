/**
 * The countries the quote widget offers.
 *
 * This is exactly the set the server can live-rate: QUICK_QUOTE_RATE_LOCATIONS in
 * server/routes.ts, which fabricates a representative city and postal code per country so a
 * carrier can be asked for a real rate without a full address. Offering a country outside that
 * set would render a picker option that always comes back empty, which is the worst possible
 * first impression on a page whose whole job is showing a price.
 *
 * tests/marketing-countries.test.ts asserts this list and that constant stay identical, so
 * adding a country on the server without adding it here fails the build rather than drifting.
 */
export type MarketingCountry = { code: string; en: string; ar: string };

export const COUNTRIES: MarketingCountry[] = [
  { code: "SA", en: "Saudi Arabia", ar: "السعودية" },
  { code: "AE", en: "United Arab Emirates", ar: "الإمارات" },
  { code: "KW", en: "Kuwait", ar: "الكويت" },
  { code: "QA", en: "Qatar", ar: "قطر" },
  { code: "BH", en: "Bahrain", ar: "البحرين" },
  { code: "OM", en: "Oman", ar: "عُمان" },
  { code: "EG", en: "Egypt", ar: "مصر" },
  { code: "JO", en: "Jordan", ar: "الأردن" },
  { code: "LB", en: "Lebanon", ar: "لبنان" },
  { code: "TR", en: "Türkiye", ar: "تركيا" },
  { code: "MA", en: "Morocco", ar: "المغرب" },
  { code: "GB", en: "United Kingdom", ar: "المملكة المتحدة" },
  { code: "DE", en: "Germany", ar: "ألمانيا" },
  { code: "FR", en: "France", ar: "فرنسا" },
  { code: "IT", en: "Italy", ar: "إيطاليا" },
  { code: "ES", en: "Spain", ar: "إسبانيا" },
  { code: "NL", en: "Netherlands", ar: "هولندا" },
  { code: "US", en: "United States", ar: "الولايات المتحدة" },
  { code: "CA", en: "Canada", ar: "كندا" },
  { code: "CN", en: "China", ar: "الصين" },
  { code: "HK", en: "Hong Kong", ar: "هونغ كونغ" },
  { code: "IN", en: "India", ar: "الهند" },
  { code: "JP", en: "Japan", ar: "اليابان" },
  { code: "KR", en: "South Korea", ar: "كوريا الجنوبية" },
  { code: "SG", en: "Singapore", ar: "سنغافورة" },
  { code: "PK", en: "Pakistan", ar: "باكستان" },
  { code: "BD", en: "Bangladesh", ar: "بنغلاديش" },
  { code: "AU", en: "Australia", ar: "أستراليا" },
];

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code);
