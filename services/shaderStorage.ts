/**
 * SHADER STORAGE SERVICE
 *
 * Persists shaders to IndexedDB for permanent storage.
 * Also provides export/import functionality.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StoredShader {
  id: string;
  name: string;
  code: string;
  timestamp: number;
  tags: string[];
  thumbnail?: string;      // Base64 encoded screenshot
  parentId?: string;       // ID of shader this was mutated from
  generation: number;      // How many mutations from original
  rating: number;          // User rating 1-5, 0 = unrated
  metadata: {
    equation?: string;     // Math equation used to generate
    palette?: string;      // Color palette name
    intensity?: number;    // Mutation intensity used
  };
}

export interface ShaderCollection {
  id: string;
  name: string;
  description: string;
  shaderIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// INDEXEDDB SETUP
// ============================================================================

const DB_NAME = 'FuzzaholicDB';
const DB_VERSION = 1;
const SHADER_STORE = 'shaders';
const COLLECTION_STORE = 'collections';

let db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Shaders store
      if (!database.objectStoreNames.contains(SHADER_STORE)) {
        const shaderStore = database.createObjectStore(SHADER_STORE, { keyPath: 'id' });
        shaderStore.createIndex('timestamp', 'timestamp', { unique: false });
        shaderStore.createIndex('rating', 'rating', { unique: false });
        shaderStore.createIndex('name', 'name', { unique: false });
        shaderStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      }

      // Collections store
      if (!database.objectStoreNames.contains(COLLECTION_STORE)) {
        const collectionStore = database.createObjectStore(COLLECTION_STORE, { keyPath: 'id' });
        collectionStore.createIndex('name', 'name', { unique: false });
        collectionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

// ============================================================================
// SHADER CRUD OPERATIONS
// ============================================================================

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `shader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Save a new shader
 */
export async function saveShader(shader: Omit<StoredShader, 'id' | 'timestamp'>): Promise<StoredShader> {
  const database = await openDB();

  const fullShader: StoredShader = {
    ...shader,
    id: generateId(),
    timestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SHADER_STORE], 'readwrite');
    const store = transaction.objectStore(SHADER_STORE);
    const request = store.add(fullShader);

    request.onsuccess = () => resolve(fullShader);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update an existing shader
 */
export async function updateShader(shader: StoredShader): Promise<StoredShader> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SHADER_STORE], 'readwrite');
    const store = transaction.objectStore(SHADER_STORE);
    const request = store.put(shader);

    request.onsuccess = () => resolve(shader);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a shader by ID
 */
