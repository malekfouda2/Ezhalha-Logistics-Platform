// app/create-shipment/guest-checkout.tsx

import { useTranslation } from "react-i18next";
import { GuestGate } from "@/components/ui/GuestGate";

/**
 * Landed on from the Express/Local wizards' last step instead of actually creating a shipment
 * (see usePickupStep.ts / local/useRatesStep.ts) — the exact point web's `GuestCheckoutGate`
 * sits at, since this is where a real, persisted shipment (and a charge) would otherwise happen.
 * The wizard's in-progress data stays in its zustand store, so returning after registering
 * picks up right where the guest left off.
 */
export default function GuestCheckoutGateScreen() {
  const { t } = useTranslation();

  return (
    <GuestGate
      title={t("guest.gate.checkoutTitle")}
      description={t("guest.gate.checkoutDescription")}
    />
  );
}
