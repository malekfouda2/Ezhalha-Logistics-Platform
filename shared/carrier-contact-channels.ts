/**
 * Labelled contact channels for a carrier, stored on the carrier's integration account under the
 * `{CODE}_SUPPORT_CONTACTS` setting as JSON.
 *
 * A carrier is rarely one phone number: there is a general customer-service line, an account
 * manager for a branch, a claims mailbox. Each entry therefore carries its own label, so an
 * operator picking a channel in the Operations Hub knows who they are about to reach rather than
 * choosing between three bare numbers.
 */

export const CARRIER_CONTACT_TYPES = ["phone", "whatsapp", "email"] as const;

export type CarrierContactType = (typeof CARRIER_CONTACT_TYPES)[number];

export interface CarrierContactChannel {
  /** Who this reaches, e.g. "Jeddah account manager". Required — an unlabelled channel is the
   *  exact problem this replaces. */
  label: string;
  type: CarrierContactType;
  /** Phone/WhatsApp number or email address, as the admin typed it. */
  value: string;
}

/** The settings key holding the JSON array, e.g. `FEDEX_SUPPORT_CONTACTS`. */
export function carrierContactsSettingKey(carrierCode: string): string {
  return `${carrierCode.trim().toUpperCase()}_SUPPORT_CONTACTS`;
}

/** The three single-value keys this replaces. Still read so existing accounts keep working. */
export function legacyCarrierContactKeys(carrierCode: string) {
  const code = carrierCode.trim().toUpperCase();
  return {
    phone: `${code}_SUPPORT_PHONE`,
    email: `${code}_SUPPORT_EMAIL`,
    whatsapp: `${code}_SUPPORT_WHATSAPP`,
  };
}

function isContactType(value: unknown): value is CarrierContactType {
  return typeof value === "string" && (CARRIER_CONTACT_TYPES as readonly string[]).includes(value);
}

/**
 * Read the stored JSON into a channel list.
 *
 * Deliberately tolerant: this runs on the Operations Hub's read path, and a hand-edited or
 * half-written settings blob must degrade to "no channels" rather than throw and take the whole
 * shipment detail down. Malformed entries are skipped individually, not the whole list.
 */
export function parseCarrierContactChannels(raw: unknown): CarrierContactChannel[] {
  let source = raw;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];

  const channels: CarrierContactChannel[] = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const value = typeof candidate.value === "string" ? candidate.value.trim() : "";
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    if (!value || !isContactType(candidate.type)) continue;
    channels.push({ label, type: candidate.type, value });
  }
  return channels;
}

export function serializeCarrierContactChannels(channels: CarrierContactChannel[]): string {
  return JSON.stringify(
    channels.map((channel) => ({
      label: channel.label.trim(),
      type: channel.type,
      value: channel.value.trim(),
    })),
  );
}

/**
 * Fold the three legacy single-value settings into the channel list.
 *
 * Only applies to a type the list does not already cover: once an admin has entered labelled
 * phones, the old unlabelled `_SUPPORT_PHONE` must not reappear beside them as a duplicate. It
 * stays in the settings blob untouched, so nothing is lost if the new list is cleared.
 */
export function withLegacyCarrierContacts(
  channels: CarrierContactChannel[],
  legacy: { phone?: string | null; email?: string | null; whatsapp?: string | null },
): CarrierContactChannel[] {
  const covered = new Set(channels.map((channel) => channel.type));
  const merged = [...channels];
  const fallbackLabels: Record<CarrierContactType, string> = {
    phone: "Customer service",
    whatsapp: "WhatsApp",
    email: "Support email",
  };

  for (const type of CARRIER_CONTACT_TYPES) {
    if (covered.has(type)) continue;
    const value = (legacy[type] || "").trim();
    if (!value) continue;
    merged.push({ label: fallbackLabels[type], type, value });
  }
  return merged;
}

/** First value of a given type — used to keep the older single-value API shape populated. */
export function firstCarrierContactOfType(
  channels: CarrierContactChannel[],
  type: CarrierContactType,
): string | null {
  return channels.find((channel) => channel.type === type)?.value || null;
}

export interface CarrierContactValidationError {
  index: number;
  message: string;
}

/**
 * Validate a channel list before it is saved. Returns the problems rather than throwing, so the
 * caller can report every bad row at once instead of one per round trip.
 */
export function validateCarrierContactChannels(
  channels: CarrierContactChannel[],
): CarrierContactValidationError[] {
  const errors: CarrierContactValidationError[] = [];
  channels.forEach((channel, index) => {
    if (!channel.label.trim()) {
      errors.push({ index, message: "Every contact needs a label so operators know who it reaches." });
    }
    const value = channel.value.trim();
    if (!value) {
      errors.push({ index, message: "Contact value is required." });
      return;
    }
    if (channel.type === "email") {
      // Intentionally loose — carriers use odd internal domains, and a stricter pattern would
      // reject valid mailboxes we have no way to re-check.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push({ index, message: `"${value}" is not a valid email address.` });
      }
    } else if (!/^\+?[\d\s()-]{6,}$/.test(value)) {
      errors.push({ index, message: `"${value}" is not a valid phone number.` });
    }
  });
  return errors;
}
