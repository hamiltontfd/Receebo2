import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { GuestProvider } from "./components/GuestProvider";

createRoot(document.getElementById("root")!).render(
  <GuestProvider>
    <App />
  </GuestProvider>
);
