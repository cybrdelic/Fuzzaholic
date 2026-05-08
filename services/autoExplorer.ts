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
    const amateurPenalty = amateurPenaltyScore(code, features);
    const qualityGate = acceptanceGate(code, novelty, complexity, restraint, amateurPenalty);
    if (qualityGate <= 0) continue;
    const score = (
      novelty * 0.32
      + complexity * 0.18
      + restraint * 0.42
      + taste * 0.24
      + qualityGate * 0.20
      - repetitionPenalty * 0.28
      - amateurPenalty * 0.52
    );

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
    const fallbackCode = generateFreshShaderV2WithMode(clamp01(options.intensity * 0.7 + 0.2), seed + 99991, options.mode);
    return {
      code: fallbackCode,
      seed: seed + 99991,
      selectedIndex: 0,
      candidateCount,
      score: 0,
      novelty: 0,
      complexity: complexityScore(fallbackCode, extractFeatures(fallbackCode)),
      restraint: restraintScore(fallbackCode, extractFeatures(fallbackCode)),
      taste: 0,
    };
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
  const materialSignals = ['f_pal', 'mix', 'smoothstep', 'atan2', 'f_rot', 'dot', 'length']
    .filter(term => code.includes(term)).length;
  return clamp01(callKinds / 24 * 0.36 + swizzleKinds / 14 * 0.16 + lineBalance * 0.28 + materialSignals / 7 * 0.2);
}

function restraintScore(code: string, features: FeatureVector): number {
  const calls = [...features.keys()].filter(key => key.startsWith('call:')).length;
  const literals = [...features.keys()].filter(key => key.startsWith('num:')).length;
  const lengthBalance = bell(code.length, 5200, 3600);
  const vocabularyBalance = bell(calls + literals * 0.25, 18, 14);
  const hardClipPenalty = (code.match(/clamp|step|floor|fract/g) ?? []).length / 28;
  return clamp01(lengthBalance * 0.42 + vocabularyBalance * 0.36 + (1 - clamp01(hardClipPenalty)) * 0.22);
}

function acceptanceGate(
  code: string,
  novelty: number,
  complexity: number,
  restraint: number,
  amateurPenalty: number
): number {
  const hasSpatialMaterial = /f_rot|atan2|dot|length|smoothstep|mix/.test(code);
  const hasPaletteWork = /f_pal|vec3<f32>\([^)]*,[^)]*,[^)]*\)/.test(code);
  const tooShort = code.length < 1800;
  if (tooShort || !hasSpatialMaterial || !hasPaletteWork) return 0;
  if (complexity < 0.30 || restraint < 0.42 || novelty < 0.035) return 0;
  if (amateurPenalty > 0.52) return 0;
  return clamp01((complexity * 0.28 + restraint * 0.56 + novelty * 0.16) * (1 - amateurPenalty * 0.72));
}

function amateurPenaltyScore(code: string, features: FeatureVector): number {
  const count = (term: string) => code.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length ?? 0;
  const lineCount = code.split('\n').filter(line => line.trim()).length;
  const calls = [...features.keys()].filter(key => key.startsWith('call:')).length;
  const hardSteps = count('step') * 1.7 + count('floor') * 1.4 + count('fract');
  const trigSpam = count('sin') + count('cos');
  const paletteRepeat = Math.max(0, count('f_pal') - 5);
  const randomHash = count('f_hash');
  const lengthPenalty = code.length > 8200 ? (code.length - 8200) / 5000 : 0;
  const shortPenalty = code.length < 2200 ? (2200 - code.length) / 2200 : 0;
  const linePenalty = lineCount > 135 ? (lineCount - 135) / 80 : 0;
  const callPenalty = calls > 30 ? (calls - 30) / 26 : 0;
  return clamp01(
    hardSteps / 28 * 0.34
    + trigSpam / 46 * 0.20
    + randomHash / 8 * 0.16
    + paletteRepeat * 0.06
    + lengthPenalty * 0.22
    + shortPenalty * 0.28
    + linePenalty * 0.18
    + callPenalty * 0.16
  );
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
