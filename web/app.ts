import { createApiClient } from "./authClient.js";

interface Passive {
  partId: string;
  pn: string;
  manufacturer: string | null;
  type: string;
  valueNorm: number | null;
  valueDisplay: string | null;
  tolerance: string | null;
  voltage: string | null;
  package: string | null;
  confidence: string;
  rawDescription: string;
  locations: Array<{ name: string; quantity: number }>;
  totalStock: number;
  notes?: string;
  defaultStorageName?: string | null;
  price?: number | null;
  currency?: string | null;
}

type Tab = "resistor" | "capacitor" | "inductor" | "review";

interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
  expiresAt?: number;
}

const api = createApiClient({ fetchImpl: fetch.bind(globalThis), storage: localStorage });

const state = {
  tab: "resistor" as Tab,
  filters: { package: "", tolerance: "", voltage: "" } as Record<string, string>,
  parts: [] as Passive[],
  auth: {
    enabled: false,
    authenticated: false,
    loading: true,
    error: null as string | null,
    expiresAt: null as number | null
  }
};

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setLockedUi(locked: boolean): void {
  document.body.classList.toggle("auth-locked", locked);
}

function renderAuthPanel(): void {
  const authEl = $("#auth");

  if (state.auth.loading) {
    setLockedUi(true);
    authEl.classList.remove("hidden");
    authEl.innerHTML = `
      <form class="login-panel" aria-live="polite">
        <h2>Checking access</h2>
        <p>Contacting the server.</p>
      </form>
    `;
    return;
  }

  if (!state.auth.enabled || state.auth.authenticated) {
    setLockedUi(false);
    authEl.classList.add("hidden");
    authEl.innerHTML = "";
    return;
  }

  setLockedUi(true);
  authEl.classList.remove("hidden");
  authEl.innerHTML = `
    <form class="login-panel" id="login-form">
      <h2>Sign in</h2>
      <p>${esc(state.auth.error ?? "Enter the library password to unlock the app.")}</p>
      <label>
        <span>Password</span>
        <input name="password" type="password" autocomplete="current-password" required />
      </label>
      <button type="submit">Log in</button>
    </form>
  `;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    return await api.request<T>(url, init);
  } catch (error) {
    if (error instanceof Error && error.message === "authentication required") {
      api.clearAuth();
      state.auth.enabled = true;
      state.auth.authenticated = false;
      state.auth.loading = false;
      state.auth.error = "Your session expired. Sign in again.";
      state.auth.expiresAt = null;
      state.parts = [];
      $("#filters").innerHTML = "";
      $("#list").innerHTML = "";
      $("#detail").classList.add("hidden");
      renderAuthPanel();
      return null;
    }
    throw error;
  }
}

async function loadMeta(): Promise<boolean> {
  const meta = await requestJson<{ lastSyncedAt: number | null; error: string | null }>("/api/meta");
  if (!meta) return false;
  const when = meta.lastSyncedAt ? new Date(meta.lastSyncedAt).toLocaleString() : "never";
  $("#synced").textContent = meta.error ? `Sync error: ${meta.error}` : `Synced: ${when}`;
  return true;
}

async function loadTab(): Promise<boolean> {
  if (state.tab === "review") {
    const data = await requestJson<{ parts: Passive[] }>("/api/review");
    if (!data) return false;
    state.parts = data.parts;
    $("#filters").innerHTML = "";
  } else {
    const data = await requestJson<{ parts: Passive[]; filters: Record<string, string[]> }>(`/api/library?type=${state.tab}`);
    if (!data) return false;
    state.parts = data.parts;
    renderFilters(data.filters);
  }
  renderList();
  return true;
}

function renderFilters(filters: Record<string, string[]>): void {
  const groups: Array<[string, string[]]> = [
    ["package", filters.packages ?? []],
    ["tolerance", filters.tolerances ?? []],
    ["voltage", filters.voltages ?? []]
  ];
  $("#filters").innerHTML = groups
    .flatMap(([key, values]) =>
      values.map((v) => {
        const active = state.filters[key] === v ? " active" : "";
        return `<button class="chip${active}" data-key="${key}" data-val="${v}">${v}</button>`;
      })
    )
    .join("");
}

function visibleParts(): Passive[] {
  return state.parts.filter((p) =>
    (!state.filters.package || p.package === state.filters.package) &&
    (!state.filters.tolerance || p.tolerance === state.filters.tolerance) &&
    (!state.filters.voltage || p.voltage === state.filters.voltage)
  );
}

function renderList(): void {
  const rows = visibleParts()
    .map((p) => {
      const badge =
        p.confidence === "conflict" || p.confidence === "unknown"
          ? `<span class="badge ${p.confidence}">${p.confidence}</span>`
          : "";
      const value = p.valueDisplay ? esc(p.valueDisplay) : "<em>?</em>";
      const meta = [p.package, p.tolerance, p.voltage].filter(Boolean).map((v) => esc(v)).join(" · ");
      return `<div class="row" data-id="${p.partId}">
        <span class="value">${value} ${badge}</span>
        <span class="meta">${meta || esc(p.rawDescription).slice(0, 60)}</span>
        <span class="stock">${p.totalStock} pcs</span>
      </div>`;
    })
    .join("");
  $("#list").innerHTML = rows || "<p>No parts.</p>";
}

