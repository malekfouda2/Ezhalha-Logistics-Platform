import { createContext, useContext } from "react";

/**
 * When an admin builds a quotation, the existing client create-shipment pages are reused
 * inside a QuotationModeProvider. The pages read this context to (a) act on behalf of the
 * selected client, (b) swap client endpoints for admin on-behalf-of endpoints, and (c)
 * replace the final "Pay" step with "Send to client". When the context is absent (null),
 * the pages behave exactly as the normal client flow — no behavioural change.
 */
export interface QuotationMode {
  clientAccountId: string;
  clientName?: string;
}

export const QuotationModeContext = createContext<QuotationMode | null>(null);

export function useQuotationMode(): QuotationMode | null {
  return useContext(QuotationModeContext);
}
