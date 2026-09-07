export type DecisionOrigin = "caller" | "server-rule" | "zenmoney";

export function decision(field: string, origin: DecisionOrigin, basis: string) {
  return { field, origin, basis };
}

export function provenance(decisions: ReturnType<typeof decision>[]) {
  return {
    schemaVersion: 1 as const,
    receiptContentVerifiedByServer: false,
    decisions,
    boundary: "Caller inputs are not proof of receipt evidence or a saved preference. The host must explain its own choices separately; server rules validate the structured contract, not the original receipt."
  };
}
