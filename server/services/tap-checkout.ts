import { formatTapAmount, tapService, type TapChargeCustomer } from "../integrations/tap";

/**
 * Build a session for Tap's native Checkout SDK (React Native, iOS, Android, Flutter).
 *
 * The native SDKs invert the hosted-page flow. On the web we create the charge server-side and
 * send the client to `charge.transaction.url`; the SDK instead renders the payment form *inside
 * the app* and creates the charge itself from the public key. So there is no charge to create
 * here — this endpoint's job is to hand the app a configuration it is not trusted to assemble.
 *
 * That distinction is the whole security model. The app never states what it owes: the amount,
 * the currency, the reference and the webhook URL are decided here, signed into `hashString` with
 * the secret key, and Tap rejects the session if the app alters any of them in transit. A client
 * that posts `{ shipmentId }` cannot post `{ amount }`.
 *
 * Two fields carry the reconciliation and both are deliberate:
 *
 * - `metadata` is what `processTapShipmentCharge` reads (`metadata.shipmentId`) — the same keys
 *   the hosted flow sets, so one webhook path serves both.
 * - `reference.transaction` repeats the identity in a field Tap always echoes back, because the
 *   SDK's metadata pass-through is not something we control. The webhook falls back to it.
 *
 * `reference.idempotent` is set to our own row id so a retried tap on a slow connection settles
 * as one charge rather than two — the duplicate-payment failure mode this platform has already
 * had once.
 */

export interface TapCheckoutLineItem {
  name: string;
  amount: number;
  quantity?: number;
  description?: string;
}

export interface TapCheckoutSessionParams {
  amount: number;
  currency: string;
  description: string;
  customer: TapChargeCustomer;
  /** `transaction` is the human reference (tracking number, invoice number); `order` is our row id. */
  reference: { transaction: string; order: string };
  /** Must carry `shipmentId` or `invoiceId` — the webhook reconciles on it. */
  metadata: Record<string, string>;
  postUrl: string;
  redirectUrl: string;
  language?: string;
  saveCard?: boolean;
  items?: TapCheckoutLineItem[];
}

export interface TapCheckoutSession {
  configured: boolean;
  /** Pass to the SDK unchanged. Editing any signed field invalidates `hashString`. */
  configurations: Record<string, unknown>;
}

const SUPPORTED_LANGUAGES = new Set(["en", "ar"]);

function normalizeLanguage(language: string | undefined): string {
  const candidate = String(language || "en").toLowerCase();
  return SUPPORTED_LANGUAGES.has(candidate) ? candidate : "en";
}

/**
 * Tap's phone object wants a bare dialling code and a national number. A malformed pair fails the
 * whole session rather than the field, so an unusable phone is dropped instead of sent.
 */
function sanitizePhone(customer: TapChargeCustomer) {
  const phone = customer.phone;
  if (!phone) return null;
  if (!/^[1-9]\d{0,2}$/.test(phone.countryCode)) return null;
  if (!/^\d{6,15}$/.test(phone.number)) return null;
  return { countryCode: phone.countryCode, number: phone.number };
}

export function buildTapCheckoutSession(params: TapCheckoutSessionParams): TapCheckoutSession {
  const currency = params.currency.toUpperCase();
  const amount = formatTapAmount(params.amount, currency);
  const publicKey = tapService.getPublicKey();
  const merchantId = tapService.getMerchantId();

  const hashString = tapService.buildCheckoutHashString({
    amount: params.amount,
    currency,
    transactionReference: params.reference.transaction,
    postUrl: params.postUrl,
  });

  const items = (params.items?.length
    ? params.items
    : [{ name: params.description, amount: params.amount, quantity: 1 }]
  ).map((item) => ({
    name: item.name,
    amount: formatTapAmount(item.amount, currency),
    currency,
    quantity: item.quantity ?? 1,
    ...(item.description ? { description: item.description } : {}),
  }));

  const phone = sanitizePhone(params.customer);

  return {
    // The app should check this before opening the sheet: without a public key there is nothing
    // for the SDK to authenticate with, and a session built anyway would fail inside the UI.
    configured: Boolean(publicKey && hashString),
    configurations: {
      gateway: {
        publicKey: publicKey || null,
        merchantId: merchantId || null,
      },
      language: normalizeLanguage(params.language),
      supportedPaymentMethods: "ALL",
      selectedCurrency: currency,
      hashString: hashString || "",
      customer: {
        ...(params.customer.id ? { id: params.customer.id } : {}),
        firstName: params.customer.firstName,
        lastName: params.customer.lastName,
        email: params.customer.email,
        ...(phone ? { phone } : {}),
      },
      order: {
        amount,
        currency,
        items,
      },
      transaction: {
        mode: "charge",
        charge: {
          description: params.description,
          metadata: params.metadata,
          reference: {
            transaction: params.reference.transaction,
            order: params.reference.order,
            idempotent: params.reference.order,
          },
          saveCard: Boolean(params.saveCard && tapService.isSavedCardsEnabled()),
          threeDSecure: true,
          redirect: { url: params.redirectUrl },
          post: { url: params.postUrl },
        },
      },
      cardOptions: {
        showBrands: true,
        collectHolderName: true,
        saveCardOption: tapService.isSavedCardsEnabled() ? "all" : "none",
      },
    },
  };
}
