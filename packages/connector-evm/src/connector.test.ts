import * as Effect from "effect/Effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { makeEvmConnector } from "./connector.js";

const wallet = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const token = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

describe("EVM connector", () => {
  it("reads native ETH on every supported chain and explicitly tracked ERC-20 balances", async () => {
    const requestedChainIds: number[] = [];
    const connector = makeEvmConnector({
      clientFactory: (chain) => {
        requestedChainIds.push(chain.id);
        // SAFETY: This test double implements the two PublicClient methods exercised by the connector.
        return {
          getBalance: vi.fn().mockResolvedValue(1_500_000_000_000_000_000n),
          readContract: vi.fn(async ({ functionName }: { readonly functionName: string }) => {
            if (functionName === "balanceOf") return 125_000_000_000_000_000_000n;
            if (functionName === "decimals") return 18;
            if (functionName === "symbol") return "DAI";
            return "Dai Stablecoin";
          }),
        } as never;
      },
    });
    const authenticated = await Effect.runPromise(
      connector.authenticate({ address: wallet, [`token:1:${token.toLowerCase()}`]: "tracked" }),
    );
    const accounts = await Effect.runPromise(authenticated.fetchAccounts());

    expect(requestedChainIds).toEqual([1, 8453, 42161, 10]);
    expect(accounts).toHaveLength(4);
    expect(accounts.every(({ positions }) => positions[0]?.quantity === "1.5")).toBe(true);
    expect(accounts[0]?.positions[1]).toMatchObject({
      quantity: "125",
      asset: {
        name: "Dai Stablecoin",
        symbol: "DAI",
        identifiers: [
          {
            type: "evm_contract_address",
            value: `eip155:1:${token.toLowerCase()}`,
          },
        ],
      },
    });
    expect(accounts.slice(1).every(({ positions }) => positions.length === 1)).toBe(true);
  });

  it("rejects an invalid wallet address before making an RPC request", async () => {
    const connector = makeEvmConnector({
      // SAFETY: Authentication rejects the address before either client method can be called.
      clientFactory: () => ({ getBalance: vi.fn(), readContract: vi.fn() }) as never,
    });
    await expect(
      Effect.runPromise(connector.authenticate({ address: "not-an-address" })),
    ).rejects.toMatchObject({ category: "invalid_credentials" });
  });
});
