import { LocaleProvider } from "@marketing/i18n";
import { SiteHeader } from "@marketing/components/site-header";
import type { Locale } from "@shared/i18n";
import { Hero } from "@marketing/sections/hero";
import { FanOut, WeightLab } from "@marketing/sections/showcase";
import { CarrierMarquee, Closing, Flows, Footer, ForBusiness, HowItWorks, Reach, TrackingPreview } from "@marketing/sections/content";
import "./styles.css";

export function App({ locale }: { locale: Locale }) {
  return (
    <LocaleProvider locale={locale}>
      <SiteHeader />
      <Hero />
      <CarrierMarquee />
      <FanOut />
      <Flows />
      <WeightLab />
      <HowItWorks />
      <TrackingPreview />
      <ForBusiness />
      <Reach />
      <Closing />
      <Footer />
    </LocaleProvider>
  );
}
