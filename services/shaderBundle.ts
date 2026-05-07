import { StoredShader } from './shaderStorage';
import { FileTasteSample } from './fileShaderDb';

export const FUZZAHOLIC_BUNDLE_VERSION = 1;

export interface FuzzaholicBundle {
  app: 'fuzzaholic';
  version: number;
  exportedAt: string;
  shaders: StoredShader[];
  tasteSamples: FileTasteSample[];
  metadata: {
    source: 'local-file-db' | 'static-session' | 'unknown';
    note?: string;
  };
}

export function createFuzzaholicBundle(
  shaders: StoredShader[],
  tasteSamples: FileTasteSample[],
  source: FuzzaholicBundle['metadata']['source']
): FuzzaholicBundle {
  return {
    app: 'fuzzaholic',
    version: FUZZAHOLIC_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    shaders,
    tasteSamples,
    metadata: {
      source,
      note: source === 'static-session'
        ? 'Static session data is not permanent until imported into the local file database.'
        : undefined,
    },
  };
}

export function parseFuzzaholicBundle(raw: string): FuzzaholicBundle {
  const value = JSON.parse(raw) as Partial<FuzzaholicBundle>;
  if (value.app !== 'fuzzaholic') {
    throw new Error('Not a Fuzzaholic bundle.');
  }
  if (value.version !== FUZZAHOLIC_BUNDLE_VERSION) {
    throw new Error(`Unsupported Fuzzaholic bundle version: ${value.version ?? 'missing'}.`);
  }
  if (!Array.isArray(value.shaders) || !Array.isArray(value.tasteSamples)) {
    throw new Error('Bundle must include shaders and tasteSamples arrays.');
  }
  for (const shader of value.shaders) {
    if (!shader || typeof shader.id !== 'string' || typeof shader.code !== 'string' || typeof shader.name !== 'string') {
      throw new Error('Bundle contains an invalid shader entry.');
    }
  }
  for (const sample of value.tasteSamples) {
    if (!sample || typeof sample.code !== 'string' || !['liked', 'disliked', 'tooSimilar'].includes(String(sample.label))) {
      throw new Error('Bundle contains an invalid taste sample.');
    }
  }
  return value as FuzzaholicBundle;
}

export function downloadText(filename: string, content: string, type = 'application/json'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function bundleFilename(): string {
  return `fuzzaholic-bundle-${new Date().toISOString().slice(0, 10)}.json`;
}
