# Releasing Optimus

The first release target is a private, pre-production macOS Apple Silicon ZIP. Releases are manual and must be dispatched from `main` in GitHub Actions with a SemVer version such as `1.0.0` or `1.0.0-rc.1` (without `v`).

The workflow reruns `check`, `test`, and `build`, stages the web application, desktop process, embedded engine, Connector runtime, and SQLCipher binding, then creates `Optimus-<version>-macOS-arm64.zip`. Structural validation and a process-level smoke test run before the workflow creates the immutable `v<version>` tag and GitHub prerelease.

The artifact is ad-hoc signed, not signed with an Apple Developer identity, and not notarized. For this maintainer-only pre-production artifact, macOS may quarantine the application after extraction. If Gatekeeper blocks launch, remove the temporary quarantine attribute from the extracted application:

```sh
xattr -dr com.apple.quarantine /path/to/Optimus.app
```

This workaround is not a public-distribution or notarization substitute.
