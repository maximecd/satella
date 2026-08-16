# Packaged desktop runtime boundary

Status: accepted

The packaged Optimus desktop owns one private Electron-launched engine and one production Vault. The engine is embedded in the application resources and runs through the packaged Electron executable in Node mode; it is not a separately distributed production service.

Production Vault data lives under Electron's native `userData` path for the stable `Optimus` identity, in its `data/` subtree. The desktop supplies that canonical location to the engine, chooses an available loopback port, and forwards the resulting engine URL to the renderer at runtime. Development commands remain worktree-local and use `.optimus`.

This boundary is deliberate: changing it would affect application identity, native SQLCipher packaging, process lifecycle, storage ownership, and the release artifact. Apple Developer signing and notarization remain future additions to the existing packaging boundary.
