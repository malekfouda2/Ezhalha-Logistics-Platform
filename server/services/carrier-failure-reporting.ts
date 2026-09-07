import type { Shipment } from "@shared/schema";
import {
  CarrierErrorCategory,
  CarrierRetryAdvice,
  carrierRetryLabel,
  explainCarrierError,
  type CarrierErrorExplanation,
} from "@shared/carrier-errors";
import {
  getActiveAssignmentsForShipment,
  notifyUsers,
  upsertOpenAttentionFlag,
} from "./operations";
import { logError } from "./logger";

/**
 * Tell somebody, in words they can act on, that a carrier call failed.
 *
 * Before this existed a failure wrote a raw carrier string into a column and stopped there.
 * An operator retried a DHL pickup fourteen times across three days because the only feedback
 * they had was DHL's own text, which ended "please update and re-try" without saying what to
 * update. So each failure now raises one attention flag carrying the decoded cause and the
 * next action, and pings whoever the shipment is assigned to.
 */

export type CarrierOperation =
  | "pickup"
  | "booking"
  | "tracking"
  | "label"
  | "cancellation"
  | "rating";

const OPERATION_LABELS: Record<CarrierOperation, string> = {
  pickup: "Pickup booking",
  booking: "Carrier booking",
  tracking: "Tracking refresh",
  label: "Label generation",
  cancellation: "Carrier cancellation",
  rating: "Rate lookup",
};

/**
 * How loudly to flag it.
 *
 * A rejected credential is high severity even though no single shipment caused it — it means
 * every shipment on that account is failing. A carrier's own 5xx is low, because it usually
 * clears on its own and flagging every blip trains people to ignore flags.
 */
function severityFor(explanation: CarrierErrorExplanation, operation: CarrierOperation): string {
  if (explanation.category === CarrierErrorCategory.CREDENTIALS) return "high";
  if (explanation.category === CarrierErrorCategory.PLATFORM_BUG) return "high";
  if (explanation.category === CarrierErrorCategory.CARRIER_FAULT) return "low";
  // A shipment nobody can collect or book is stuck until someone acts.
  if (operation === "pickup" || operation === "booking") return "high";
  return "medium";
}

export function carrierFailureIssueType(operation: CarrierOperation): string {
  return `carrier_${operation}_failed`;
}

/**
 * Record a carrier failure and make it visible.
 *
 * Never throws: reporting a problem must not become a second problem on top of the first. If
 * flagging fails, the caller's own error handling still stands.
 */
export async function reportCarrierFailure(params: {
  shipment: Shipment;
  operation: CarrierOperation;
  error: unknown;
  /** Extra context worth showing the operator, e.g. the date that was rejected. */
  context?: Record<string, unknown>;
}): Promise<CarrierErrorExplanation> {
  const message =
    params.error instanceof Error ? params.error.message : String(params.error ?? "");

  const explanation = explainCarrierError({
    message,
    carrierCode: params.shipment.carrierCode || params.shipment.carrierName,
  });

  try {
    const operationLabel = OPERATION_LABELS[params.operation];

    await upsertOpenAttentionFlag({
      shipmentId: params.shipment.id,
      issueType: carrierFailureIssueType(params.operation),
      severity: severityFor(explanation, params.operation),
      // Details is what an operator reads first, so it leads with the cause and the fix
      // rather than the carrier's raw string.
      details: `${explanation.title}. ${explanation.action}`,
      metadata: {
        operation: params.operation,
        carrierCode: params.shipment.carrierCode,
        code: explanation.code,
        category: explanation.category,
        retry: explanation.retry,
        retryLabel: carrierRetryLabel(explanation.retry),
        recognised: explanation.recognised,
        cause: explanation.cause,
        action: explanation.action,
        carrierMessage: explanation.raw,
        ...params.context,
      },
    });

    // Only tell someone when acting is possible and useful. A transient carrier 5xx that the
    // scheduler will retry on its own does not need a human pulled in.
    if (explanation.retry !== CarrierRetryAdvice.RETRY) {
      const assignments = await getActiveAssignmentsForShipment(params.shipment.id);
      const assigneeIds = assignments.map((assignment) => assignment.assignedToUserId).filter(Boolean);

      if (assigneeIds.length > 0) {
        await notifyUsers(assigneeIds as string[], {
          title: `${operationLabel} failed — ${params.shipment.trackingNumber}`,
          body: `${explanation.title}. ${explanation.action}`,
          type: "warning",
          entityType: "shipment",
          entityId: params.shipment.id,
          actionUrl: `/operations?shipmentId=${params.shipment.id}`,
        });
      }
    }
  } catch (reportingError) {
    logError("Failed to report carrier failure", {
      shipmentId: params.shipment.id,
      operation: params.operation,
      error: reportingError instanceof Error ? reportingError.message : String(reportingError),
    });
  }

  return explanation;
}
