# macOS distribution

Idea Foundry supports macOS 12 Monterey or newer and produces separate packages for Apple silicon (`arm64`) and Intel (`x64`) Macs. Each architecture has a DMG for normal installation and a ZIP for portable/manual deployment. The release workflow builds and smoke-tests each package natively on its matching CPU architecture.

## Build on macOS

Requires Node.js 22 and macOS:

```bash
npm ci
npm run desktop:typecheck
npm run desktop:package:mac
```

That command builds both architectures. Build one architecture with:

```bash
npm run desktop:package:mac -- --arch=arm64
npm run desktop:package:mac -- --arch=x64
```

Artifacts are copied into `release/`:

- `Idea-Foundry-<version>-macOS-arm64.dmg`
- `Idea-Foundry-<version>-macOS-arm64.zip`
- `Idea-Foundry-<version>-macOS-x64.dmg`
- `Idea-Foundry-<version>-macOS-x64.zip`

DMG creation depends on Apple tooling and must run on macOS. From Windows or Linux, dispatch the **Desktop release** GitHub Actions workflow instead. A tag such as `v0.4.0` must match `package.json`; tag builds publish the Windows and macOS packages to the corresponding GitHub Release. A manual workflow run builds downloadable Actions artifacts without publishing a release.

## Signing and notarization

The public workflow explicitly sets `CSC_IDENTITY_AUTO_DISCOVERY=false`; the package configuration skips signing and disables hardened runtime for this unsigned build. Current artifacts are therefore unsigned and not notarized. macOS Gatekeeper will warn users and may require them to right-click the app, choose **Open**, and confirm, or approve it under **System Settings → Privacy & Security**.

Broad public distribution should use an Apple Developer Program account, a **Developer ID Application** certificate, hardened-runtime signing, and Apple notarization. Configure certificate and notarization credentials as encrypted GitHub Actions secrets; never commit a certificate, password, API key, or App Store Connect key. After credentials are added, remove the workflow's unsigned override and verify every release with:

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Idea Foundry.app"
spctl --assess --type execute --verbose=4 "/Applications/Idea Foundry.app"
```

Signing cannot be completed by this repository alone: Apple-issued credentials and the associated paid developer membership are external requirements.
