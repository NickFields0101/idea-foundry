import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Arch, Platform, build } from "electron-builder";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(projectDirectory, "release");
const temporaryDirectory = path.join(os.tmpdir(), `idea-foundry-electron-build-${process.pid}-${Date.now()}`);
const targets = Platform.WINDOWS.createTarget(["nsis", "portable"], Arch.x64);

function isDeliverable(name) {
  return /^Idea-Foundry-(?:Setup|Portable)-.+\.(?:exe|blockmap)$/i.test(name);
}

await fs.mkdir(releaseDirectory, { recursive: true });

try {
  await build({
    projectDir: projectDirectory,
    targets,
    config: { directories: { output: temporaryDirectory } },
  });

  const generated = (await fs.readdir(temporaryDirectory)).filter(isDeliverable);
  if (!generated.some((name) => /Setup.+\.exe$/i.test(name))) throw new Error("The Windows installer was not generated.");
  if (!generated.some((name) => /Portable.+\.exe$/i.test(name))) throw new Error("The portable executable was not generated.");

  for (const name of generated) {
    await fs.copyFile(path.join(temporaryDirectory, name), path.join(releaseDirectory, name));
  }

  process.stdout.write(`${generated.map((name) => path.join(releaseDirectory, name)).join("\n")}\n`);
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
