import { getRecentShaders } from './shaderStorage';
import { generateFreshShaderV2WithMode, PipelineMode } from './v2Fuzzer';

export interface AutoExplorerOptions {
  intensity: number;
  mode: PipelineMode;
  currentCode: string;
  candidateCount?: number;
  archiveLimit?: number;
  seed?: number;
  likedCodes?: string[];
  dislikedCodes?: string[];
  tooSimilarCodes?: string[];
}

export interface AutoExplorerResult {
  code: string;
  seed: number;
  selectedIndex: number;
  candidateCount: number;
  score: number;
  novelty: number;
  complexity: number;
  restraint: number;
  taste: number;
}

type FeatureVector = Map<string, number>;

export async function generateAutoExplorationCandidate(
  options: AutoExplorerOptions
): Promise<AutoExplorerResult> {
  const seed = options.seed ?? Date.now();
  const candidateCount = options.candidateCount ?? 48;
  const archiveLimit = options.archiveLimit ?? 40;
  const archive = await getRecentShaders(archiveLimit).catch(() => []);
  const references = [options.currentCode, ...archive.map(shader => shader.code)]
    .filter(code => code.trim().length > 0)
    .map(extractFeatures);
  const liked = (options.likedCodes ?? []).map(extractFeatures);
  const disliked = (options.dislikedCodes ?? []).map(extractFeatures);
  const tooSimilar = (options.tooSimilarCodes ?? []).map(extractFeatures);

  let best: AutoExplorerResult | null = null;

  for (let i = 0; i < candidateCount; i++) {
    const sampleIntensity = clamp01(options.intensity + ((i % 9) - 4) * 0.035);
    const candidateSeed = seed + i * 104729;
    const code = generateFreshShaderV2WithMode(sampleIntensity, candidateSeed, options.mode);
    const features = extractFeatures(code);
    const novelty = references.length > 0
      ? references.reduce((min, ref) => Math.min(min, featureDistance(features, ref)), 1)
      : 1;
    const complexity = complexityScore(code, features);
    const restraint = restraintScore(code, features);
    const taste = tasteScore(features, liked, disliked, tooSimilar);
    const repetitionPenalty = repetitionScore(code);
    const score = novelty * 0.43 + complexity * 0.18 + restraint * 0.22 + taste * 0.32 - repetitionPenalty * 0.2;

    if (!best || score > best.score) {
      best = {
        code,
        seed: candidateSeed,
        selectedIndex: i,
        candidateCount,
        score,
        novelty,
        complexity,
        restraint,
        taste,
      };
    }
  }

  if (!best) {
    throw new Error('Auto explorer produced no candidates');
  }

  return best;
}

function tasteScore(
  features: FeatureVector,
  liked: FeatureVector[],
  disliked: FeatureVector[],
  tooSimilar: FeatureVector[]
): number {
  const likeAffinity = liked.length > 0
    ? liked.reduce((max, ref) => Math.max(max, 1 - featureDistance(features, ref)), 0)
    : 0.35;
  const dislikeAffinity = disliked.length > 0
    ? disliked.reduce((max, ref) => Math.max(max, 1 - featureDistance(features, ref)), 0)
    : 0;
  const similarityAffinity = tooSimilar.length > 0
    ? tooSimilar.reduce((max, ref) => Math.max(max, 1 - featureDistance(features, ref)), 0)
    : 0;

  return clamp01(0.45 + likeAffinity * 0.55 - dislikeAffinity * 0.42 - similarityAffinity * 0.65);
}

function extractFeatures(code: string): FeatureVector {
  const features: FeatureVector = new Map();
  const add = (key: string, amount = 1) => features.set(key, (features.get(key) ?? 0) + amount);

  for (const [, name] of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    if (!name.startsWith('vec') && !name.startsWith('mat')) add(`call:${name}`);
  }

  for (const [, swizzle] of code.matchAll(/\.([xyzwrgba]{1,4})\b/g)) {
    add(`swizzle:${swizzle}`);
  }

  for (const op of ['+', '-', '*', '/', '<', '>', '=']) {
    add(`op:${op}`, (code.match(new RegExp(`\\${op}`, 'g')) ?? []).length);
  }

  for (const [, literal] of code.matchAll(/\b\d+\.\d+\b/g)) {
    const bucket = Math.floor(Number(literal) * 4);
    add(`num:${bucket}`);
  }

  return features;
}

function featureDistance(a: FeatureVector, b: FeatureVector): number {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let dot = 0;
  let aMag = 0;
  let bMag = 0;

  for (const key of keys) {
    const av = a.get(key) ?? 0;
    const bv = b.get(key) ?? 0;
    dot += av * bv;
    aMag += av * av;
    bMag += bv * bv;
  }

  if (aMag === 0 || bMag === 0) return 1;
  return 1 - dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function complexityScore(code: string, features: FeatureVector): number {
  const callKinds = [...features.keys()].filter(key => key.startsWith('call:')).length;
  const swizzleKinds = [...features.keys()].filter(key => key.startsWith('swizzle:')).length;
  const lineCount = code.split('\n').filter(line => line.trim().length > 0).length;
  const lineBalance = bell(lineCount, 72, 58);
  return clamp01(callKinds / 22 * 0.45 + swizzleKinds / 14 * 0.2 + lineBalance * 0.35);
}

function restraintScore(code: string, features: FeatureVector): number {
  const calls = [...features.keys()].filter(key => key.startsWith('call:')).length;
  const literals = [...features.keys()].filter(key => key.startsWith('num:')).length;
  const lengthBalance = bell(code.length, 5200, 3600);
  const vocabularyBalance = bell(calls + literals * 0.25, 18, 14);
  const hardClipPenalty = (code.match(/clamp|step|floor|fract/g) ?? []).length / 42;
  return clamp01(lengthBalance * 0.48 + vocabularyBalance * 0.42 + (1 - clamp01(hardClipPenalty)) * 0.1);
}

function repetitionScore(code: string): number {
  const calls = [...code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(match => match[1]);
  if (calls.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const call of calls) counts.set(call, (counts.get(call) ?? 0) + 1);
  const maxShare = Math.max(...counts.values()) / calls.length;
  return clamp01((maxShare - 0.22) / 0.45);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function bell(value: number, center: number, width: number): number {
  return Math.exp(-Math.pow((value - center) / width, 2));
}
