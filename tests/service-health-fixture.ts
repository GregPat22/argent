import { buildIdentity } from "../src/desktop/build-identity.js";
import { HEALTH_TIMEOUT_MS } from "../src/desktop/service-client.js";

/**
 * Answers the bridge's build probe as a live service of this build would, so a
 * mocked `fetch` records only the routes under test. Null for any other URL.
 */
export function sameBuildHealth(
  input: unknown,
  instanceId: string,
): Response | null {
  return String(input).endsWith("/health")
    ? Response.json({ instanceId, build: buildIdentity() })
    : null;
}

/** Request deadlines under test, without the build probe's own deadline. */
export function requestTimeouts(timeouts: number[]): number[] {
  return timeouts.filter((milliseconds) => milliseconds !== HEALTH_TIMEOUT_MS);
}
