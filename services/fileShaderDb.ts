import { StoredShader, ShaderStats } from './shaderStorage';
import { FuzzMode } from '../types';

export type TasteLabel = 'liked' | 'disliked' | 'tooSimilar';
export type StorageMode = 'local-file-db' | 'static-export-only' | 'unavailable';

export interface FileTasteSample {
  code: string;
  label: TasteLabel;
  mode: FuzzMode;
  timestamp: number;
}

export interface StorageCapability {
  mode: StorageMode;
  ok: boolean;
  dbPath: string;
  message: string;
}

let capabilityCache: StorageCapability | null = null;
const sessionShaders: StoredShader[] = [];
const sessionTaste: FileTasteSample[] = [];

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function isApiUnavailableError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /404|not found|Unexpected token|Failed to fetch|NetworkError|Cannot GET/i.test(message);
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sessionStats(): ShaderStats {
  const rated = sessionShaders.filter(shader => shader.rating > 0);
  const tagCounts = new Map<string, number>();
  for (const shader of sessionShaders) {
    for (const tag of shader.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  return {
    totalCount: sessionShaders.length,
    ratedCount: rated.length,
    averageRating: rated.length ? rated.reduce((sum, shader) => sum + shader.rating, 0) / rated.length : 0,
    topTags: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    generationDistribution: sessionShaders.reduce<Record<number, number>>((acc, shader) => {
      acc[shader.generation] = (acc[shader.generation] || 0) + 1;
      return acc;
    }, {}),
  };
}

export async function getStorageCapability(forceRefresh = false): Promise<StorageCapability> {
  if (capabilityCache && !forceRefresh) return capabilityCache;
  if (Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD)) {
    capabilityCache = {
      mode: 'static-export-only',
      ok: false,
      dbPath: '',
      message: 'Static session only; export bundles for permanence',
    };
    return capabilityCache;
  }
  try {
    const health = await request<{ ok: boolean; dbPath: string }>('/api/health');
    capabilityCache = {
      mode: 'local-file-db',
      ok: Boolean(health.ok),
      dbPath: health.dbPath,
      message: 'Local file database active',
    };
  } catch (error) {
    capabilityCache = {
      mode: isApiUnavailableError(error) ? 'static-export-only' : 'unavailable',
      ok: false,
      dbPath: '',
      message: isApiUnavailableError(error)
        ? 'Static session only; export bundles for permanence'
        : `Storage unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return capabilityCache;
}

export async function getFileDbHealth(): Promise<StorageCapability> {
  return getStorageCapability(true);
}

export async function saveShaderToFileDb(shader: Omit<StoredShader, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): Promise<StoredShader> {
  const capability = await getStorageCapability();
  if (capability.mode !== 'local-file-db') {
    const saved: StoredShader = {
      id: shader.id || generateId('session_shader'),
      timestamp: shader.timestamp || Date.now(),
      name: shader.name,
      code: shader.code,
      tags: [...new Set([...(shader.tags || []), 'session-only'])],
      thumbnail: shader.thumbnail,
      parentId: shader.parentId,
      generation: shader.generation || 0,
      rating: shader.rating || 0,
      metadata: shader.metadata || {},
    };
    const existingIndex = sessionShaders.findIndex(item => item.id === saved.id);
    if (existingIndex >= 0) sessionShaders[existingIndex] = saved;
    else sessionShaders.unshift(saved);
    return saved;
  }
  return request('/api/shaders', {
    method: 'POST',
    body: JSON.stringify(shader),
  });
}

export async function getFileDbShaders(limit = 100): Promise<StoredShader[]> {
  const capability = await getStorageCapability();
  if (capability.mode !== 'local-file-db') return sessionShaders.slice(0, limit);
  return request(`/api/shaders?limit=${limit}`);
}

export async function updateFileDbShaderRating(id: string, rating: number): Promise<void> {
  const capability = await getStorageCapability();
  if (capability.mode !== 'local-file-db') {
    const shader = sessionShaders.find(item => item.id === id);
    if (shader) shader.rating = rating;
    return;
  }
  await request(`/api/shaders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ rating }),
  });
}

export async function deleteFileDbShader(id: string): Promise<void> {
  const capability = await getStorageCapability();
  if (capability.mode !== 'local-file-db') {
    const index = sessionShaders.findIndex(item => item.id === id);
    if (index >= 0) sessionShaders.splice(index, 1);
    return;
  }
  await request(`/api/shaders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getFileDbStats(): Promise<ShaderStats> {
  const capability = await getStorageCapability();
  if (capability.mode !== 'local-file-db') return sessionStats();
  return request('/api/shader-stats');
}

export async function getFileDbTaste(): Promise<FileTasteSample[]> {
  const capability = await getStorageCapability();
  if (capability.mode !== 'local-file-db') return sessionTaste.slice(0, 120);
  return request('/api/taste');
}

export async function saveTasteToFileDb(sample: FileTasteSample): Promise<FileTasteSample> {
  const capability = await getStorageCapability();
  if (capability.mode !== 'local-file-db') {
    sessionTaste.unshift(sample);
    sessionTaste.splice(120);
    return sample;
  }
  return request('/api/taste', {
    method: 'POST',
    body: JSON.stringify(sample),
  });
}

export async function importShadersToFileDb(shaders: StoredShader[]): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  const existing = await getFileDbShaders(1000);
  const existingIds = new Set(existing.map(shader => shader.id));

  for (const shader of shaders) {
    if (existingIds.has(shader.id)) {
      skipped++;
      continue;
    }
    await saveShaderToFileDb({ ...shader, id: shader.id, timestamp: shader.timestamp });
    existingIds.add(shader.id);
    imported++;
  }

  return { imported, skipped };
}

export async function importTasteToFileDb(samples: FileTasteSample[]): Promise<number> {
  for (const sample of samples) {
    await saveTasteToFileDb(sample);
  }
  return samples.length;
}