export async function getShader(id: string): Promise<StoredShader | null> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SHADER_STORE], 'readonly');
    const store = transaction.objectStore(SHADER_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a shader
 */
export async function deleteShader(id: string): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SHADER_STORE], 'readwrite');
    const store = transaction.objectStore(SHADER_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all shaders
 */
export async function getAllShaders(): Promise<StoredShader[]> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SHADER_STORE], 'readonly');
    const store = transaction.objectStore(SHADER_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get shaders sorted by timestamp (newest first)
 */
export async function getRecentShaders(limit: number = 50): Promise<StoredShader[]> {
  const all = await getAllShaders();
  return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

/**
 * Get top-rated shaders
 */
export async function getTopRatedShaders(limit: number = 50): Promise<StoredShader[]> {
  const all = await getAllShaders();
  return all
    .filter(s => s.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
}

/**
 * Search shaders by name or tags
 */
export async function searchShaders(query: string): Promise<StoredShader[]> {
  const all = await getAllShaders();
  const lowerQuery = query.toLowerCase();

  return all.filter(shader =>
    shader.name.toLowerCase().includes(lowerQuery) ||
    shader.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
    shader.metadata.equation?.toLowerCase().includes(lowerQuery) ||
    shader.metadata.palette?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get shader count
 */
export async function getShaderCount(): Promise<number> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SHADER_STORE], 'readonly');
    const store = transaction.objectStore(SHADER_STORE);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// COLLECTION OPERATIONS
// ============================================================================

/**
 * Create a new collection
 */
export async function createCollection(name: string, description: string = ''): Promise<ShaderCollection> {
  const database = await openDB();

  const collection: ShaderCollection = {
    id: `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    shaderIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([COLLECTION_STORE], 'readwrite');
    const store = transaction.objectStore(COLLECTION_STORE);
    const request = store.add(collection);

    request.onsuccess = () => resolve(collection);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add shader to collection
 */
export async function addToCollection(collectionId: string, shaderId: string): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([COLLECTION_STORE], 'readwrite');
    const store = transaction.objectStore(COLLECTION_STORE);
    const getRequest = store.get(collectionId);

    getRequest.onsuccess = () => {
      const collection = getRequest.result as ShaderCollection;
      if (!collection) {
        reject(new Error('Collection not found'));
        return;
      }

      if (!collection.shaderIds.includes(shaderId)) {
        collection.shaderIds.push(shaderId);
        collection.updatedAt = Date.now();
        store.put(collection);
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Get all collections
 */
export async function getAllCollections(): Promise<ShaderCollection[]> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([COLLECTION_STORE], 'readonly');
    const store = transaction.objectStore(COLLECTION_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// EXPORT / IMPORT
// ============================================================================

/**
 * Export all shaders as JSON
 */
export async function exportAllShaders(): Promise<string> {
  const shaders = await getAllShaders();
  const collections = await getAllCollections();

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    shaders,
    collections,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export a single shader as a .wgsl file
 */
export function exportShaderAsWGSL(shader: StoredShader): string {
  const header = `// Shader: ${shader.name}
// Created: ${new Date(shader.timestamp).toISOString()}
// Tags: ${shader.tags.join(', ')}
// Rating: ${shader.rating}/5
// Generation: ${shader.generation}
${shader.metadata.equation ? `// Equation: ${shader.metadata.equation}` : ''}
${shader.metadata.palette ? `// Palette: ${shader.metadata.palette}` : ''}

`;
  return header + shader.code;
}

/**
 * Import shaders from JSON export
 */
export async function importShaders(jsonData: string): Promise<{ imported: number; skipped: number }> {
  const data = JSON.parse(jsonData);

  if (!data.shaders || !Array.isArray(data.shaders)) {
    throw new Error('Invalid import data format');
  }

  let imported = 0;
  let skipped = 0;

  for (const shader of data.shaders) {
    try {
      // Check if shader with same ID already exists
      const existing = await getShader(shader.id);
      if (existing) {
        skipped++;
        continue;
      }

      await saveShader({
        name: shader.name,
        code: shader.code,
        tags: shader.tags || [],
        thumbnail: shader.thumbnail,
        parentId: shader.parentId,
        generation: shader.generation || 0,
        rating: shader.rating || 0,
        metadata: shader.metadata || {},
      });
      imported++;
    } catch (e) {
      console.error('Failed to import shader:', e);
      skipped++;
    }
  }

  return { imported, skipped };
}

/**
 * Download shaders as a JSON file
 */
export async function downloadShadersAsJSON(): Promise<void> {
  const json = await exportAllShaders();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `fuzzaholic-shaders-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download a single shader as .wgsl file
 */
export function downloadShaderAsWGSL(shader: StoredShader): void {
  const wgsl = exportShaderAsWGSL(shader);
  const blob = new Blob([wgsl], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const safeName = shader.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.wgsl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// THUMBNAIL CAPTURE
// ============================================================================

/**
 * Capture a thumbnail from a canvas element
 */
export function captureThumbnail(canvas: HTMLCanvasElement, size: number = 256): string {
  // Create a smaller canvas for the thumbnail
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = size;
  thumbCanvas.height = size;
  const ctx = thumbCanvas.getContext('2d');

  if (!ctx) return '';

  // Draw scaled image
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, size, size);

  // Return as base64 JPEG (smaller than PNG)
  return thumbCanvas.toDataURL('image/jpeg', 0.7);
}

// ============================================================================
// AUTO-SAVE FAVORITES
// ============================================================================

const FAVORITES_COLLECTION_NAME = 'Favorites';
let favoritesCollectionId: string | null = null;

/**
 * Get or create the favorites collection
 */
async function getFavoritesCollection(): Promise<ShaderCollection> {
  if (favoritesCollectionId) {
    const collections = await getAllCollections();
    const existing = collections.find(c => c.id === favoritesCollectionId);
    if (existing) return existing;
  }

  const collections = await getAllCollections();
  const favorites = collections.find(c => c.name === FAVORITES_COLLECTION_NAME);

  if (favorites) {
    favoritesCollectionId = favorites.id;
    return favorites;
  }

  const newFavorites = await createCollection(FAVORITES_COLLECTION_NAME, 'Your favorite shaders');
  favoritesCollectionId = newFavorites.id;
  return newFavorites;
}

/**
 * Add shader to favorites
 */
export async function addToFavorites(shaderId: string): Promise<void> {
  const favorites = await getFavoritesCollection();
  await addToCollection(favorites.id, shaderId);
}

/**
 * Quick save the current shader
 */
export async function quickSaveShader(
  code: string,
  options: {
    name?: string;
    tags?: string[];
    parentId?: string;
    generation?: number;
    equation?: string;
    palette?: string;
    intensity?: number;
    thumbnail?: string;
  } = {}
): Promise<StoredShader> {
  const count = await getShaderCount();

  return saveShader({
    name: options.name || `Shader #${count + 1}`,
    code,
    tags: options.tags || [],
    thumbnail: options.thumbnail,
    parentId: options.parentId,
    generation: options.generation || 0,
    rating: 0,
    metadata: {
      equation: options.equation,
      palette: options.palette,
      intensity: options.intensity,
    },
  });
}

// ============================================================================
// STATISTICS
// ============================================================================

export interface ShaderStats {
  totalCount: number;
  ratedCount: number;
  averageRating: number;
  topTags: Array<{ tag: string; count: number }>;
  generationDistribution: Record<number, number>;
}

/**
 * Get statistics about stored shaders
 */
export async function getShaderStats(): Promise<ShaderStats> {
  const shaders = await getAllShaders();

  const rated = shaders.filter(s => s.rating > 0);
  const avgRating = rated.length > 0
    ? rated.reduce((sum, s) => sum + s.rating, 0) / rated.length
    : 0;

  // Count tags
  const tagCounts: Record<string, number> = {};
  for (const shader of shaders) {
    for (const tag of shader.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const topTags = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Generation distribution
  const genDist: Record<number, number> = {};
  for (const shader of shaders) {
    genDist[shader.generation] = (genDist[shader.generation] || 0) + 1;
  }

  return {
    totalCount: shaders.length,
    ratedCount: rated.length,
    averageRating: avgRating,
    topTags,
    generationDistribution: genDist,
  };
}
