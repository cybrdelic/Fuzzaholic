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

  for (let i = 0; i < 28; i++) {
    const code = buildWebsiteShaderCandidate(Math.min(0.82, Math.max(0.18, intensity)), baseSeed + i * 3571, mode);
    const score = scoreWebsiteShader(code);
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }

  return best;
}

function buildWebsiteShaderCandidate(intensity: number, seed: number, mode: PipelineMode): string {
  const r = seededUnit(seed);
  const pick = <T,>(items: T[]): T => items[Math.floor(r() * items.length)]!;
  const f = (min: number, max: number) => min + (max - min) * r();
  const family = pick(['hero', 'editorial', 'product', 'ambient']);
  const speed = f(0.06, 0.28) * (0.55 + intensity * 0.65);
  const scaleA = f(0.42, 1.35);
  const scaleB = f(1.1, 3.2);
  const accent = [f(0.10, 0.38), f(0.24, 0.72), f(0.48, 0.92)];
  const base = [f(0.015, 0.08), f(0.018, 0.09), f(0.025, 0.11)];
  const warmth = f(-0.22, 0.22);
  const angle = f(-1.4, 1.4);
  const contrast = f(0.72, 1.18);
  const relief = f(0.08, 0.26) * intensity;
  const motion = f(0.04, 0.16) * intensity;

  if (mode !== 'fragment') {
    return generateIntentShaderV2WithMode(intensity * 0.45, seed, mode, 'website');
  }

  return `
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

  let broad = smoothstep(-0.72, 0.86, sin(dot(p, vec2<f32>(${scaleA.toFixed(6)}, ${(scaleA * 0.63).toFixed(6)})) + t));
  let depth = smoothstep(0.15, 1.24, 1.0 - length(p * vec2<f32>(0.72, 1.0)));
  let sweep = smoothstep(0.18, 0.92, fract(dot(uv, vec2<f32>(${scaleB.toFixed(6)}, ${(scaleB * 0.41).toFixed(6)})) * 0.22 + t * 0.12));
  let glint = pow(max(0.0, 1.0 - length(p - vec2<f32>(0.18 + scroll.x * 0.05, -0.12))), 4.0) * ${relief.toFixed(6)};
  let grain = (f_hash(uv * 96.0 + vec2<f32>(time * 0.01, -time * 0.013)) - 0.5) * 0.018;

  let ink = vec3<f32>(${base[0].toFixed(6)}, ${base[1].toFixed(6)}, ${base[2].toFixed(6)});
  let accent = vec3<f32>(${accent[0].toFixed(6)}, ${(accent[1] + warmth * 0.12).toFixed(6)}, ${(accent[2] - warmth * 0.08).toFixed(6)});
  let secondary = accent.yzx * vec3<f32>(0.72, 0.84, 1.08);
  var col = mix(ink, accent, broad * 0.58 + depth * 0.24);
  col = mix(col, secondary, sweep * ${family === 'ambient' ? '0.18' : family === 'product' ? '0.26' : '0.34'});
  col = col + vec3<f32>(glint) + grain;
  col = mix(vec3<f32>(dot(col, vec3<f32>(0.299, 0.587, 0.114))), col, ${contrast.toFixed(6)});
  return vec4<f32>(f_graphics_surface(uv, col), 1.0);
}
`.trim();
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

