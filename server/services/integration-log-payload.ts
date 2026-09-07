function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Roughly 4KB of JSON is enough to hold any carrier error body we have seen. */
const MAX_LOGGED_PAYLOAD_CHARS = 4000;

/**
 * What to store as the response payload on an integration log.
 *
 * Production used to discard every response body, successes and failures alike. The intent
 * was volume control, but the effect was that a production failure recorded `{}` and nobody
 * could see why anything broke — a DHL pickup was retried fourteen times over three days
 * against an error message the carrier had sent on the very first attempt.
 *
 * So the rule is asymmetric on purpose: successes stay out of the log, because they are the
 * volume and they tell us nothing. Failures keep the carrier's own words, masked and capped.
 *
 * `mask` is passed in rather than imported because each adapter masks its own credential
 * shapes.
 */
export function buildIntegrationLogResponse(options: {
  responseBody: unknown;
  success: boolean;
  mask: (data: any) => any;
}): unknown {
  const { responseBody, success, mask } = options;

  if (success) {
    return isProduction() ? { logged: false, reason: "production" } : mask(responseBody);
  }

  if (responseBody === null || responseBody === undefined) {
    return { logged: false, reason: "carrier returned no body" };
  }

  let masked: unknown;
  try {
    masked = mask(responseBody);
  } catch {
    // Masking is best-effort. A body we cannot walk is still worth keeping as text — the
    // whole point of this function is that a failure never gets recorded as nothing.
    masked = { unmaskable: String(responseBody).slice(0, MAX_LOGGED_PAYLOAD_CHARS) };
  }

  return truncateLoggedPayload(masked);
}

/**
 * Cap a payload so one enormous carrier response cannot bloat the logs table.
 *
 * Truncation is recorded in the payload itself rather than silently trimming, so nobody later
 * reads a cut-off message as the whole of what the carrier said.
 */
export function truncateLoggedPayload(payload: unknown): unknown {
  let serialised: string;
  try {
    serialised = JSON.stringify(payload) ?? "";
  } catch {
    serialised = String(payload);
  }

  if (serialised.length <= MAX_LOGGED_PAYLOAD_CHARS) {
    return payload;
  }

  return {
    truncated: true,
    originalLength: serialised.length,
    payload: serialised.slice(0, MAX_LOGGED_PAYLOAD_CHARS),
  };
}