function parseNotes(notes: string | null | undefined): {
  mpn?: string;
  manufacturer?: string;
  datasheetUrl?: string;
  specs: Array<{ name: string; value: string }>;
} {
  const result: { mpn?: string; manufacturer?: string; datasheetUrl?: string; specs: Array<{ name: string; value: string }> } = { specs: [] };
  if (!notes) return result;

  const lines = notes.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("MPN:")) {
      result.mpn = trimmed.substring(4).trim();
    } else if (trimmed.startsWith("Manufacturer:")) {
      result.manufacturer = trimmed.substring(13).trim();
    } else if (trimmed.startsWith("Datasheet:")) {
      const match = trimmed.match(/\((https?:\/\/[^\)]+)\)/);
      if (match) {
        result.datasheetUrl = match[1];
      }
    } else if (trimmed.startsWith("|")) {
      const cols = trimmed.split("|").map(c => c.trim()).filter(Boolean);
      if (cols.length === 2 && cols[0] !== "Specification" && !cols[0].startsWith("---")) {
        result.specs.push({ name: cols[0], value: cols[1] });
      }
    }
  }
  return result;
}

function renderDetail(p: Passive): void {
  const locations = p.locations.length
    ? p.locations.map((l) => `${esc(l.name)}: ${l.quantity}`).join("<br />")
    : "No stock on hand";

  const parsedNotes = parseNotes(p.notes);

  let dlContent = `
    <dt>Part number</dt><dd>${esc(p.pn)}</dd>
    <dt>Manufacturer</dt><dd>${p.manufacturer ? esc(p.manufacturer) : (parsedNotes.manufacturer ? esc(parsedNotes.manufacturer) : "—")}</dd>
    <dt>Type</dt><dd>${esc(p.type)}</dd>
    <dt>Tolerance</dt><dd>${p.tolerance ? esc(p.tolerance) : "—"}</dd>
    <dt>Voltage</dt><dd>${p.voltage ? esc(p.voltage) : "—"}</dd>
    <dt>Package</dt><dd>${p.package ? esc(p.package) : "—"}</dd>
  `;

  if (p.defaultStorageName) {
    dlContent += `<dt>Default Storage</dt><dd>${esc(p.defaultStorageName)}</dd>`;
  }

  if (p.price != null) {
    const symbol = (p.currency ?? "usd").toUpperCase();
    dlContent += `<dt>Cost</dt><dd>${p.price.toFixed(4)} ${symbol}</dd>`;
  }

  dlContent += `<dt>Location(s)</dt><dd>${locations}</dd>`;

  if (parsedNotes.datasheetUrl) {
    dlContent += `<dt>Datasheet</dt><dd><a href="${esc(parsedNotes.datasheetUrl)}" target="_blank" class="datasheet-link">📄 Open PDF Link</a></dd>`;
  }

  dlContent += `<dt>Raw description</dt><dd>${esc(p.rawDescription)}</dd>`;

  if (parsedNotes.specs.length > 0) {
    dlContent += `<dt class="section-divider">Technical Specifications</dt>`;
    for (const spec of parsedNotes.specs) {
      dlContent += `<dt>${esc(spec.name)}</dt><dd>${esc(spec.value)}</dd>`;
    }
  }

  const override =
    p.confidence === "conflict" || p.confidence === "unknown"
      ? `<form class="override" data-id="${p.partId}">
          <p class="override-title">Correct this part</p>
          <select name="type">
            <option value="">— keep current type —</option>
            <option value="resistor">resistor</option>
            <option value="capacitor">capacitor</option>
            <option value="inductor">inductor</option>
          </select>
          <input name="value" placeholder="value e.g. 4.7k, 100n, 3.3u" />
          <input name="tolerance" placeholder="tolerance e.g. ±1%" />
          <input name="voltage" placeholder="voltage e.g. 50 V" />
          <button type="submit">Save override</button>
        </form>`
      : "";
  $("#detail").innerHTML = `
    <button class="close" id="close">×</button>
    <h2>${p.valueDisplay ? esc(p.valueDisplay) : "Unknown value"}</h2>
    <dl>
      ${dlContent}
    </dl>
    ${override}`;
  $("#detail").classList.remove("hidden");
}

