import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { GuestProvider } from "./components/GuestProvider";
import OfflineStartup from "./components/OfflineStartup";
import { registerPwa, startInstallCapture } from "./lib/pwa";

startInstallCapture();
void registerPwa();

createRoot(document.getElementById("root")!).render(
  !navigator.onLine ? <OfflineStartup /> : <GuestProvider>
    <App />
  </GuestProvider>
);
