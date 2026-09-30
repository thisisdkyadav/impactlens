let csrf = '';
export function setCsrf(token: string) {
  csrf = token;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: 'The server could not complete the request.' }));
    if (response.status === 401 && !path.includes('/auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw new Error(body.error || 'Request failed.');
  }
  return response.json();
}
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export function download(path: string) {
  const a = document.createElement('a');
  a.href = `/api${path}`;
  a.download = '';
  a.click();
}
export const formatDate = (value: string) =>
  new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
export const humanize = (value: string) => value.split(/[._-]/).join(' ');
export async function allAssets(query: string): Promise<import('./types').Asset[]> {
  const first = await api<import('./types').AssetResult>(`/assets?${query}`);
  const records = [...first.assets];
  for (let page = 2; page <= first.pages; page++)
    records.push(
      ...(await api<import('./types').AssetResult>(`/assets?${query}&page=${page}`)).assets,
    );
  return records;
}
