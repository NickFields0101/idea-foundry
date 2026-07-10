"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = Object.freeze({
  version: "idea-foundry:version",
  getConfig: "idea-foundry:llm:get-config",
  saveConfig: "idea-foundry:llm:save-config",
  testConnection: "idea-foundry:llm:test-connection",
  listModels: "idea-foundry:llm:list-models",
  generateIdeas: "idea-foundry:llm:generate-ideas",
});

contextBridge.exposeInMainWorld("ideaFoundry", Object.freeze({
  desktop: true,
  app: Object.freeze({
    getVersion: () => ipcRenderer.invoke(CHANNELS.version),
  }),
  llm: Object.freeze({
    getConfig: () => ipcRenderer.invoke(CHANNELS.getConfig),
    saveConfig: (input) => ipcRenderer.invoke(CHANNELS.saveConfig, input),
    testConnection: (input) => ipcRenderer.invoke(CHANNELS.testConnection, input),
    listModels: (input) => ipcRenderer.invoke(CHANNELS.listModels, input),
    generateIdeas: (input) => ipcRenderer.invoke(CHANNELS.generateIdeas, input),
  }),
}));
