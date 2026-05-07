import { StoredShader, ShaderStats } from './shaderStorage';
import { FuzzMode } from '../types';

export type TasteLabel = 'liked' | 'disliked' | 'tooSimilar';

export interface FileTasteSample {
  code: string;
  label: TasteLabel;
  mode: FuzzMode;
  timestamp: number;
}

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

export async function getFileDbHealth(): Promise<{ ok: boolean; dbPath: string }> {
  return request('/api/health');
}

export async function saveShaderToFileDb(shader: Omit<StoredShader, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): Promise<StoredShader> {
  return request('/api/shaders', {
    method: 'POST',
    body: JSON.stringify(shader),
  });
}

export async function getFileDbShaders(limit = 100): Promise<StoredShader[]> {
  return request(`/api/shaders?limit=${limit}`);
}

export async function updateFileDbShaderRating(id: string, rating: number): Promise<void> {
  await request(`/api/shaders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ rating }),
  });
}

export async function deleteFileDbShader(id: string): Promise<void> {
  await request(`/api/shaders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getFileDbStats(): Promise<ShaderStats> {
  return request('/api/shader-stats');
}

export async function getFileDbTaste(): Promise<FileTasteSample[]> {
  return request('/api/taste');
}

export async function saveTasteToFileDb(sample: FileTasteSample): Promise<FileTasteSample> {
  return request('/api/taste', {
    method: 'POST',
    body: JSON.stringify(sample),
  });
}
