const variableKey = /^[A-Za-z][A-Za-z0-9_]*$/;

export function callPromptVariables(input: {
  agentVariables: Record<string, unknown> | null;
  agentName: string | null;
  businessName: string | null;
  customerName: string | null;
}) {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.agentVariables ?? {})) {
    if (typeof value === "string" && variableKey.test(key)) variables[key] = value;
  }
  variables.agent_name = input.agentName?.trim() ?? "";
  variables.business_name = input.businessName?.trim() ?? "";
  variables.customer_name = input.customerName?.trim() ?? "";
  return variables;
}
