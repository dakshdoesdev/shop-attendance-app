import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function getApiBase(): string {
  const envVal = (import.meta as any).env?.VITE_API_BASE || "";
  const override = readLocal("apiBase");
  return (override && override.trim()) || envVal || "";
}

export function getUploadBase(): string {
  const envUpload = (import.meta as any).env?.VITE_UPLOAD_BASE || "";
  const envApi = (import.meta as any).env?.VITE_API_BASE || "";
  const override = readLocal("uploadBase") || readLocal("apiBase");
  return (override && override.trim()) || envUpload || envApi || "";
}

function getOrCreateDeviceId(): string | null {
  try {
    const existing = localStorage.getItem("deviceId");
    if (existing) return existing;
    // Try to generate a stable random ID
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      const id = (crypto as any).randomUUID();
      localStorage.setItem("deviceId", id);
      return id;
    } else {
      // Fallback: 32-hex random
      const bytes = new Uint8Array(16);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      const id = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem("deviceId", id);
      return id;
    }
  } catch {
    return null;
  }
}

function getBearerToken(): string | null {
  try {
    return localStorage.getItem("uploadToken");
  } catch {
    return null;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const API_BASE = getApiBase();
  const fullUrl = url.startsWith("/") ? `${API_BASE}${url}` : url;
  const headers: Record<string, string> = {};
  headers["ngrok-skip-browser-warning"] = "true";
  if (data) headers["Content-Type"] = "application/json";
  const token = getBearerToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const deviceId = getOrCreateDeviceId();
  if (deviceId) headers["X-Device-Id"] = deviceId;

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const API_BASE = getApiBase();
    const path = queryKey.join("/") as string;
    const fullUrl = path.startsWith("/") ? `${API_BASE}${path}` : path;
    const headers: Record<string, string> = {};
    headers["ngrok-skip-browser-warning"] = "true";
    const token = getBearerToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const deviceId = getOrCreateDeviceId();
    if (deviceId) headers["X-Device-Id"] = deviceId;
    const res = await fetch(fullUrl, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
