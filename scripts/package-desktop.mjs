import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Arch, Platform, build } from "electron-builder";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(projectDirectory, "release");
const temporaryDirectory = path.join(os.tmpdir(), `sift-electron-build-${process.pid}-${Date.now()}`);

function readOption(name) {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  let value;
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === exact) {
      value = process.argv[index + 1];
      index += 1;
    } else if (argument.startsWith(prefix)) {
      value = argument.slice(prefix.length);
    }
  }
  return value;
}

const defaultPlatform = process.platform === "darwin" ? "mac" : "windows";
const requestedPlatform = (readOption("platform") ?? defaultPlatform).toLowerCase();
const requestedArch = (readOption("arch") ?? (requestedPlatform === "mac" ? "all" : "x64")).toLowerCase();

if (!new Set(["windows", "mac"]).has(requestedPlatform)) {
  throw new Error("--platform must be windows or mac.");
}
if (!new Set(["x64", "arm64", "all"]).has(requestedArch)) {
  throw new Error("--arch must be x64, arm64, or all.");
}
if (requestedPlatform === "windows" && process.platform !== "win32") {
  throw new Error("Windows NSIS and portable packages must be built on Windows.");
}
if (requestedPlatform === "mac" && process.platform !== "darwin") {
  throw new Error("macOS DMG and ZIP packages must be built on macOS. Use the desktop-release GitHub Actions workflow from Windows or Linux.");
}
if (requestedPlatform === "windows" && requestedArch !== "x64" && requestedArch !== "all") {
  throw new Error("The Windows release currently supports x64 only.");
}

const archNames = requestedPlatform === "mac" && requestedArch === "all"
  ? ["x64", "arm64"]
  : [requestedArch === "all" ? "x64" : requestedArch];
const archValues = archNames.map((name) => name === "arm64" ? Arch.arm64 : Arch.x64);
const targets = requestedPlatform === "mac"
  ? Platform.MAC.createTarget(["dmg", "zip"], ...archValues)
  : Platform.WINDOWS.createTarget(["nsis", "portable"], Arch.x64);

function isDeliverable(name) {
  if (requestedPlatform === "mac") {
    return /^SIFT-.+-macOS-(?:x64|arm64)\.(?:dmg|zip)(?:\.blockmap)?$/i.test(name);
  }
  return /^SIFT-(?:Setup|Portable)-.+\.(?:exe|blockmap)$/i.test(name);
}

function assertDeliverables(generated) {
  if (requestedPlatform === "windows") {
    if (!generated.some((name) => /Setup.+\.exe$/i.test(name))) throw new Error("The Windows installer was not generated.");
    if (!generated.some((name) => /Portable.+\.exe$/i.test(name))) throw new Error("The portable executable was not generated.");
    return;
  }
  for (const arch of archNames) {
    if (!generated.some((name) => new RegExp(`macOS-${arch}\\.dmg$`, "i").test(name))) {
      throw new Error(`The macOS ${arch} DMG was not generated.`);
    }
    if (!generated.some((name) => new RegExp(`macOS-${arch}\\.zip$`, "i").test(name))) {
      throw new Error(`The macOS ${arch} ZIP was not generated.`);
    }
  }
}

await fs.mkdir(releaseDirectory, { recursive: true });

try {
  await build({
    projectDir: projectDirectory,
    targets,
    publish: "never",
    config: { directories: { output: temporaryDirectory } },
  });

  const generated = (await fs.readdir(temporaryDirectory)).filter(isDeliverable);
  assertDeliverables(generated);

  for (const name of generated) {
    await fs.copyFile(path.join(temporaryDirectory, name), path.join(releaseDirectory, name));
  }

  process.stdout.write(`${generated.map((name) => path.join(releaseDirectory, name)).join("\n")}\n`);
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
