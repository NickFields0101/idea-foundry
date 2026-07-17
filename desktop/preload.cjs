"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = Object.freeze({
  version: "sift:version",
  openExternal: "sift:open-external",
  getConfig: "sift:llm:get-config",
  saveConfig: "sift:llm:save-config",
  clearConfig: "sift:llm:clear-config",
  testConnection: "sift:llm:test-connection",
  listModels: "sift:llm:list-models",
  generateIdeas: "sift:llm:generate-ideas",
  draftEvaluation: "sift:llm:draft-evaluation",
  extractEvidence: "sift:llm:extract-evidence",
  researchEvidence: "sift:llm:research-evidence",
  intelligenceStatus: "sift:intelligence:status",
  intelligenceStart: "sift:intelligence:start",
  intelligenceEvents: "sift:intelligence:events",
  intelligenceCancel: "sift:intelligence:cancel",
  buildCatalog: "sift:build:catalog",
  buildDetect: "sift:build:detect",
  buildRun: "sift:build:run",
});

contextBridge.exposeInMainWorld("sift", Object.freeze({
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
  intelligence: Object.freeze({
    getStatus: () => ipcRenderer.invoke(CHANNELS.intelligenceStatus),
    start: (input) => ipcRenderer.invoke(CHANNELS.intelligenceStart, input),
    getEvents: (input) => ipcRenderer.invoke(CHANNELS.intelligenceEvents, input),
    cancel: (input) => ipcRenderer.invoke(CHANNELS.intelligenceCancel, input),
  }),
  build: Object.freeze({
    getCatalog: () => ipcRenderer.invoke(CHANNELS.buildCatalog),
    detect: () => ipcRenderer.invoke(CHANNELS.buildDetect),
    run: (input) => ipcRenderer.invoke(CHANNELS.buildRun, input),
  }),
}));
