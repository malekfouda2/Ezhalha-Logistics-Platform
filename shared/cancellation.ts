import { isCarrierStatusStillBooked } from "./domain";

/**
 * What actually happens when a shipment is cancelled, as plain sentences for a confirmation
 * dialog.
 *
 * This is a pure function rather than JSX so the wording can be tested directly — the promise
 * "the client is refunded automatically" is a claim about money, and it has to track the server's
 * own `isShipmentStillBooked` branch rather than drift from it. Both sides read the same helper.
 *
 * Shared (not client-only) so the mobile app shows the same sentences.
 */
export interface CancellationConsequenceInput {
  carrierStatus?: string | null;
  carrierName?: string | null;
  /** Whether a courier pickup is booked and would be released. */
  hasPickupBooked?: boolean;
}

export interface CancellationConsequences {
  /** True when cancelling refunds the client immediately, with no approval step. */
  refundsAutomatically: boolean;
  /** Ordered bullets describing the effects, most concrete first. */
  effects: string[];
}

export function describeCancellationConsequences(
  input: CancellationConsequenceInput,
): CancellationConsequences {
  const refundsAutomatically = isCarrierStatusStillBooked(input.carrierStatus);
  const carrier = input.carrierName?.trim() || "the carrier";

  const effects = [`The waybill is cancelled with ${carrier} and its label stops being valid.`];

  if (input.hasPickupBooked) {
    effects.push("The booked courier pickup is released, so no driver is sent.");
  }

  effects.push(
    refundsAutomatically
      ? "The client is refunded automatically, in full, without needing approval."
      : "The goods are already with the carrier, so this opens a refund request for approval rather than refunding straight away. The parcel may still be delivered.",
  );

  return { refundsAutomatically, effects };
}
