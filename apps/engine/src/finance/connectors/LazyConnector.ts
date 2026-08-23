import {
  ConnectorAuthenticationError,
  type AnyConnector,
  type AuthenticatedConnector,
  type ConnectorCapability,
} from "@satella-app/connector-core";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export interface LazyConnectorDefinition {
  readonly capability: ConnectorCapability;
  readonly load: () => Promise<AnyConnector>;
}

const loadFailure = (capability: ConnectorCapability, cause: unknown) =>
  new ConnectorAuthenticationError({
    category: "network",
    message:
      cause instanceof Error
        ? `${capability.name} could not be loaded: ${cause.message}`
        : `${capability.name} could not be loaded`,
  });

/** Keeps catalog metadata resident while deferring the executable adapter. */
export const makeLazyConnector = ({ capability, load }: LazyConnectorDefinition): AnyConnector => {
  let loaded: Promise<AnyConnector> | undefined;
  const loadOnce = () => {
    if (loaded !== undefined) return loaded;
    loaded = load().catch((cause: unknown) => {
      loaded = undefined;
      throw cause;
    });
    return loaded;
  };

  return {
    ...capability,
    credentialsSchema: Schema.Unknown,
    authenticate: (credentials) =>
      Effect.tryPromise({
        try: loadOnce,
        catch: (cause) => loadFailure(capability, cause),
      }).pipe(
        Effect.flatMap(
          (connector) =>
            // SAFETY: the proxy deliberately erases the concrete connector's environment
            // and credential types while forwarding its authentication effect unchanged.
            connector.authenticate(credentials) as Effect.Effect<
              AuthenticatedConnector<any>,
              ConnectorAuthenticationError,
              any
            >,
        ),
      ),
  };
};
