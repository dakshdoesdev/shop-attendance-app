import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

async function bootstrap() {
  try {
    const configUrl = (import.meta as any).env?.VITE_CONFIG_URL as string | undefined;
    if (configUrl) {
      const res = await fetch(configUrl, { cache: 'no-store' }).catch(() => null as any);
      if (res && res.ok) {
        const cfg = await res.json().catch(() => null);
        if (cfg && typeof cfg === 'object') {
          const apiBase = (cfg as any).apiBase as string | undefined;
          const uploadBase = (cfg as any).uploadBase as string | undefined;
          try {
            // Always refresh from remote config so new tunnels take effect
            if (apiBase) localStorage.setItem('apiBase', apiBase);
            if (uploadBase) localStorage.setItem('uploadBase', uploadBase);
          } catch {}
        }
      }
    }
  } catch {}

  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
