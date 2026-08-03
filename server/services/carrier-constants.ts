// Email address sent to carriers on shipment/pickup payloads. We deliberately send the ezhalha
// operations mailbox rather than the client's own email, so all carrier-side notifications and
// correspondence route to ops (clients never expose their email to carriers).
export const CARRIER_CONTACT_EMAIL = "operations@ezhalha.co";
