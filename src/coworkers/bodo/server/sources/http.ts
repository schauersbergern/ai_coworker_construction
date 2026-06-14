export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ]);
}

export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": "bodo-lagebewertung/1.0", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`http ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": "bodo-lagebewertung/1.0", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`http ${res.status} for ${url}`);
  return res.text();
}
