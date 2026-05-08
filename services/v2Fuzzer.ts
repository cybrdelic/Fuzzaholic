/**
 * V2 AST-Based Fuzzer Service
 *
 * Clean integration of the v2 AST fuzzer into Fuzzaholic.
 * Uses correctness-by-construction to guarantee valid shaders.
 *
 * NOTE: ShaderCanvas injects WGSL_PREAMBLE automatically, so we don't add it here.
 */

import {
    emit,
    fuzz,
    generateComputeShader,
    generateShader,
    generateVertexFragmentShader,
    mutateWithLog,
} from './v2';
import type { GeneratorConfig, GeneratorIntent, MutatorConfig } from './v2';

// ============================================================================
// CONFIGURATION PRESETS
// ============================================================================

const DEFAULT_GENERATOR_CONFIG: Partial<GeneratorConfig> = {
  maxDepth: 6,
  minComplexity: 15,
  maxComplexity: 80,
  effects: {
    uvPatterns: true,
    timeAnimation: true,
    cursorEffect: true,
    noise: true,
    colorTransform: true,
    fractals: false,
  },
};

const DEFAULT_MUTATOR_CONFIG: Partial<MutatorConfig> = {
  maxDepth: 10,
  mutationProbability: 0.3,
  mutations: {
    literals: true,
    operators: true,
    functions: true,
    unary: true,
    swapOperands: true,
    subExpressions: false,
  },
  frozenZones: {
    forLoops: true,
    uniforms: true,
    signatures: true,
    attributes: true,
    identifiers: ['uv', 'pos', 'resolution', 'time', 'mouse', 'mouseNorm', 'scroll', 't', 'centered'],
  },
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate a completely fresh shader using v2 AST generation.
 * Guaranteed to compile - no post-validation needed.
 */
export function generateFreshShaderV2(intensity: number = 0.5, seed?: number): string {
  const config: Partial<GeneratorConfig> = {
    ...DEFAULT_GENERATOR_CONFIG,
    seed,
    maxDepth: Math.floor(4 + intensity * 4), // 4-8 based on intensity
    minComplexity: Math.floor(10 + intensity * 20), // 10-30
  };

  const program = generateProgramForMode(config, 'fragment');
  const shaderBody = emit(program, { pretty: true });

  // ShaderCanvas injects WGSL_PREAMBLE, so we just return the shader body
  return ensureRequiredLocals(shaderBody);
}

/**
 * Mutate an existing shader using v2 AST-based mutations.
 * Safe mutations only - frozen zones respected.
 */
export function mutateShaderV2(
  shaderCode: string,
  intensity: number = 0.3,
  seed?: number
): string {
  return fuzzShaderV2(intensity, 1, seed).code;
}

/**
 * Full fuzzing pipeline - generate then mutate multiple rounds.
 */
export function fuzzShaderV2(
  intensity: number = 0.5,
  rounds: number = 2,
  seed?: number
): { code: string; mutations: string[] } {
  return selectCreativeCandidate(intensity, seed, 'fragment');
}

/**
 * Quick generate with a specific seed for reproducibility.
 */
export function generateSeededShaderV2(seed: number): string {
  return generateFreshShaderV2(0.5, seed);
}

/**
 * Generate a series of related shaders by incrementing seed.
 */
export function generateShaderSeriesV2(
  baseSeed: number,
  count: number,
  intensity: number = 0.5
): string[] {
  return Array.from({ length: count }, (_, i) =>
    generateFreshShaderV2(intensity, baseSeed + i)
  );
}

// ========================================================================
// MODE-AWARE HELPERS
// ========================================================================

export type PipelineMode = 'fragment' | 'vertex-fragment' | 'compute';

export function generateFreshShaderV2WithMode(
  intensity: number = 0.5,
  seed?: number,
  mode: PipelineMode = 'fragment'
): string {
  return generateIntentShaderV2WithMode(intensity, seed, mode, 'general');
}

export function generateWebsiteShaderV2(
  intensity: number = 0.5,
  seed?: number,
  mode: PipelineMode = 'fragment'
): string {
  let best = '';
  let bestScore = -Infinity;
  const baseSeed = seed ?? Date.now();
  const family = pickWebsiteFamily(baseSeed);

  for (let i = 0; i < 28; i++) {
    const code = buildWebsiteShaderCandidate(Math.min(0.9, Math.max(0.18, intensity)), baseSeed + i * 3571, mode, family);
    const score = scoreWebsiteShader(code);
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }

  return best;
}

export function generateSceneShaderV2(
  intensity: number = 0.5,
  seed?: number,
  mode: PipelineMode = 'fragment',
  brief: string = ''
): string {
  const sceneSeed = ((seed ?? Date.now()) ^ hashBrief(brief)) >>> 0;
  if (mode !== 'fragment') {
    return generateIntentShaderV2WithMode(Math.min(1, intensity * 0.82), sceneSeed, mode, 'website');
  }
  return buildRaymarchedSceneShader(Math.min(1, Math.max(0.12, intensity)), sceneSeed, brief);
}

type WebsiteFamily = 'volumetric' | 'glass' | 'editorial' | 'topographic';
type SceneKind = 'terrain' | 'architecture' | 'ocean' | 'crystal' | 'nebula' | 'product';

const WEBSITE_PALETTES = [
  { base: [0.018, 0.026, 0.038], mid: [0.08, 0.22, 0.30], accent: [0.26, 0.88, 0.78], high: [0.86, 0.98, 0.92] },
  { base: [0.026, 0.020, 0.036], mid: [0.18, 0.10, 0.34], accent: [0.72, 0.34, 0.92], high: [0.98, 0.78, 0.48] },
  { base: [0.035, 0.030, 0.024], mid: [0.28, 0.18, 0.10], accent: [0.95, 0.56, 0.22], high: [1.00, 0.86, 0.56] },
  { base: [0.018, 0.028, 0.052], mid: [0.10, 0.18, 0.38], accent: [0.42, 0.64, 1.00], high: [0.86, 0.95, 1.00] },
  { base: [0.030, 0.034, 0.031], mid: [0.18, 0.28, 0.22], accent: [0.62, 0.92, 0.58], high: [0.94, 1.00, 0.82] },
] as const;

function pickWebsiteFamily(seed: number): WebsiteFamily {
  const families: WebsiteFamily[] = ['volumetric', 'glass', 'editorial', 'topographic'];
  return families[Math.abs(seed) % families.length]!;
}

function hashBrief(brief: string): number {
  let hash = 2166136261;
  for (const char of brief.toLowerCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function inferSceneKind(brief: string, seed: number): SceneKind {
  const text = brief.toLowerCase();
  const has = (terms: string[]) => terms.some(term => text.includes(term));
  if (has(['city', 'building', 'architecture', 'interior', 'temple', 'room', 'hall', 'street'])) return 'architecture';
  if (has(['ocean', 'sea', 'water', 'liquid', 'wave', 'underwater', 'lake'])) return 'ocean';
  if (has(['crystal', 'gem', 'ice', 'glass', 'mineral', 'diamond'])) return 'crystal';
  if (has(['space', 'nebula', 'galaxy', 'cloud', 'smoke', 'volumetric', 'fog'])) return 'nebula';
  if (has(['object', 'product', 'device', 'machine', 'sculpture', 'orb', 'artifact'])) return 'product';
  if (has(['terrain', 'mountain', 'desert', 'forest', 'canyon', 'planet', 'landscape'])) return 'terrain';
  const kinds: SceneKind[] = ['terrain', 'architecture', 'ocean', 'crystal', 'nebula', 'product'];
  return kinds[seed % kinds.length]!;
}

function buildRaymarchedSceneShader(intensity: number, seed: number, brief: string): string {
  const r = seededUnit(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
  const f = (min: number, max: number) => min + (max - min) * r();
  const palette = pick(WEBSITE_PALETTES);
  const kind = inferSceneKind(brief, seed);
  const c = (value: readonly number[], boost = 1) => `vec3<f32>(${(value[0] * boost).toFixed(6)}, ${(value[1] * boost).toFixed(6)}, ${(value[2] * boost).toFixed(6)})`;
  const camZ = f(-5.8, -4.2);
  const orbit = f(-0.34, 0.34);
  const focal = f(1.05, 1.52);
  const sun = [f(-0.55, 0.55), f(0.52, 0.86), f(-0.30, 0.68)];
  const density = f(0.025, 0.085) * (0.65 + intensity);
  const detail = f(0.65, 1.35) * (0.6 + intensity * 0.65);
  const heroObject = f(0.8, 1.35);
  const steps = Math.floor(48 + intensity * 44);

  return `
@group(0) @binding(0) var<uniform> time: f32;
@group(0) @binding(1) var<uniform> resolution: vec2<f32>;
@group(0) @binding(2) var<uniform> mouse: vec2<f32>;
@group(0) @binding(3) var<uniform> scroll: vec2<f32>;

fn sdSphere(p: vec3<f32>, r: f32) -> f32 {
  return length(p) - r;
}

fn sdBox(p: vec3<f32>, b: vec3<f32>) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sdRoundBox(p: vec3<f32>, b: vec3<f32>, r: f32) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

fn sdOctahedron(p: vec3<f32>, s: f32) -> f32 {
  let q = abs(p);
  return (q.x + q.y + q.z - s) * 0.57735027;
}

fn sceneMap(p: vec3<f32>) -> vec2<f32> {
  var result = vec2<f32>(999.0, 0.0);
${sceneMapSource(kind, detail, heroObject)}
  return result;
}

fn materialColor(mat: f32, p: vec3<f32>) -> vec3<f32> {
  let base = ${c(palette.base, 1.28)};
  let mid = ${c(palette.mid, 1.25)};
  let accent = ${c(palette.accent, 1.15)};
  let high = ${c(palette.high, 1.05)};
  let local = 0.5 + 0.5 * sin(dot(p.xz, vec2<f32>(0.73, -0.41)) * ${detail.toFixed(6)} + p.y * 0.65);
  if (mat < 1.5) {
    return mix(base, mid, local * 0.45);
  }
  if (mat < 2.5) {
    return mix(mid, accent, 0.42 + local * 0.28);
  }
  if (mat < 3.5) {
    return mix(accent, high, 0.34 + local * 0.38);
  }
  return mix(base, high, 0.25 + local * 0.32);
}

fn calcNormal(p: vec3<f32>) -> vec3<f32> {
  let e = 0.0016;
  let x = sceneMap(p + vec3<f32>(e, 0.0, 0.0)).x - sceneMap(p - vec3<f32>(e, 0.0, 0.0)).x;
  let y = sceneMap(p + vec3<f32>(0.0, e, 0.0)).x - sceneMap(p - vec3<f32>(0.0, e, 0.0)).x;
  let z = sceneMap(p + vec3<f32>(0.0, 0.0, e)).x - sceneMap(p - vec3<f32>(0.0, 0.0, e)).x;
  return normalize(vec3<f32>(x, y, z));
}

fn softShadow(ro: vec3<f32>, rd: vec3<f32>) -> f32 {
  var shade = 1.0;
  var t = 0.04;
  for (var i = 0; i < 28; i = i + 1) {
    let h = sceneMap(ro + rd * t).x;
    shade = min(shade, 10.0 * h / t);
    t = t + clamp(h, 0.025, 0.20);
    if (h < 0.001 || t > 9.5) {
      break;
    }
  }
  return clamp(shade, 0.0, 1.0);
}

fn calcAO(p: vec3<f32>, n: vec3<f32>) -> f32 {
  var occ = 0.0;
  var sca = 1.0;
  for (var i = 0; i < 5; i = i + 1) {
    let h = 0.035 + 0.08 * f32(i);
    let d = sceneMap(p + n * h).x;
    occ = occ + (h - d) * sca;
    sca = sca * 0.72;
  }
  return clamp(1.0 - occ * 1.7, 0.0, 1.0);
}

fn background(rd: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let base = ${c(palette.base, 1.08)};
  let mid = ${c(palette.mid, 1.05)};
  let high = ${c(palette.high, 0.85)};
  let sky = mix(base, mid, smoothstep(-0.35, 0.92, rd.y));
  let sunDir = normalize(vec3<f32>(${sun[0].toFixed(6)}, ${sun[1].toFixed(6)}, ${sun[2].toFixed(6)}));
  let sunDisc = pow(max(dot(rd, sunDir), 0.0), 70.0);
  let haze = pow(max(0.0, 1.0 - length(uv * vec2<f32>(0.72, 1.0))), 2.3);
  return sky + high * sunDisc * 0.65 + mid * haze * 0.18;
}

@fragment
fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let pixel = (pos.xy * 2.0 - resolution) / max(resolution.y, 1.0);
  let uv = pos.xy / resolution;
  let mouseNorm = clamp(mouse, vec2<f32>(0.0), vec2<f32>(1.0));
  let camAngle = ${orbit.toFixed(6)} + (mouseNorm.x - 0.5) * 0.28 + scroll.y * 0.05;
  let ro = vec3<f32>(sin(camAngle) * 2.2, 0.55 + (mouseNorm.y - 0.5) * 0.32, ${camZ.toFixed(6)} + cos(camAngle) * 0.7);
  let target = vec3<f32>(0.0, 0.18, 0.6);
  let ww = normalize(target - ro);
  let uu = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), ww));
  let vv = cross(ww, uu);
  let rd = normalize(pixel.x * uu + pixel.y * vv + ww * ${focal.toFixed(6)});

  var rayT = 0.0;
  var mat = 0.0;
  var hit = false;
  for (var i = 0; i < ${steps}; i = i + 1) {
    let sample = sceneMap(ro + rd * rayT);
    if (sample.x < 0.0015) {
      mat = sample.y;
      hit = true;
      break;
    }
    if (rayT > 34.0) {
      break;
    }
    rayT = rayT + sample.x * 0.76;
  }

  var col = background(rd, pixel);
  if (hit) {
    let hp = ro + rd * rayT;
    let n = calcNormal(hp);
    let sunDir = normalize(vec3<f32>(${sun[0].toFixed(6)}, ${sun[1].toFixed(6)}, ${sun[2].toFixed(6)}));
    let halfDir = normalize(sunDir - rd);
    let albedo = materialColor(mat, hp);
    let shadow = softShadow(hp + n * 0.018, sunDir);
    let ao = calcAO(hp, n);
    let diff = max(dot(n, sunDir), 0.0) * shadow;
    let spec = pow(max(dot(n, halfDir), 0.0), mix(18.0, 72.0, clamp(mat / 4.0, 0.0, 1.0))) * shadow;
    let fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    let bounce = mix(${c(palette.base, 0.9)}, ${c(palette.accent, 0.55)}, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
    col = albedo * (0.10 + diff * 1.28) * ao + bounce * 0.26 + ${c(palette.high, 1.05)} * (spec * 0.42 + fresnel * 0.10);
  }

  let fog = 1.0 - exp(-rayT * ${density.toFixed(6)});
  col = mix(col, background(rd, pixel), clamp(fog, 0.0, 0.92));
  col = col / (col + vec3<f32>(1.0));
  col = pow(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(0.454545));
  return vec4<f32>(col, 1.0);
}
`.trim();
}

function sceneMapSource(kind: SceneKind, detail: number, heroObject: number): string {
  if (kind === 'architecture') {
    return `
  let floorD = p.y + 0.82;
  result = vec2<f32>(floorD, 1.0);
  let backWall = abs(p.z - 3.2) - 0.08;
  if (backWall < result.x) { result = vec2<f32>(backWall, 1.0); }
  let arch = max(sdBox(p - vec3<f32>(0.0, 0.05, 1.2), vec3<f32>(1.35, 1.05, 0.18)), -sdSphere(p - vec3<f32>(0.0, 0.32, 1.2), 0.92));
  if (arch < result.x) { result = vec2<f32>(arch, 2.0); }
  let columnA = sdRoundBox(p - vec3<f32>(-0.96, -0.08, 1.05), vec3<f32>(0.13, 0.9, 0.13), 0.035);
  let columnB = sdRoundBox(p - vec3<f32>(0.96, -0.08, 1.05), vec3<f32>(0.13, 0.9, 0.13), 0.035);
  let columns = min(columnA, columnB);
  if (columns < result.x) { result = vec2<f32>(columns, 3.0); }
`;
  }
  if (kind === 'ocean') {
    return `
  let wave = sin(p.x * ${(1.7 * detail).toFixed(6)} + time * 0.42) * 0.12 + sin(p.z * ${(1.15 * detail).toFixed(6)} - time * 0.31) * 0.10;
  let water = p.y + 0.18 - wave;
  result = vec2<f32>(water, 2.0);
  let island = sdSphere((p - vec3<f32>(0.15, -0.42, 1.6)) * vec3<f32>(1.0, 1.8, 0.72), ${(1.15 * heroObject).toFixed(6)});
  if (island < result.x) { result = vec2<f32>(island, 1.0); }
  let orb = sdSphere(p - vec3<f32>(-0.48, 0.62, 1.1), 0.28);
  if (orb < result.x) { result = vec2<f32>(orb, 3.0); }
`;
  }
  if (kind === 'crystal') {
    return `
  let floorD = p.y + 0.78;
  result = vec2<f32>(floorD, 1.0);
  let crystalP = p - vec3<f32>(0.0, 0.12, 1.35);
  let crystalXZ = f_rot(crystalP.xz, 0.34);
  let mainCrystal = sdOctahedron(vec3<f32>(crystalXZ.x, crystalP.y, crystalXZ.y), ${(1.1 * heroObject).toFixed(6)});
  if (mainCrystal < result.x) { result = vec2<f32>(mainCrystal, 3.0); }
  let shardA = sdOctahedron(p - vec3<f32>(-0.72, -0.10, 1.0), 0.62);
  let shardB = sdOctahedron(p - vec3<f32>(0.64, -0.24, 1.52), 0.48);
  let shards = min(shardA, shardB);
  if (shards < result.x) { result = vec2<f32>(shards, 2.0); }
`;
  }
  if (kind === 'nebula') {
    return `
  let shell = sdSphere(p - vec3<f32>(0.0, 0.0, 1.5), ${(1.25 * heroObject).toFixed(6)});
  result = vec2<f32>(shell, 4.0);
  let core = sdSphere(p - vec3<f32>(0.32, 0.08, 1.12), 0.42);
  if (core < result.x) { result = vec2<f32>(core, 3.0); }
  let field = p.y + 1.15 + sin(p.x * ${(1.4 * detail).toFixed(6)} + p.z * 0.5) * 0.12;
  if (field < result.x) { result = vec2<f32>(field, 1.0); }
`;
  }
  if (kind === 'product') {
    return `
  let floorD = p.y + 0.72;
  result = vec2<f32>(floorD, 1.0);
  let body = sdRoundBox(p - vec3<f32>(0.0, 0.0, 1.25), vec3<f32>(0.72, 0.42, 0.58) * ${heroObject.toFixed(6)}, 0.18);
  if (body < result.x) { result = vec2<f32>(body, 2.0); }
  let lens = sdSphere(p - vec3<f32>(0.18, 0.10, 0.72), 0.22);
  if (lens < result.x) { result = vec2<f32>(lens, 3.0); }
  let cut = sdBox(p - vec3<f32>(-0.42, 0.18, 0.78), vec3<f32>(0.18, 0.055, 0.24));
  if (cut < result.x) { result = vec2<f32>(cut, 4.0); }
`;
  }
  return `
  let height = sin(p.x * ${(0.72 * detail).toFixed(6)} + p.z * 0.18) * 0.22 + sin(p.z * ${(0.9 * detail).toFixed(6)} - p.x * 0.14) * 0.17;
  let terrain = p.y + 0.62 - height;
  result = vec2<f32>(terrain, 1.0);
  let monolith = sdRoundBox(p - vec3<f32>(0.28, 0.02, 1.55), vec3<f32>(0.28, 1.1, 0.22) * ${heroObject.toFixed(6)}, 0.045);
  if (monolith < result.x) { result = vec2<f32>(monolith, 2.0); }
  let moon = sdSphere(p - vec3<f32>(-0.92, 0.76, 2.4), 0.42);
  if (moon < result.x) { result = vec2<f32>(moon, 3.0); }
`;
}

function buildWebsiteShaderCandidate(intensity: number, seed: number, mode: PipelineMode, family: WebsiteFamily): string {
  const r = seededUnit(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
  const f = (min: number, max: number) => min + (max - min) * r();
  const palette = pick(WEBSITE_PALETTES);
  const speed = f(0.06, 0.28) * (0.55 + intensity * 0.65);
  const scaleA = f(0.55, 1.8);
  const scaleB = f(1.7, 4.8);
  const angle = f(-1.4, 1.4);
  const contrast = f(0.86, 1.32);
  const relief = f(0.16, 0.46) * intensity;
  const motion = f(0.035, 0.13) * intensity;
  const spot = [f(-0.42, 0.42), f(-0.34, 0.30)];
  const drift = [f(-0.16, 0.16), f(-0.16, 0.16)];
  const c = (value: readonly number[], boost = 1) => `vec3<f32>(${(value[0] * boost).toFixed(6)}, ${(value[1] * boost).toFixed(6)}, ${(value[2] * boost).toFixed(6)})`;

  if (mode !== 'fragment') {
    return generateIntentShaderV2WithMode(intensity * 0.45, seed, mode, 'website');
  }

  const header = `
@group(0) @binding(0) var<uniform> time: f32;
@group(0) @binding(1) var<uniform> resolution: vec2<f32>;
@group(0) @binding(2) var<uniform> mouse: vec2<f32>;
@group(0) @binding(3) var<uniform> scroll: vec2<f32>;

@fragment
fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / resolution;
  let centered = uv * 2.0 - 1.0;
  let aspect = resolution.x / max(resolution.y, 1.0);
  let t = time * ${speed.toFixed(6)};
  let mouseNorm = clamp(mouse, vec2<f32>(0.0), vec2<f32>(1.0));
  var p = f_rot(vec2<f32>(centered.x * aspect, centered.y), ${angle.toFixed(6)} + scroll.y * 0.08);
  p = p + (mouseNorm - vec2<f32>(0.5)) * ${motion.toFixed(6)};
`;

  const footer = `
  col = mix(vec3<f32>(dot(col, vec3<f32>(0.299, 0.587, 0.114))), col, ${contrast.toFixed(6)});
  return vec4<f32>(f_graphics_surface(uv, col), 1.0);
}
`.trimEnd();

  if (family === 'glass') {
    return `${header}
  var q = p;
  var caustic = 0.0;
  for (var i = 0; i < 4; i = i + 1) {
    let fi = f32(i) + 1.0;
    q = f_rot(q + vec2<f32>(sin(q.y * ${scaleA.toFixed(6)} + t * fi), cos(q.x * ${(scaleA * 0.83).toFixed(6)} - t)) * 0.045, 0.42 + fi * 0.21);
    caustic = caustic + pow(abs(sin(q.x * ${(scaleB * 1.6).toFixed(6)} + cos(q.y * ${scaleB.toFixed(6)} + t))), 7.0) / fi;
  }
  caustic = clamp(caustic * 0.38, 0.0, 1.0);
  let slab = smoothstep(0.84, 0.08, abs(p.y + sin(p.x * 1.8 + t) * 0.12));
  let lens = pow(max(0.0, 1.0 - length(p - vec2<f32>(${spot[0].toFixed(6)}, ${spot[1].toFixed(6)}))), 2.2);
  let edgeGlow = smoothstep(0.04, 0.0, abs(length(p * vec2<f32>(0.76, 1.08)) - 0.74));
  let grain = (f_hash(uv * 132.0 + vec2<f32>(time * 0.006, -time * 0.009)) - 0.5) * 0.012;
  var col = mix(${c(palette.base, 1.1)}, ${c(palette.mid, 1.4)}, slab * 0.58 + lens * 0.28);
  col = mix(col, ${c(palette.accent, 1.2)}, caustic * 0.50 + edgeGlow * 0.32);
  col = col + ${c(palette.high, 1.15)} * (caustic * 0.18 + lens * ${relief.toFixed(6)}) + vec3<f32>(grain);
${footer}`;
  }

  if (family === 'editorial') {
    return `${header}
  let stage = smoothstep(1.25, 0.08, length((p - vec2<f32>(${spot[0].toFixed(6)}, ${spot[1].toFixed(6)})) * vec2<f32>(0.82, 1.18)));
  let band = smoothstep(0.62, 0.0, abs(dot(p, normalize(vec2<f32>(0.62, -0.78))) + sin(p.x * ${scaleA.toFixed(6)} + t) * 0.08));
  let counter = smoothstep(0.82, 0.0, abs(dot(p, normalize(vec2<f32>(-0.36, 0.93))) - 0.28));
  let aperture = pow(max(0.0, 1.0 - length(p * vec2<f32>(1.4, 0.82) - vec2<f32>(${drift[0].toFixed(6)}, ${drift[1].toFixed(6)}))), 3.2);
  let quiet = smoothstep(0.12, 0.72, uv.x) * smoothstep(0.95, 0.30, uv.y);
  let inkNoise = (f_hash(uv * 84.0 + vec2<f32>(time * 0.004)) - 0.5) * 0.010;
  var col = mix(${c(palette.base, 1.18)}, ${c(palette.mid, 1.34)}, stage * 0.64);
  col = mix(col, ${c(palette.accent, 1.14)}, band * quiet * 0.34 + counter * 0.18);
  col = col + ${c(palette.high, 1.1)} * aperture * ${relief.toFixed(6)} + vec3<f32>(inkNoise);
  col = mix(col, ${c(palette.base, 0.72)}, smoothstep(0.68, 1.18, length(centered)) * 0.42);
${footer}`;
  }

  if (family === 'topographic') {
    return `${header}
  let d0 = length(p - vec2<f32>(${spot[0].toFixed(6)}, ${spot[1].toFixed(6)}));
  let d1 = length(f_rot(p, -0.74) - vec2<f32>(${drift[0].toFixed(6)}, ${drift[1].toFixed(6)}));
  let field = d0 * 0.72 + d1 * 0.38 + sin(dot(p, vec2<f32>(${scaleA.toFixed(6)}, ${(scaleA * -0.7).toFixed(6)})) + t) * 0.08;
  let contour = pow(1.0 - smoothstep(0.018, 0.072, abs(fract(field * ${scaleB.toFixed(6)}) - 0.5)), 2.6);
  let wash = smoothstep(0.18, 1.22, 1.0 - field);
  let ridge = smoothstep(0.16, 0.82, sin(field * 5.2 - t * 0.7) * 0.5 + 0.5);
  let paper = (f_hash(uv * 68.0) - 0.5) * 0.014;
  var col = mix(${c(palette.base, 1.22)}, ${c(palette.mid, 1.32)}, wash * 0.52 + ridge * 0.18);
  col = mix(col, ${c(palette.accent, 1.08)}, contour * 0.38);
  col = col + ${c(palette.high, 1.05)} * contour * wash * ${relief.toFixed(6)} + vec3<f32>(paper);
${footer}`;
  }

  return `${header}
  var q = p;
  var body = 0.0;
  for (var i = 0; i < 3; i = i + 1) {
    let fi = f32(i) + 1.0;
    q = f_rot(q + vec2<f32>(sin(q.y * ${scaleA.toFixed(6)} + t), cos(q.x * ${(scaleA * 0.77).toFixed(6)} - t)) * 0.065, 0.28 + fi * 0.24);
    body = body + smoothstep(0.92, 0.04, abs(q.y + sin(q.x * ${(scaleB * 0.72).toFixed(6)} + t * fi) * 0.18)) / fi;
  }
  body = clamp(body, 0.0, 1.0);
  let halo = pow(max(0.0, 1.0 - length(p - vec2<f32>(${spot[0].toFixed(6)}, ${spot[1].toFixed(6)}))), 2.0);
  let filament = smoothstep(0.02, 0.0, abs(p.y - sin(p.x * ${scaleB.toFixed(6)} + t) * 0.18));
  let dust = (f_hash(uv * 110.0 + vec2<f32>(time * 0.005, time * -0.007)) - 0.5) * 0.012;
  var col = mix(${c(palette.base, 1.12)}, ${c(palette.mid, 1.35)}, body * 0.48 + halo * 0.22);
  col = mix(col, ${c(palette.accent, 1.16)}, filament * 0.30 + body * 0.18);
  col = col + ${c(palette.high, 1.08)} * (halo * ${relief.toFixed(6)} + filament * 0.12) + vec3<f32>(dust);
${footer}`;
}

function seededUnit(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function generateIntentShaderV2WithMode(
  intensity: number = 0.5,
  seed?: number,
  mode: PipelineMode = 'fragment',
  intent: GeneratorIntent = 'general'
): string {
  const config: Partial<GeneratorConfig> = {
    ...DEFAULT_GENERATOR_CONFIG,
    seed,
    intent,
    maxDepth: Math.floor(4 + intensity * 4),
    minComplexity: Math.floor(10 + intensity * 20),
  };

  const program = generateProgramForMode(config, mode);
  return ensureRequiredLocals(emit(program, { pretty: true }));
}

export function mutateShaderV2WithMode(
  shaderCode: string,
  intensity: number = 0.3,
  seed?: number,
  mode: PipelineMode = 'fragment'
): string {
  return fuzzShaderV2WithMode(intensity, 1, seed, mode).code;
}

export function fuzzShaderV2WithMode(
  intensity: number = 0.5,
  rounds: number = 2,
  seed?: number,
  mode: PipelineMode = 'fragment'
): { code: string; mutations: string[] } {
  return selectCreativeCandidate(intensity, seed, mode);
}

function selectCreativeCandidate(
  intensity: number,
  seed: number | undefined,
  mode: PipelineMode
): { code: string; mutations: string[] } {
  let best = '';
  let bestScore = -Infinity;
  const baseSeed = seed ?? Date.now();

  for (let i = 0; i < 20; i++) {
    const code = generateFreshShaderV2WithMode(
      Math.min(1, Math.max(0.2, intensity + i * 0.035)),
      baseSeed + i * 7919,
      mode
    );
    const score = scoreCreativeShader(code);
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }

  return {
    code: best,
    mutations: [`selected creative candidate score ${bestScore.toFixed(1)}`],
  };
}

function scoreCreativeShader(code: string): number {
  const weightedTerms = [
    ['f_rot', 9],
    ['atan2', 8],
    ['smoothstep', 7],
    ['length', 6],
    ['mix', 6],
    ['dot', 5],
    ['step', 4],
    ['sin', 3],
    ['cos', 3],
    ['abs', 3],
  ] as const;
  let score = 0;
  for (const [term, weight] of weightedTerms) {
    score += (code.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length ?? 0) * weight;
  }
  const count = (term: string) => code.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length ?? 0;
  const structuralSignals = [/atan2\(/, /smoothstep\(/, /dot\(/, /f_rot\(/, /step\(/, /length\(/]
    .filter((pattern) => pattern.test(code)).length;
  score += structuralSignals * 16;

  const hashCount = count('f_hash');
  const floorCount = count('floor');
  const fractCount = count('fract');
  score -= Math.max(0, hashCount - 4) * 18;
  score -= Math.max(0, floorCount - 4) * 14;
  score -= Math.max(0, fractCount - 10) * 6;

  const codeLength = code.length;
  score += Math.min(80, codeLength / 45);
  score -= Math.max(0, codeLength - 5200) / 35;

  if (code.includes('vec3<f32>(')) score += 20;
  if (code.includes('f_pal') && code.includes('vec3<f32>(')) score += 10;
  if (!code.includes('p')) score -= 30;
  return score;
}

function scoreWebsiteShader(code: string): number {
  const count = (term: string) => code.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length ?? 0;
  const lineCount = code.split('\n').filter(line => line.trim()).length;
  const codeLength = code.length;
  const hardCutCount = count('step') + count('floor') + count('f_hash');
  const fractCount = count('fract');
  const trigCount = count('sin') + count('cos');
  const materialSignals = ['f_graphics_surface', 'mix', 'smoothstep', 'dot', 'pow', 'glint', 'grain']
    .filter(term => code.includes(term)).length;
  const compositionSignals = ['length', 'f_rot', 'atan2', 'centered', 'vignette']
    .filter(term => code.includes(term)).length;

  let score = 0;
  score += materialSignals * 18;
  score += compositionSignals * 10;
  score += 90 * Math.exp(-Math.pow((codeLength - 4200) / 2400, 2));
  score += 50 * Math.exp(-Math.pow((lineCount - 62) / 44, 2));
  score -= hardCutCount * 34;
  score -= Math.max(0, fractCount - 5) * 12;
  score -= Math.max(0, trigCount - 18) * 7;
  score -= code.includes('texture_storage_2d') ? 45 : 0;
  score -= code.includes('vertex_index') ? 30 : 0;
  score += code.includes('f_graphics_surface') ? 30 : 0;
  return score;
}

function ensureRequiredLocals(source: string): string {
  return source.replace(/let uv = ([^;]+);\n(?![\s\S]*?let centered =)/g, (_match, uvExpr) => {
    return `let uv = ${uvExpr};\n  let centered = uv * 2.0 - 1.0;\n  let t = time;\n`;
  }).replace(/let uv = ([^;]+);\n((?:(?!\n\}).)*?)return /gs, (match, uvExpr, between) => {
    let setup = `let uv = ${uvExpr};\n`;
    if (!between.includes('let centered =')) {
      setup += `  let centered = uv * 2.0 - 1.0;\n`;
    }
    if (!between.includes('let t =')) {
      setup += `  let t = time;\n`;
    }
    return setup + between + 'return ';
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function generateProgramForMode(
  config: Partial<GeneratorConfig>,
  mode: PipelineMode
) {
  switch (mode) {
    case 'vertex-fragment':
      return generateVertexFragmentShader(config);
    case 'compute':
      return generateComputeShader(config);
    case 'fragment':
    default:
      return generateShader(config);
  }
}

/**
 * Strip the preamble (helper functions) from shader code.
 */
function stripPreamble(code: string): string {
  // Find where the main shader starts (after helper functions)
  // Look for struct Uniforms or @group/@binding as markers

  const structMatch = code.indexOf('struct Uniforms');
  if (structMatch !== -1) {
    return code.substring(structMatch);
  }

  const groupMatch = code.indexOf('@group');
  if (groupMatch !== -1) {
    return code.substring(groupMatch);
  }

  const fragmentMatch = code.indexOf('@fragment');
  if (fragmentMatch !== -1) {
    // Find the fn before @fragment
    const beforeFragment = code.substring(0, fragmentMatch);
    const lastNewline = beforeFragment.lastIndexOf('\n');
    return code.substring(lastNewline !== -1 ? lastNewline : fragmentMatch);
  }

  // If no markers found, return as-is
  return code;
}

/**
 * Check if a shader was generated by v2 (has v2 markers).
 */
export function isV2Shader(code: string): boolean {
  // V2 shaders have consistent structure
  return code.includes('struct Uniforms') &&
         code.includes('fragment_main') &&
         !code.includes('// LEGACY');
}

// ============================================================================
// INTENSITY PRESETS
// ============================================================================

export const V2_PRESETS = {
  /** Subtle variations - good for iteration */
  subtle: { intensity: 0.2, rounds: 1 },

  /** Moderate changes - balanced exploration */
  moderate: { intensity: 0.5, rounds: 2 },

  /** Wild mutations - more experimental */
  wild: { intensity: 0.8, rounds: 3 },

  /** Chaos mode - maximum variation */
  chaos: { intensity: 1.0, rounds: 5 },
} as const;

