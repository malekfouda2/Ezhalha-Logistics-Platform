// Carrier customer-service phone numbers (Saudi Arabia). Used by the operations hub to place a
// direct call to the carrier from a shipment's attention view. Keyed by the carrier code stored on
// the shipment (uppercased).
export interface CarrierContact {
  name: string;
  phone: string; // E.164 for the tel: link
  display: string; // human-friendly number
}

const CARRIER_CONTACTS: Record<string, CarrierContact> = {
  FEDEX: { name: "FedEx", phone: "+9668001000530", display: "800 100 0530" },
  DHL: { name: "DHL Express", phone: "+9668002447000", display: "800 244 7000" },
  ARAMEX: { name: "Aramex", phone: "+966920027447", display: "920 027 447" },
};

export function getCarrierContact(carrierCode?: string | null): CarrierContact | null {
  if (!carrierCode) return null;
  return CARRIER_CONTACTS[carrierCode.trim().toUpperCase()] || null;
}
