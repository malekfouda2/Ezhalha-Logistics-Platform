import {
  ShipmentTaxScenario,
  ShipmentType,
  type ShipmentTaxScenarioValue,
  type ShipmentTypeValue,
} from "@shared/schema";

export const ACCOUNTING_CURRENCY = "SAR";
export const VAT_RATE = 0.15;
export const DDP_ELIGIBLE_DESTINATIONS = new Set(["SA", "AE"]);

export interface ShipmentAccountingInput {
  shipmentType: ShipmentTypeValue;
  isDdp?: boolean;
  recipientCountryCode: string;
  baseRate: number;
  marginAmount: number;
}

export interface ShipmentAccountingSnapshot {
  accountingCurrency: typeof ACCOUNTING_CURRENCY;
  taxScenario: ShipmentTaxScenarioValue;
  isDdp: boolean;
  costAmountSar: number;
  costTaxAmountSar: number;
  sellSubtotalAmountSar: number;
  sellTaxAmountSar: number;
  clientTotalAmountSar: number;
  systemCostTotalAmountSar: number;
  taxPayableAmountSar: number;
  revenueExcludingTaxAmountSar: number;
  marginAmountSar: number;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isDdpEligibleForShipment(
  shipmentType: ShipmentTypeValue,
  recipientCountryCode: string,
): boolean {
  return (
    shipmentType === ShipmentType.INBOUND &&
    DDP_ELIGIBLE_DESTINATIONS.has((recipientCountryCode || "").toUpperCase())
  );
}

export function resolveShipmentTaxScenario(
  shipmentType: ShipmentTypeValue,
  isDdp: boolean,
  recipientCountryCode: string,
): ShipmentTaxScenarioValue {
  if (isDdp) {
    if (!isDdpEligibleForShipment(shipmentType, recipientCountryCode)) {
      throw new Error("DDP is only available for import shipments to Saudi Arabia or the UAE");
    }
    return ShipmentTaxScenario.DDP;
  }

  switch (shipmentType) {
    case ShipmentType.DOMESTIC:
      return ShipmentTaxScenario.DCE;
    case ShipmentType.INBOUND:
      return ShipmentTaxScenario.IMPORT;
    case ShipmentType.OUTBOUND:
      return ShipmentTaxScenario.EXPORT;
    default:
      throw new Error(`Unsupported shipment type: ${shipmentType}`);
  }
}

export function calculateShipmentAccounting(
  input: ShipmentAccountingInput,
): ShipmentAccountingSnapshot {
  const taxScenario = resolveShipmentTaxScenario(
    input.shipmentType,
    Boolean(input.isDdp),
    input.recipientCountryCode,
  );

  const costAmountSar = roundCurrency(input.baseRate);
  const marginAmountSar = roundCurrency(input.marginAmount);
  const sellSubtotalAmountSar = roundCurrency(costAmountSar + marginAmountSar);

  let costTaxAmountSar = 0;
  let sellTaxAmountSar = 0;
  let clientTotalAmountSar = sellSubtotalAmountSar;

  if (taxScenario === ShipmentTaxScenario.DCE) {
    costTaxAmountSar = roundCurrency(costAmountSar * VAT_RATE);
    sellTaxAmountSar = roundCurrency(sellSubtotalAmountSar * VAT_RATE);
    clientTotalAmountSar = roundCurrency(sellSubtotalAmountSar + sellTaxAmountSar);
  } else {
    sellTaxAmountSar = roundCurrency(
      marginAmountSar - marginAmountSar / (1 + VAT_RATE),
    );
  }

  const systemCostTotalAmountSar = roundCurrency(costAmountSar + costTaxAmountSar);
  const taxPayableAmountSar = roundCurrency(sellTaxAmountSar - costTaxAmountSar);
  const revenueExcludingTaxAmountSar = roundCurrency(
    clientTotalAmountSar - sellTaxAmountSar,
  );

  return {
    accountingCurrency: ACCOUNTING_CURRENCY,
    taxScenario,
    isDdp: taxScenario === ShipmentTaxScenario.DDP,
    costAmountSar,
    costTaxAmountSar,
    sellSubtotalAmountSar,
    sellTaxAmountSar,
    clientTotalAmountSar,
    systemCostTotalAmountSar,
    taxPayableAmountSar,
    revenueExcludingTaxAmountSar,
    marginAmountSar,
  };
}
