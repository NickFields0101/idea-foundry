import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import Home from "../../app/page";
import "../../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("SIFT could not find its renderer root element.");
}

document.documentElement.dataset.runtime = window.ideaFoundry?.desktop ? "desktop" : "browser";
const savedTheme = localStorage.getItem("sift-theme-v1");
const initialTheme = savedTheme === "light" || savedTheme === "dark"
  ? savedTheme
  : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
document.documentElement.dataset.theme = initialTheme;
document.documentElement.style.colorScheme = initialTheme;

createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
