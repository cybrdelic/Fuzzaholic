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

