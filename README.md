# SIFT

SIFT is a local-first venture studio for Xahau and Evernode. It helps you generate business ideas, compare them, research public context, run a deterministic thesis screen, and prepare the strongest opportunity for building.

**[Download the latest SIFT release](https://github.com/NickFields0101/sift/releases/latest)**

## What SIFT does

- Runs one **Create to Build** workflow from a blank page to a guarded build handoff.
- Generates and compares ideas with an optional connected AI model.
- Supports an optional private preference profile or Big Five assessment for idea ranking.
- Separates early idea quality from real-world validation: a new idea correctly starts with zero direct customer evidence.
- Uses locked local rules for scoring, evidence grades, gates, and decisions.
- Prepares route-aware build briefs for Xahau, Evernode, both, or a conventional prototype.

AI proposes. SIFT validates and calculates. The user chooses whether to build.

## Install

### Windows

- Download `SIFT-Setup-<version>-x64.exe` for the installer, or `SIFT.exe` for the portable edition.
- The app is currently unsigned, so Windows may show an Unknown publisher warning. Verify the file with `SHA256SUMS.txt` on the release page.

### macOS

- Download the `arm64` package for Apple silicon or `x64` for Intel Macs running macOS 12 or newer.
- DMG and ZIP packages are provided. Current builds are unsigned and not notarized; see [macOS distribution](docs/macos-distribution.md).

## AI and privacy

SIFT works without an account or AI connection. Optional model support includes Ollama, LM Studio, OpenRouter, and compatible endpoints.

- Projects remain on the user's computer.
- API keys are protected by the operating system and are not stored in project files.
- Raw personality-test answers are not saved with projects or sent to models.
- Cloud providers receive only the context shown for the requested operation.
- SIFT never accepts wallet seeds, signs transactions, spends funds, leases infrastructure, or deploys automatically.

## Build workspace

SIFT can detect separately installed [Xahau MCP](https://github.com/Hugegreencandle/xahau-mcp), [Evernode MCP](https://github.com/Hugegreencandle/evernode-mcp), [XAHC](https://github.com/Hugegreencandle/xahc), and [XAHC Prover](https://github.com/Hugegreencandle/xahc-prover). Tool access is narrow and guarded; generated artifacts remain previews until the user acts.

## Development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm test
npm run dev
```

Desktop development:

```bash
npm run desktop:typecheck
npm run desktop:build
npm run desktop:run
```

Python is required only for development and release builds. Published desktop packages include the intelligence worker.

## Documentation

- [Intelligence engine](docs/intelligence-engine.md)
- [macOS distribution](docs/macos-distribution.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Latest release notes](docs/release-notes-v0.11.1.md)

## License

[MIT](LICENSE). SIFT is an independent open-source project and is not an official Xahau or Evernode product.
