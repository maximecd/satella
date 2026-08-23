# Read-only EVM address connector with wagmi and viem

Checked 2026-08-23 against the current official wagmi, viem, Ethereum, and ENS documentation/source.

## Bottom line

Yes: the UI can accept a `0x` address and query it without connecting a wallet, requesting a signature, or handling a private key. Configure wagmi with a finite set of chains and read-only HTTP transports, then pass the submitted address explicitly to `useBalance`, `useReadContract`, or `useReadContracts`.

That gives us a small “address to supported balances” view. It does **not** give us a complete portfolio. Plain JSON-RPC has no standard `getAllAssets(address)` operation, and wagmi does not add one. Complete token, NFT, or DeFi discovery needs an indexer, a maintained token registry plus event scanning, or a portfolio API.

## Wagmi versus viem

- **Viem** is the low-level, stateless TypeScript interface for Ethereum. Its `createPublicClient` uses a chain and transport; public actions map to JSON-RPC methods. `getBalance` reads native balance, and `readContract` performs an ABI-encoded `eth_call` for a known contract. See [Viem getting started](https://viem.sh/docs/getting-started), [Public Actions](https://viem.sh/docs/actions/public/introduction), [Public Client](https://viem.sh/docs/clients/public), and [readContract](https://viem.sh/docs/contract/readContract).
- **Wagmi** is the React layer: `createConfig` ties chains to transports, `WagmiProvider` supplies context, and hooks integrate Viem with TanStack Query for caching, refetching, and request state. Wagmi's own docs say it uses Viem internally and supports multi-chain configuration. See [Why Wagmi](https://wagmi.sh/react/why), [Getting Started](https://wagmi.sh/react/getting-started), and [`createConfig`](https://wagmi.sh/react/api/createConfig).
- A manual-address read-only screen does not need Wagmi wallet `connectors`. The `connectors` option is optional in `createConfig`; connectors are useful later if we want “connect wallet” or signing. `usePublicClient` exposes the underlying Viem client when a hook is not enough: [createConfig](https://wagmi.sh/react/api/createConfig), [usePublicClient](https://wagmi.sh/react/api/hooks/usePublicClient).

## What `http()` does with no URL

`http()` is an HTTP JSON-RPC transport. If no URL is passed, Wagmi/Viem uses the first URL in the configured chain's `chain.rpcUrls.default.http` array. The docs explicitly warn that this is a public RPC fallback and recommend an authenticated URL in production to avoid rate limiting: [Wagmi `http`](https://wagmi.sh/react/api/transports/http), [Viem getting started](https://viem.sh/docs/getting-started).

The current Viem chain definitions are package data, not a provider SLA. At this check they contain, for example:

| Chain                | Current default in `viem/chains` | Source                                                                                                     |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Ethereum (1)         | `https://ethereum.reth.rs/rpc`   | [mainnet definition](https://raw.githubusercontent.com/wevm/viem/main/src/chains/definitions/mainnet.ts)   |
| Base (8453)          | `https://mainnet.base.org`       | [Base definition](https://raw.githubusercontent.com/wevm/viem/main/src/chains/definitions/base.ts)         |
| Arbitrum One (42161) | `https://arb1.arbitrum.io/rpc`   | [Arbitrum definition](https://raw.githubusercontent.com/wevm/viem/main/src/chains/definitions/arbitrum.ts) |
| OP Mainnet (10)      | `https://mainnet.optimism.io`    | [Optimism definition](https://raw.githubusercontent.com/wevm/viem/main/src/chains/definitions/optimism.ts) |

These URLs can change when the Viem package changes, and a public endpoint can rate-limit, throttle, reject browser traffic, or be unavailable. For resilience, Wagmi/Viem support `fallback([http(primary), http(secondary)])`; this improves reachability but does not make responses complete or private: [Wagmi `fallback`](https://wagmi.sh/react/api/transports/fallback).

For a demo, `http()` is enough. For a privacy-first product, make the RPC URL explicit and user-controlled (or point it at a local node), and show which endpoint is being used. This avoids silently moving a user's address queries to a provider chosen by a package update.

## What one address can produce

### Native balance

`useBalance({ address, chainId })` is explicitly documented as fetching the native currency balance for the supplied address; `chainId` selects the configured chain. It does not require a connected account: [useBalance](https://wagmi.sh/react/api/hooks/useBalance).

```tsx
const { data, error, isPending } = useBalance({
  address,
  chainId: mainnet.id,
});
// data.value is bigint in the chain's base unit; data.decimals/symbol are display metadata.
```

Under the hood this is the standard `eth_getBalance` state query. Ethereum's JSON-RPC documentation defines that method as taking an address and block tag and returning the account balance in wei: [Ethereum JSON-RPC API](https://ethereum.org/developers/docs/apis/json-rpc/).

### Known ERC-20 balances

For each **known** token contract, `useReadContract` can call `balanceOf(address)` and can also read `symbol()` and `decimals()`. `useReadContracts` can batch a set of calls; set each contract's `chainId` so the same address is never accidentally read on the wrong network: [useReadContract](https://wagmi.sh/react/api/hooks/useReadContract), [useReadContracts](https://wagmi.sh/react/api/hooks/useReadContracts), [ERC-20](https://eips.ethereum.org/EIPS/eip-20).

```tsx
const { data } = useReadContracts({
  contracts: tokenRegistry[chainId].flatMap((token) => [
    { address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [address], chainId },
    { address: token.address, abi: erc20Abi, functionName: "symbol", chainId },
    { address: token.address, abi: erc20Abi, functionName: "decimals", chainId },
  ]),
});
```

ERC-20's `balanceOf` is the required read method. `name`, `symbol`, and `decimals` are optional in EIP-20, so metadata reads may revert or be absent and must not be treated as balance errors. Keep the identity as `(chainId, token contract address)`, never only by symbol.

### Multiple chains

The same EVM address can be queried on every chain included in the config. Configure one transport per supported chain and issue one native/token query set per chain. Wagmi's configured chain list is finite (`useChains` returns the configured chains); “all EVM chains” is not implied: [createConfig](https://wagmi.sh/react/api/createConfig), [useChains](https://wagmi.sh/react/api/hooks/useChains), [Viem chains](https://viem.sh/docs/chains/introduction).

### ENS enrichment

`useEnsName({ address, chainId })` can resolve the address's primary ENS name without a wallet connection. `useEnsAddress` supports the inverse flow if the UI later accepts an ENS name; normalize that input first, as the Wagmi docs recommend: [useEnsName](https://wagmi.sh/react/api/hooks/useEnsName), [useEnsAddress](https://wagmi.sh/react/api/hooks/useEnsAddress), [ENS reverse resolution](https://docs.ens.domains/ensv2/reverse-resolution/), [ENS Universal Resolver](https://docs.ens.domains/resolvers/universal/).

ENS should be optional display enrichment, with the address as the fallback. ENS reverse records are chain/coin-type aware, and Viem's Public Client enables CCIP Read by default; a resolver can therefore cause additional off-chain requests. If that is outside the privacy boundary, disable CCIP Read on the Viem client rather than assuming ENS is RPC-only: [Viem Public Client (`ccipRead`)](https://viem.sh/docs/clients/public).

## What it cannot discover

The standard Ethereum JSON-RPC state methods expose native account balance, storage, code, and `eth_call`; they do not expose an account's list of token contracts. ERC-20 `balanceOf` also requires the caller to already know the token contract address. Therefore default Wagmi/Viem RPC reads cannot reliably answer “show every token this address owns.” Sources: [Ethereum JSON-RPC state methods](https://ethereum.org/developers/docs/apis/json-rpc/), [EIP-20](https://eips.ethereum.org/EIPS/eip-20).

An application can scan `eth_getLogs` for `Transfer` events and maintain its own token list, but that is an indexer problem: it must handle historical range limits, reorgs, non-standard contracts, rebasing or other balance changes, metadata, spam, and zero-balance cleanup. It is not a one-hook capability. NFTs and DeFi positions are even more protocol-specific and are not represented by a generic ERC-20 balance call.

## Privacy and reliability limits

- The address is public on-chain, but the query association is not. A browser using `http()` sends the address (as an `eth_getBalance` parameter or encoded contract-call argument), the browser's network identity, and timing to the selected RPC operator. “No API key” means no credential; it does not mean no provider visibility.
- Direct browser RPC keeps the address out of a Satella backend, which is good for local privacy, but the default public RPC still sees the requests. A local node or user-selected RPC gives the user more control. Do not add analytics, error reporting, or server logs containing the raw address.
- Public endpoints can rate-limit and fail. Viem's HTTP transport defaults to three retries and a 10-second timeout; retries help transient errors but do not establish data completeness: [Wagmi `http` parameters](https://wagmi.sh/react/api/transports/http).
- `useReadContracts` defaults `allowFailure` to `true`, so individual failed calls can appear in the results instead of failing the whole query. Preserve per-call errors and show “unavailable,” never silently convert a failed read to zero: [useReadContracts](https://wagmi.sh/react/api/hooks/useReadContracts).
- Reads default to the latest state. For a coherent refresh, capture a block number and use it for all calls on one chain; for reduced reorg sensitivity, use `safe`/`finalized` where the chain supports it. Different chains necessarily have different block heights.
- Wagmi/TanStack Query caching is convenient, but a cached value is not proof of a current balance. Show the last-read block/time and refresh status if this is used as a financial record.

## Smallest credible UI

The easy connector can therefore be:

1. A text field accepting a checksummed or lowercase EVM address, with local validation.
2. A fixed initial chain list (for example Ethereum, Base, Arbitrum One, and OP Mainnet).
3. Native balances per chain using `useBalance`.
4. A versioned, chain-specific list of explicit ERC-20 contracts, queried with `useReadContracts`.
5. Optional ENS primary-name enrichment.
6. Per-chain block number, RPC endpoint label, loading/error state, and an explicit “some assets may be undiscovered” explanation.

That is genuinely “paste an address and the rest cooks,” while staying read-only and keyless. It should be described as **supported assets**, not **complete portfolio**. If the requirement is complete holdings across arbitrary tokens, NFTs, and DeFi, wagmi plus default public RPC is the wrong layer; add an indexer/portfolio provider or run one locally.