async function updateDigiKeyStatus(): Promise<void> {
  const status = await requestJson<{ isEnabled: boolean; isAuthenticated: boolean; authUrl: string | null }>("/api/digikey/status");
  const el = $("#digikey-status");
  if (!status || !status.isEnabled) {
    el.innerHTML = "";
    return;
  }

  if (status.isAuthenticated) {
    el.innerHTML = `<span style="color: #2e7d32; font-weight: 600;">● DigiKey Connected</span>`;
  } else {
    el.innerHTML = `<a href="${status.authUrl}" target="_blank" style="color: #c62828; font-weight: 600; text-decoration: none; margin-right: 8px;">Connect DigiKey</a><button id="digikey-code-btn" style="padding: 2px 6px; font-size: 11px; font-family: inherit;">Paste Code</button>`;
  }
}

async function bootstrap(): Promise<void> {
  const status = await requestJson<AuthStatus>("/api/auth/status");
  if (!status) {
    state.auth.loading = false;
    state.auth.enabled = true;
    state.auth.authenticated = false;
    state.auth.error = "Unable to reach the authentication endpoint.";
    renderAuthPanel();
    return;
  }

  state.auth.loading = false;
  state.auth.enabled = status.enabled;
  state.auth.authenticated = !status.enabled || status.authenticated;
  state.auth.expiresAt = status.expiresAt ?? null;
  state.auth.error = null;
  renderAuthPanel();

  if (!state.auth.authenticated) {
    return;
  }

  if (!(await loadMeta())) return;
  await loadTab();
  await updateDigiKeyStatus();
}

document.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  if (state.auth.enabled && !state.auth.authenticated && !t.closest("#auth")) {
    return;
  }

  if (t.matches(".tabs button")) {
    state.tab = t.dataset.tab as Tab;
    state.filters = { package: "", tolerance: "", voltage: "" };
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
    t.classList.add("active");
    await loadTab();
  } else if (t.matches(".chip")) {
    const key = t.dataset.key as string;
    state.filters[key] = state.filters[key] === t.dataset.val ? "" : (t.dataset.val as string);
    document.querySelectorAll(`.chip[data-key="${key}"]`).forEach((c) => c.classList.remove("active"));
    if (state.filters[key]) t.classList.add("active");
    renderList();
  } else if (t.closest(".row")) {
    const id = (t.closest(".row") as HTMLElement).dataset.id as string;
    const part = await requestJson<Passive>(`/api/part/${id}`);
    if (part) {
      renderDetail(part);
    }
  } else if (t.id === "close") {
    $("#detail").classList.add("hidden");
  } else if (t.id === "refresh") {
    t.setAttribute("disabled", "true");
    try {
      const refreshed = await requestJson("/api/sync", { method: "POST" });
      if (refreshed) {
        await loadMeta();
        await loadTab();
      }
    } finally {
      t.removeAttribute("disabled");
    }
  } else if (t.id === "digikey-code-btn") {
    const codeInput = prompt("Please enter the authorization code or the redirected DigiKey URL:");
    if (codeInput) {
      let code = codeInput.trim();
      if (code.includes("code=")) {
        try {
          const urlStr = code.startsWith("http") ? code : `https://localhost/${code.startsWith("?") ? "" : "?"}${code}`;
          const url = new URL(urlStr);
          const parsedCode = url.searchParams.get("code");
          if (parsedCode) {
            code = parsedCode;
          }
        } catch (e) {
          // Fallback
        }
        if (code.includes("code=")) {
          const match = code.match(/[?&]code=([^&]+)/);
          if (match) {
            code = match[1];
          }
        }
      }

      t.setAttribute("disabled", "true");
      try {
        const res = await requestJson("/api/digikey/auth-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });
        if (res) {
          await updateDigiKeyStatus();
        }
      } finally {
        t.removeAttribute("disabled");
      }
    }
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target as HTMLFormElement;
  if (form.matches("#login-form")) {
    e.preventDefault();
    const data = new FormData(form);
    const password = String(data.get("password") ?? "").trim();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null) as { error?: string } | null;
      state.auth.enabled = true;
      state.auth.authenticated = false;
      state.auth.error = payload?.error ?? "Login failed.";
      renderAuthPanel();
      return;
    }

    const payload = await res.json() as { token: string; expiresAt: number };
    api.setAuth({ token: payload.token, expiresAt: payload.expiresAt });
    state.auth.enabled = true;
    state.auth.authenticated = true;
    state.auth.error = null;
    state.auth.expiresAt = payload.expiresAt;
    renderAuthPanel();
    await loadMeta();
    await loadTab();
    await updateDigiKeyStatus();
    return;
  }

  if (!form.matches(".override")) return;
  e.preventDefault();
  const id = form.dataset.id as string;
  const data = new FormData(form);
  const body: Record<string, string> = {};
  for (const k of ["type", "value", "tolerance", "voltage"]) {
    const v = (data.get(k) as string | null)?.trim();
    if (v) body[k] = v;
  }
  const result = await requestJson(`/api/part/${id}/override`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!result) return;
  $("#detail").classList.add("hidden");
  await loadMeta();
  await loadTab();
});

renderAuthPanel();
void bootstrap();
