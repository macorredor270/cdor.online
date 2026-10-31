import type { GatewayEnvironment } from "../../config/schema";
import { logProviderFailover } from "../../observability/provider-log";
import { buildDeployments, type BuildOptions } from "./build";
import { GatewayProvider } from "./gateway";

export { MAC_MODEL, GatewayProvider } from "./gateway";
export { buildDeployments, type Deployment } from "./build";

/**
 * Crea la pasarela, o `null` si no hay ningún proveedor configurado.
 */
export function createGateway(
  environment: GatewayEnvironment,
  options: BuildOptions = {}
): GatewayProvider | null {
  const deployments = buildDeployments(environment, options);
  if (deployments.length === 0) return null;
  return new GatewayProvider(deployments, {
    strategy: environment.AI_ROUTING,
    onFailover: logProviderFailover
  });
}
