import type {
  AnyConnector,
  ConnectorAssetCategory,
  ConnectorCredentialField,
} from "./connector.js";

export interface ConnectorCapability {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly instructions?: string;
  readonly assetCategories: ReadonlyArray<ConnectorAssetCategory>;
  readonly credentialFields: ReadonlyArray<ConnectorCredentialField>;
}

export interface ConnectorRegistry extends Iterable<readonly [string, AnyConnector]> {
  readonly size: number;
  readonly get: (id: string) => AnyConnector | undefined;
  readonly has: (id: string) => boolean;
  readonly values: () => IterableIterator<AnyConnector>;
}

const validateConnector = (connector: AnyConnector) => {
  if (connector.id.trim().length === 0) {
    throw new Error("Connector ID must not be empty");
  }
  if (connector.name.trim().length === 0) {
    throw new Error(`Connector ${connector.id} must have a non-empty name`);
  }
  if (connector.assetCategories.length === 0) {
    throw new Error(`Connector ${connector.id} must declare at least one supported asset category`);
  }
  return connector;
};

export const connectorCapabilities = (
  registry: ConnectorRegistry,
): ReadonlyArray<ConnectorCapability> =>
  Object.freeze(
    [...registry.values()].map(
      ({ id, name, icon, instructions, assetCategories, credentialFields }) =>
        Object.freeze({
          id,
          name,
          ...(icon === undefined ? {} : { icon }),
          ...(instructions === undefined ? {} : { instructions }),
          assetCategories: Object.freeze([...assetCategories]),
          credentialFields: Object.freeze([...credentialFields]),
        }),
    ),
  );

export const connectorRegistryFrom = (
  connectors: ReadonlyArray<AnyConnector>,
): ConnectorRegistry => {
  const entries: Array<readonly [string, AnyConnector]> = [];
  const byId = new Map<string, AnyConnector>();
  for (const candidate of connectors) {
    const connector = validateConnector(candidate);
    if (byId.has(connector.id)) {
      throw new Error(`Duplicate connector ID: ${connector.id}`);
    }
    byId.set(connector.id, connector);
    entries.push([connector.id, connector]);
  }

  return Object.freeze({
    size: entries.length,
    get: (id: string) => byId.get(id),
    has: (id: string) => byId.has(id),
    values: () => entries.map(([, connector]) => connector).values(),
    [Symbol.iterator]: () => entries.values(),
  });
};
