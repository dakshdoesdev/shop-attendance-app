type QueuedReq = {
  method: string;
  path: string;
  body?: any;
  headers?: Record<string,string>;
};

const KEY = 'offlineQueue:v1';

function readQueue(): QueuedReq[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedReq[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {}
}

export function enqueue(req: QueuedReq) {
  const q = readQueue();
  q.push(req);
  writeQueue(q);
}

export async function flush(getBase: () => string) {
  let q = readQueue();
  if (!q.length) return;
  const base = getBase();
  const next: QueuedReq[] = [];
  for (const it of q) {
    try {
      const res = await fetch(`${base}${it.path}`, {
        method: it.method,
        headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json', ...(it.headers||{}) },
        credentials: 'include',
        body: it.body ? JSON.stringify(it.body) : undefined,
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      next.push(it);
    }
  }
  writeQueue(next);
}

export function installFlushOnOnline(getBase: () => string) {
  try {
    window.addEventListener('online', () => { flush(getBase); });
    // Try once on load
    flush(getBase);
  } catch {}
}

