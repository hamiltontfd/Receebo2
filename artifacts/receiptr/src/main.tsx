import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { GuestProvider } from "./components/GuestProvider";

if ("serviceWorker" in navigator) {
  const base = (import.meta.env.BASE_URL as string).replace(/\/?$/, "/");
  const serviceWorkerUrl = import.meta.env.DEV
    ? `${base}dev-sw.js?dev-sw`
    : `${base}sw.js`;

  void navigator.serviceWorker
    .register(serviceWorkerUrl, { scope: base, type: "module" })
    .catch((error) => {
      console.error("[PWA] Service worker registration failed", error);
    });
}

createRoot(document.getElementById("root")!).render(
  <GuestProvider>
    <App />
  </GuestProvider>
);
