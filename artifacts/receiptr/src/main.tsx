import { createRoot, hydrateRoot } from "react-dom/client";
import { lazy, Suspense, useEffect, useState } from "react";
import PublicDocument from "./public-document";
import { setAccountLocale } from "./lib/locale";
import "./index.css";
import { GuestProvider } from "./components/GuestProvider";
import OfflineStartup from "./components/OfflineStartup";
import { registerPwa, startInstallCapture } from "./lib/pwa";

startInstallCapture();
void registerPwa();

const App = lazy(() => import("./App"));
const root = document.getElementById("root")!;
const publicPath = root.dataset.publicPath;

function ClientApp() {
  return <GuestProvider><App /></GuestProvider>;
}

function PublicBootstrap({ path }: { path: string }) {
  const [enhance, setEnhance] = useState(false);
  useEffect(() => {
    // Match the build-time English snapshot on the first hydration pass, then
    // restore browser/account language and the existing authentication flow.
    setAccountLocale(undefined);
    setEnhance(true);
  }, []);
  return enhance ? <Suspense fallback={<PublicDocument path={path} />}><ClientApp /></Suspense> :
    <PublicDocument path={path} />;
}

if (!navigator.onLine) {
  createRoot(root).render(<OfflineStartup />);
} else if (publicPath) {
  setAccountLocale("en");
  hydrateRoot(root, <PublicBootstrap path={publicPath} />, {
    onRecoverableError: (error, info) => console.error("Public hydration failed", error, info.componentStack),
  });
} else {
  createRoot(root).render(<Suspense fallback={null}><ClientApp /></Suspense>);
}
