import { app, BrowserWindow, ipcMain, safeStorage, session } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertProviderReady,
  ConnectorError,
  draftEvaluation,
  extractEvidence,
  generateIdeas,
  listModels,
  normalizeConfig,
  publicError,
  testConnection,
} from "./llm-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANNELS = Object.freeze({
  version: "idea-foundry:version",
  getConfig: "idea-foundry:llm:get-config",
  saveConfig: "idea-foundry:llm:save-config",
  clearConfig: "idea-foundry:llm:clear-config",
  testConnection: "idea-foundry:llm:test-connection",
  listModels: "idea-foundry:llm:list-models",
  generateIdeas: "idea-foundry:llm:generate-ideas",
  draftEvaluation: "idea-foundry:llm:draft-evaluation",
  extractEvidence: "idea-foundry:llm:extract-evidence",
});

let mainWindow = null;
let configMutationQueue = Promise.resolve();
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

function configPath() {
  return path.join(app.getPath("userData"), "llm-connector.json");
}

async function readStoredRecord() {
  try {
    const text = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new ConnectorError("settings_read", "The local connector settings could not be read.");
  }
}

function decryptApiKey(record) {
  if (!record?.encryptedApiKey) return "";
  if (!safeStorage.isEncryptionAvailable()) throw new ConnectorError("credential_store", "Operating-system credential protection is unavailable.");
  try {
    return safeStorage.decryptString(Buffer.from(String(record.encryptedApiKey), "base64"));
  } catch {
    throw new ConnectorError("credential_store", "The protected API credential could not be opened by this operating-system account.");
  }
}

async function resolvedConfig(overrides = {}) {
  const stored = await readStoredRecord();
  const fallback = {
    provider: stored.provider,
    baseUrl: stored.baseUrl,
    model: stored.model,
    apiKey: decryptApiKey(stored),
  };
  return assertProviderReady(normalizeConfig(overrides, fallback));
}

function publicConfig(config, hasApiKey) {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    hasApiKey: Boolean(hasApiKey),
  };
}

async function getConfig() {
  const stored = await readStoredRecord();
  const config = normalizeConfig(stored);
  return publicConfig(config, stored.encryptedApiKey);
}

async function writeConfig(input = {}) {
  const previous = await readStoredRecord();
  const previousKey = decryptApiKey(previous);
  const config = normalizeConfig(input, { ...previous, apiKey: previousKey });
  assertProviderReady(config);
  const providerChanged = Boolean(previous.provider && previous.provider !== config.provider);
  const endpointChanged = Boolean(previous.encryptedApiKey)
    && String(previous.baseUrl ?? "") !== config.baseUrl;
  let encryptedApiKey = input.clearApiKey === true || providerChanged || endpointChanged
    ? ""
    : String(previous.encryptedApiKey ?? "");
  if (input.clearApiKey !== true && typeof input.apiKey === "string" && input.apiKey.trim()) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new ConnectorError("credential_store", "This operating system cannot securely store an API key. Choose a keyless local model or enable operating-system credential protection.");
    }
    encryptedApiKey = safeStorage.encryptString(input.apiKey.trim()).toString("base64");
  }
  const record = {
    version: 1,
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    ...(encryptedApiKey ? { encryptedApiKey } : {}),
  };
  const target = configPath();
  const temporary = `${target}.tmp`;
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, target);
  } catch {
    throw new ConnectorError("settings_write", "The connector settings could not be saved on this computer.");
  }
  return publicConfig(config, encryptedApiKey);
}

async function clearConfig() {
  const target = configPath();
  try {
    await Promise.all([
      fs.rm(target, { force: true }),
      fs.rm(`${target}.tmp`, { force: true }),
    ]);
  } catch {
    throw new ConnectorError("settings_write", "The local connector settings could not be cleared.");
  }
  return publicConfig(normalizeConfig({}), false);
}

function mutateConfig(operation) {
  const current = configMutationQueue.then(operation, operation);
  configMutationQueue = current.then(() => undefined, () => undefined);
  return current;
}

function assertTrustedSender(event) {
  if (
    !mainWindow ||
    event.sender.id !== mainWindow.webContents.id ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error("Untrusted desktop request.");
  }
}

function safeHandler(handler) {
  return async (event, input) => {
    assertTrustedSender(event);
    try {
      return await handler(input);
    } catch (error) {
      throw new Error(publicError(error));
    }
  };
}

function registerIpc() {
  ipcMain.handle(CHANNELS.version, safeHandler(async () => app.getVersion()));
  ipcMain.handle(CHANNELS.getConfig, safeHandler(async () => {
    await configMutationQueue;
    return getConfig();
  }));
  ipcMain.handle(CHANNELS.saveConfig, safeHandler((input = {}) => mutateConfig(() => writeConfig(input))));
  ipcMain.handle(CHANNELS.clearConfig, safeHandler(() => mutateConfig(clearConfig)));
  ipcMain.handle(CHANNELS.testConnection, safeHandler(async (input = {}) => testConnection(await resolvedConfig(input))));
  ipcMain.handle(CHANNELS.listModels, safeHandler(async (input = {}) => listModels(
    await resolvedConfig(input),
    { query: input?.query },
  )));
  ipcMain.handle(CHANNELS.generateIdeas, safeHandler(async (input = {}) => {
    const prompt = typeof input?.prompt === "string" ? input.prompt : "";
    const count = input?.count;
    const config = await resolvedConfig(input);
    return generateIdeas(config, prompt, count);
  }));
  ipcMain.handle(CHANNELS.draftEvaluation, safeHandler(async (input = {}) => {
    const config = await resolvedConfig(input);
    return draftEvaluation(config, {
      projectContext: input?.projectContext,
      claimIds: input?.claimIds,
      scope: input?.scope,
    });
  }));
  ipcMain.handle(CHANNELS.extractEvidence, safeHandler(async (input = {}) => {
    const config = await resolvedConfig(input);
    return extractEvidence(config, {
      sourceText: input?.sourceText,
      sourceLabel: input?.sourceLabel,
    });
  }));
}

function hardenSession() {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

function createWindow() {
  const preload = path.join(__dirname, "preload.cjs");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: "#f7f4eb",
    show: false,
    autoHideMenuBar: true,
    title: "Idea Foundry",
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, destination) => {
    if (destination !== mainWindow?.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.on("will-redirect", (event) => event.preventDefault());
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });

  const renderer = path.join(__dirname, "..", "desktop-dist", "index.html");
  void mainWindow.loadFile(renderer);
}

if (singleInstance) {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    hardenSession();
    registerIpc();
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
