import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, getStoredTheme, ThemeProvider } from "./lib/theme";
import { AuthProvider } from "./lib/auth";
import { LicenseGate } from "./components/LicenseGate";

// Applied synchronously, before the first paint, so the app never flashes the wrong theme
// while React and ThemeProvider are still initializing.
applyTheme(getStoredTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <LicenseGate>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LicenseGate>
    </ThemeProvider>
  </React.StrictMode>,
);
