# Packaged desktop runtime boundary

Status: accepted

The packaged Satella desktop owns one private Electron-launched engine and one production Vault. The engine is embedded in the application resources and runs through the packaged Electron executable in Node mode; it is not a separately distributed production service.

Production Vault data lives under Electron's native `userData` path for the stable `Satella` identity, in its `data/` subtree. The desktop supplies that canonical location to the engine, chooses an available loopback port, and forwards the resulting engine URL to the renderer at runtime. Development commands remain worktree-local and use `.satella`.

Satella starts with a fresh application identity and Vault. It does not discover or migrate data stored under the former Optimus identity. The source remains in the existing GitHub repository until the project is made open source and moved separately.

The desktop also creates a random engine token for each launch and supplies it only to its managed engine and renderer. The engine requires that token for Vault and finance requests. The desktop window permits Satella navigation only; external navigation and popup creation cannot inherit access to the local engine.

This boundary is deliberate: changing it would affect application identity, native SQLCipher packaging, process lifecycle, storage ownership, and the release artifact. Apple Developer signing and notarization remain future additions to the existing packaging boundary.
