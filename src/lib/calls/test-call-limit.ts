export const testCallHourlyLimit = 5;

export const testCallWindowMs = 60 * 60 * 1000;

export function testCallLimitMessage(recentCount: number) {
  if (recentCount >= testCallHourlyLimit) {
    return "You can place up to 5 test calls per hour. Try again later.";
  }
  return null;
}
