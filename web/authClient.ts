export interface StoredAuth {
  token: string;
  expiresAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ApiClientOptions {
  fetchImpl: typeof fetch;
  storage: StorageLike;
}

const STORAGE_KEY = "partsbox-manager.auth";

function readHeaders(initHeaders?: HeadersInit): Record<string, string> {
  if (!initHeaders) return {};
  if (initHeaders instanceof Headers) {
    return Object.fromEntries(initHeaders.entries());
  }
  if (Array.isArray(initHeaders)) {
    return Object.fromEntries(initHeaders);
  }
  return { ...initHeaders };
}

export function loadStoredAuth(storage: StorageLike): StoredAuth | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") return null;
    return { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function saveStoredAuth(storage: StorageLike, auth: StoredAuth): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(storage: StorageLike): void {
  storage.removeItem(STORAGE_KEY);
}

export function createApiClient(options: ApiClientOptions) {
  let auth = loadStoredAuth(options.storage);

  function setAuth(next: StoredAuth | null): void {
    auth = next;
    if (next) {
      saveStoredAuth(options.storage, next);
    } else {
      clearStoredAuth(options.storage);
    }
  }

  async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    if (auth && auth.expiresAt <= Date.now()) {
      setAuth(null);
    }

    const headers = readHeaders(init.headers);
    if (auth?.token) {
      headers.Authorization = `Bearer ${auth.token}`;
    }

    const response = await options.fetchImpl(url, {
      ...init,
      headers
    });

    if (response.status === 401) {
      setAuth(null);
      throw new Error("authentication required");
    }

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    request,
    setAuth,
    clearAuth: () => setAuth(null),
    getAuth: () => auth,
    isAuthenticated: () => Boolean(auth && auth.expiresAt > Date.now())
  };
}
