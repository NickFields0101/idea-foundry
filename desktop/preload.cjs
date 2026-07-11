"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const { contextBridge, ipcRenderer } = require("electron");

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

contextBridge.exposeInMainWorld("ideaFoundry", Object.freeze({
  desktop: true,
  app: Object.freeze({
    getVersion: () => ipcRenderer.invoke(CHANNELS.version),
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
  }),
}));
