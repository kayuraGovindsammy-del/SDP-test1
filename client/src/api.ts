import type {
  AuthorsResponse,
  CommitsResponse,
  MetricsRequest,
  MetricsResponse,
  Repository,
} from './types.ts';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function repoBase(id: string): string {
  return `/repositories/${encodeURIComponent(id)}`;
}

export function listRepositories(): Promise<Repository[]> {
  return request('/repositories');
}

export function uploadRepository(file: File, name?: string): Promise<Repository> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-Filename': encodeURIComponent(file.name),
  };
  if (name?.trim()) headers['X-Name'] = encodeURIComponent(name.trim());
  return request('/repositories/upload', { method: 'POST', headers, body: file });
}

export function cloneRepository(url: string, name?: string): Promise<Repository> {
  return request('/repositories/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, name: name?.trim() || undefined }),
  });
}

export function deleteRepository(id: string): Promise<void> {
  return request(`/repositories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- analysis ---------------------------------------------------------------

export function listCommits(
  id: string,
  opts: { q?: string; limit?: number; offset?: number } = {},
): Promise<CommitsResponse> {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const query = params.toString();
  return request(`${repoBase(id)}/commits${query ? `?${query}` : ''}`);
}

export function getAuthors(id: string): Promise<AuthorsResponse> {
  return request(`${repoBase(id)}/authors`);
}

export function mergeAuthors(id: string, keys: string[], name?: string): Promise<AuthorsResponse> {
  return request(`${repoBase(id)}/authors/merge`, jsonInit('POST', { keys, name }));
}

export function unmergeAuthors(id: string, keys: string[]): Promise<AuthorsResponse> {
  return request(`${repoBase(id)}/authors/unmerge`, jsonInit('POST', { keys }));
}

export function renameAuthorGroup(
  id: string,
  groupId: string,
  name: string,
): Promise<AuthorsResponse> {
  return request(
    `${repoBase(id)}/authors/groups/${encodeURIComponent(groupId)}`,
    jsonInit('PATCH', { name }),
  );
}

export function getMetrics(id: string, body: MetricsRequest): Promise<MetricsResponse> {
  return request(`${repoBase(id)}/metrics`, jsonInit('POST', body));
}
