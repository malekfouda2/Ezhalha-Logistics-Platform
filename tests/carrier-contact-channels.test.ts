import { describe, expect, it } from "vitest";
import {
  carrierContactsSettingKey,
  firstCarrierContactOfType,
  legacyCarrierContactKeys,
  parseCarrierContactChannels,
  serializeCarrierContactChannels,
  validateCarrierContactChannels,
  withLegacyCarrierContacts,
  type CarrierContactChannel,
} from "../shared/carrier-contact-channels";
import { sanitizeIntegrationSettings } from "../server/services/integration-apps";
import { getIntegrationDefinition } from "../server/services/integration-apps";

const fedex = getIntegrationDefinition("fedex")!;

describe("parsing stored contacts", () => {
  it("reads a stored JSON array", () => {
    const channels = parseCarrierContactChannels(
      JSON.stringify([
        { label: "Jeddah account manager", type: "phone", value: "+966500000001" },
        { label: "Claims", type: "email", value: "claims@fedex.com" },
      ]),
    );
    expect(channels).toHaveLength(2);
    expect(channels[0].label).toBe("Jeddah account manager");
    expect(channels[1].type).toBe("email");
  });

  it("degrades to an empty list instead of throwing on a broken blob", () => {
    // This runs on the Operations Hub read path — a half-written settings value must not take
    // the whole shipment detail down.
    expect(parseCarrierContactChannels("not json at all")).toEqual([]);
    expect(parseCarrierContactChannels("")).toEqual([]);
    expect(parseCarrierContactChannels(undefined)).toEqual([]);
    expect(parseCarrierContactChannels('{"label":"x"}')).toEqual([]);
  });

  it("skips only the bad entries, keeping the usable ones", () => {
    const channels = parseCarrierContactChannels(
      JSON.stringify([
        { label: "Good", type: "phone", value: "+966500000001" },
        { label: "No value", type: "phone" },
        { label: "Bad type", type: "carrier-pigeon", value: "x" },
        null,
      ]),
    );
    expect(channels).toHaveLength(1);
    expect(channels[0].label).toBe("Good");
  });
});

describe("migrating the retired single-value settings", () => {
  it("folds the old unlabelled values in and gives them a label", () => {
    const channels = withLegacyCarrierContacts([], {
      phone: "+9668001000530",
      email: "support@fedex.com",
      whatsapp: "+966500000009",
    });
    expect(channels.map((c) => [c.type, c.label, c.value])).toEqual([
      ["phone", "Customer service", "+9668001000530"],
      ["whatsapp", "WhatsApp", "+966500000009"],
      ["email", "Support email", "support@fedex.com"],
    ]);
  });

  it("does not re-add a legacy value once labelled contacts of that type exist", () => {
    // Otherwise the old unlabelled number reappears next to the new ones as a duplicate.
    const labelled: CarrierContactChannel[] = [
      { label: "Jeddah account manager", type: "phone", value: "+966500000001" },
    ];
    const channels = withLegacyCarrierContacts(labelled, {
      phone: "+9668001000530",
      email: "support@fedex.com",
    });
    expect(channels.filter((c) => c.type === "phone")).toHaveLength(1);
    expect(channels.find((c) => c.type === "phone")?.value).toBe("+966500000001");
    // The email had no labelled equivalent, so it still comes through.
    expect(channels.find((c) => c.type === "email")?.value).toBe("support@fedex.com");
  });

  it("keeps the single-value API shape populated from the list", () => {
    const channels: CarrierContactChannel[] = [
      { label: "Second line", type: "phone", value: "+966500000002" },
      { label: "First listed", type: "phone", value: "+966500000001" },
      { label: "Claims", type: "email", value: "claims@fedex.com" },
    ];
    expect(firstCarrierContactOfType(channels, "phone")).toBe("+966500000002");
    expect(firstCarrierContactOfType(channels, "email")).toBe("claims@fedex.com");
    expect(firstCarrierContactOfType(channels, "whatsapp")).toBeNull();
  });
});

describe("validation", () => {
  it("requires a label, because an unlabelled channel is the problem being fixed", () => {
    const errors = validateCarrierContactChannels([
      { label: "  ", type: "phone", value: "+966500000001" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("label");
  });

  it("rejects malformed values per type", () => {
    expect(validateCarrierContactChannels([{ label: "Ops", type: "email", value: "nope" }]))
      .toHaveLength(1);
    expect(validateCarrierContactChannels([{ label: "Ops", type: "phone", value: "abc" }]))
      .toHaveLength(1);
    expect(validateCarrierContactChannels([{ label: "Ops", type: "phone", value: "+966 50 000 0001" }]))
      .toHaveLength(0);
  });

  it("reports every bad row, not just the first", () => {
    const errors = validateCarrierContactChannels([
      { label: "", type: "phone", value: "abc" },
      { label: "", type: "email", value: "also-bad" },
    ]);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("saving through the integration settings boundary", () => {
  const key = carrierContactsSettingKey("FEDEX");

  it("normalises a valid list on save", () => {
    const saved = sanitizeIntegrationSettings(fedex, {
      [key]: JSON.stringify([{ label: "  Ops  ", type: "phone", value: " +966500000001 " }]),
    });
    expect(parseCarrierContactChannels(saved[key])).toEqual([
      { label: "Ops", type: "phone", value: "+966500000001" },
    ]);
  });

  it("refuses a list the Operations Hub could not use", () => {
    expect(() =>
      sanitizeIntegrationSettings(fedex, {
        [key]: JSON.stringify([{ label: "", type: "phone", value: "+966500000001" }]),
      }),
    ).toThrow(/label/i);
  });

  it("still accepts the retired keys so saving an existing account does not fail", () => {
    // The three single-value keys are no longer rendered, but an account saved before the
    // change may still carry them. Rejecting them here would make that account unsavable.
    const legacy = legacyCarrierContactKeys("FEDEX");
    const saved = sanitizeIntegrationSettings(fedex, {
      [legacy.phone]: "+9668001000530",
      [legacy.email]: "support@fedex.com",
    });
    expect(saved[legacy.phone]).toBe("+9668001000530");
    expect(saved[legacy.email]).toBe("support@fedex.com");
  });

  it("rejects a settings key no field declares", () => {
    expect(() => sanitizeIntegrationSettings(fedex, { FEDEX_NOT_A_FIELD: "x" })).toThrow(/Unsupported/i);
  });
});

describe("round trip", () => {
  it("survives serialize → parse unchanged", () => {
    const channels: CarrierContactChannel[] = [
      { label: "Jeddah account manager", type: "phone", value: "+966500000001" },
      { label: "Ops WhatsApp", type: "whatsapp", value: "+966500000002" },
      { label: "Claims", type: "email", value: "claims@fedex.com" },
    ];
    expect(parseCarrierContactChannels(serializeCarrierContactChannels(channels))).toEqual(channels);
  });
});
