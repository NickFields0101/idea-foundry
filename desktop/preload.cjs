"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = Object.freeze({
  version: "idea-foundry:version",
  openExternal: "idea-foundry:open-external",
  getConfig: "idea-foundry:llm:get-config",
  saveConfig: "idea-foundry:llm:save-config",
  clearConfig: "idea-foundry:llm:clear-config",
  testConnection: "idea-foundry:llm:test-connection",
  listModels: "idea-foundry:llm:list-models",
  generateIdeas: "idea-foundry:llm:generate-ideas",
  draftEvaluation: "idea-foundry:llm:draft-evaluation",
  extractEvidence: "idea-foundry:llm:extract-evidence",
  researchEvidence: "idea-foundry:llm:research-evidence",
  buildCatalog: "idea-foundry:build:catalog",
  buildDetect: "idea-foundry:build:detect",
  buildRun: "idea-foundry:build:run",
});

contextBridge.exposeInMainWorld("ideaFoundry", Object.freeze({
  desktop: true,
  app: Object.freeze({
    getVersion: () => ipcRenderer.invoke(CHANNELS.version),
    openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url),
  }),
  llm: Object.freeze({
    getConfig: () => ipcRenderer.invoke(CHANNELS.getConfig),
    saveConfig: (input) => ipcRenderer.invoke(CHANNELS.saveConfig, input),
    clearConfig: () => ipcRenderer.invoke(CHANNELS.clearConfig),
    testConnection: (input) => ipcRenderer.invoke(CHANNELS.testConnection, input),
    listModels: (input) => ipcRenderer.invoke(CHANNELS.listModels, input),
    generateIdeas: (input) => ipcRenderer.invoke(CHANNELS.generateIdeas, input),
    draftEvaluation: (input) => ipcRenderer.invoke(CHANNELS.draftEvaluation, input),
    extractEvidence: (input) => ipcRenderer.invoke(CHANNELS.extractEvidence, input),
    researchEvidence: (input) => ipcRenderer.invoke(CHANNELS.researchEvidence, input),
  }),
  build: Object.freeze({
    getCatalog: () => ipcRenderer.invoke(CHANNELS.buildCatalog),
    detect: () => ipcRenderer.invoke(CHANNELS.buildDetect),
    run: (input) => ipcRenderer.invoke(CHANNELS.buildRun, input),
  }),
}));
