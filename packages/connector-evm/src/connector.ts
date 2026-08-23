import {
  Connector,
  ConnectorAuthenticationError,
  ConnectorFetchAccountsError,
  validateConnectorOutput,
} from "@satella-app/connector-core";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  http,
  type Address,
  type Chain,
  type PublicClient,
} from "viem";
import { arbitrum, base, mainnet, optimism } from "viem/chains";

import iconSvg from "./icon.svg";
import instructions from "./instructions.md";

const Credentials = Schema.Record(Schema.String, Schema.String);
type Credentials = typeof Credentials.Type;

interface SupportedChain {
  readonly chain: Chain;
  readonly name: string;
  readonly rpcKey: string;
}

const supportedChains: ReadonlyArray<SupportedChain> = [
  { chain: mainnet, name: "Ethereum", rpcKey: "ethereum" },
  { chain: base, name: "Base", rpcKey: "base" },
  { chain: arbitrum, name: "Arbitrum One", rpcKey: "arbitrum" },
  { chain: optimism, name: "OP Mainnet", rpcKey: "optimism" },
];

type EvmClient = Pick<PublicClient, "getBalance" | "readContract">;
export interface EvmConnectorOptions {
  readonly clientFactory?: (chain: Chain, rpcUrl?: string) => EvmClient;
}

const authenticationError = (message: string) =>
  new ConnectorAuthenticationError({ category: "invalid_credentials", message });

const fetchError = (cause: unknown) =>
  new ConnectorFetchAccountsError({
    category: "network",
    message: cause instanceof Error ? cause.message : "The EVM RPC request failed",
  });

const trackedContracts = (credentials: Credentials, chainId: number): ReadonlyArray<Address> =>
  Object.keys(credentials)
    .filter((key) => key.startsWith(`token:${chainId}:`))
    .map((key) => getAddress(key.slice(`token:${chainId}:`.length)));

const nativeAsset = {
  externalId: "evm:native:eth",
  assetCategory: "crypto" as const,
  name: "Ethereum",
  symbol: "ETH",
  identifiers: [{ type: "coingecko_coin_id", value: "ethereum" }],
};

const tokenPosition = async (
  client: EvmClient,
  owner: Address,
  contract: Address,
  chainId: number,
) => {
  const [balance, decimals, symbol, name] = await Promise.all([
    client.readContract({
      address: contract,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    }),
    client.readContract({ address: contract, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: contract, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: contract, abi: erc20Abi, functionName: "name" }),
  ]);
  return {
    asset: {
      externalId: `evm:${chainId}:erc20:${contract.toLowerCase()}`,
      assetCategory: "crypto" as const,
      name,
      symbol,
      identifiers: [
        { type: "evm_contract_address", value: `eip155:${chainId}:${contract.toLowerCase()}` },
      ],
    },
    quantity: formatUnits(balance, decimals),
  };
};

export const makeEvmConnector = (options: EvmConnectorOptions = {}): Connector<Credentials> => {
  const clientFactory =
    options.clientFactory ??
    ((chain: Chain, rpcUrl?: string) =>
      createPublicClient({ chain, transport: rpcUrl === undefined ? http() : http(rpcUrl) }));
  return {
    id: "evm",
    name: "EVM wallet",
    icon: `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`,
    instructions,
    assetCategories: ["crypto"],
    credentialFields: [
      {
        key: "address",
        label: "Wallet address",
        kind: "text",
        required: true,
        helpText: "A public 0x wallet address. Satella never asks for a private key.",
      },
    ],
    credentialsSchema: Credentials,
    authenticate: (input) =>
      Effect.gen(function* () {
        const credentials = yield* Schema.decodeUnknownEffect(Credentials)(input).pipe(
          Effect.mapError(() => authenticationError("EVM wallet settings are invalid")),
        );
        const address = yield* Effect.try({
          try: () => getAddress(credentials.address ?? ""),
          catch: () => authenticationError("Enter a valid EVM wallet address"),
        });
        return {
          fetchAccounts: () =>
            Effect.tryPromise({
              try: async () => {
                const accounts = await Promise.all(
                  supportedChains.map(async ({ chain, name, rpcKey }) => {
                    const client = clientFactory(chain, credentials[`rpc:${rpcKey}`]);
                    const [nativeBalance, ...tokens] = await Promise.all([
                      client.getBalance({ address }),
                      ...trackedContracts(credentials, chain.id).map((contract) =>
                        tokenPosition(client, address, contract, chain.id),
                      ),
                    ]);
                    return {
                      externalId: `eip155:${chain.id}`,
                      name,
                      baseCurrencyIso: "USD",
                      positions: [
                        { asset: nativeAsset, quantity: formatEther(nativeBalance) },
                        ...tokens,
                      ],
                    };
                  }),
                );
                return accounts;
              },
              catch: fetchError,
            }).pipe(Effect.flatMap(validateConnectorOutput)),
        };
      }),
  };
};

export const EvmConnector = makeEvmConnector();
