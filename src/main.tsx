import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Earliest-possible privacy redirect:
// If a mobile browser is restoring a chatroom URL and we previously auto-logged out,
// force redirect to index *before* React renders anything, avoiding a visible chat flash.
const FORCE_INDEX_KEY = "vaultsecret_force_index";

try {
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(max-width: 768px)").matches;
  const shouldForceIndex =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/chat/") &&
    window.localStorage.getItem(FORCE_INDEX_KEY) === "1";

  if (isMobile && shouldForceIndex) {
    window.location.replace("/");
  }
} catch {
  // ignore
}

createRoot(document.getElementById("root")!).render(<App />);
