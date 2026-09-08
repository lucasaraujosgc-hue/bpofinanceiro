/* Cliente HTTP central: injeta o access token em toda chamada /api e renova
   automaticamente em 401 usando o refresh token rotativo.

   Faz monkey-patch de window.fetch — assim TODO componente (inclusive os que
   chamam fetch() cru com o token vindo por prop) ganha a renovação de graça,
   sem refatorar cada tela. Deve ser importado ANTES do <App /> (ver index.tsx). */

const ACCESS_KEY = 'finance_app_token';
const REFRESH_KEY = 'finance_app_refresh';
const USER_KEY = 'finance_app_user';

type Session = { token: string; refreshToken?: string; expiresIn?: number };

const bothStores = (): Storage[] => {
  const out: Storage[] = [];
  try { out.push(window.localStorage); } catch { /* ignore */ }
  try { out.push(window.sessionStorage); } catch { /* ignore */ }
  return out;
};

const read = (key: string): string | null => {
  for (const s of bothStores()) {
    try { const v = s.getItem(key); if (v) return v; } catch { /* ignore */ }
  }
  return null;
};

export const getAccessToken = (): string | null => read(ACCESS_KEY);
const getRefreshToken = (): string | null => read(REFRESH_KEY);

// Store que hoje guarda a sessão (localStorage se "lembrar de mim", senão sessionStorage).
const activeStore = (): Storage => {
  try { if (window.localStorage.getItem(ACCESS_KEY)) return window.localStorage; } catch { /* ignore */ }
  try { return window.sessionStorage; } catch { /* ignore */ }
  return window.localStorage;
};

/** Grava o par de tokens. `remember` indefinido = mantém no store atual. */
export const saveSession = (s: Session, remember?: boolean): void => {
  const store = remember === undefined
    ? activeStore()
    : (remember ? window.localStorage : window.sessionStorage);
  try {
    store.setItem(ACCESS_KEY, s.token);
    if (s.refreshToken) store.setItem(REFRESH_KEY, s.refreshToken);
  } catch { /* ignore */ }
};

/** Apaga a sessão de todos os storages. */
export const clearSession = (): void => {
  for (const s of bothStores()) {
    for (const k of [ACCESS_KEY, REFRESH_KEY, USER_KEY]) {
      try { s.removeItem(k); } catch { /* ignore */ }
    }
  }
};

// --- renovação (single-flight) --------------------------------------------
const realFetch: typeof window.fetch = window.fetch.bind(window);
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const rt = getRefreshToken();
  if (!rt) return null;

  refreshInFlight = (async () => {
    try {
      const res = await realFetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.token) return null;
      saveSession({ token: data.token, refreshToken: data.refreshToken });
      try { window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: { token: data.token } })); } catch { /* ignore */ }
      return data.token as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// Endpoints que nunca levam Authorization nem disparam refresh.
const PUBLIC_PATHS = [
  '/api/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/request-signup',
  '/api/complete-signup',
  '/api/validate-signup-token',
  '/api/recover-password',
  '/api/reset-password-confirm',
  '/api/global-banks',
];

function pathOf(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') return input.startsWith('http') ? new URL(input).pathname : input;
    if (input instanceof URL) return input.pathname;
    if (input instanceof Request) return input.url.startsWith('http') ? new URL(input.url).pathname : input.url;
  } catch { /* ignore */ }
  return '';
}

const isApi = (p: string) => p.startsWith('/api/');
const isPublic = (p: string) => PUBLIC_PATHS.some((x) => p === x || p.startsWith(x + '/') || p.startsWith(x + '?'));

function withAuth(init: RequestInit | undefined, token: string | null): RequestInit {
  const headers = new Headers(init?.headers || undefined);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...(init || {}), headers };
}

function installFetchPatch() {
  if ((window as unknown as Record<string, unknown>).__authFetchPatched) return;
  (window as unknown as Record<string, unknown>).__authFetchPatched = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const p = pathOf(input);
    if (!isApi(p) || isPublic(p)) return realFetch(input, init);

    // Requests com Request cru: normaliza para (url, init) para poder reenviar.
    let url: string = input instanceof Request ? input.url : (typeof input === 'string' ? input : String(input));
    let baseInit: RequestInit | undefined = init;
    if (input instanceof Request && !init) {
      baseInit = {
        method: input.method,
        headers: input.headers,
        body: input.method !== 'GET' && input.method !== 'HEAD' ? await input.clone().text() : undefined,
        credentials: input.credentials,
        mode: input.mode,
      };
    }

    let res = await realFetch(url, withAuth(baseInit, getAccessToken()));
    if (res.status !== 401) return res;

    const fresh = await refreshAccessToken();
    if (!fresh) {
      clearSession();
      window.dispatchEvent(new CustomEvent('auth:logout'));
      return res;
    }
    return realFetch(url, withAuth(baseInit, fresh));
  };
}

installFetchPatch();

export { realFetch };
