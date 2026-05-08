/**
 * WGSL AST Generator - v2 Clean Implementation
 *
 * Procedural shader generation using type-safe builders.
 * Anti-convergence logic is EMBEDDED in generation, not post-filtered.
 *
 * Key principles:
 * - Generate AST nodes directly (never strings)
 * - Use builder functions that enforce invariants
 * - Track complexity during generation to avoid boring shaders
 * - Support granular control over what gets generated/mutated
 */

import {
    Declaration,
    Expression,
    FunctionDecl,
    GlobalVarDecl,
    Program,
    ReturnStmt,
    Statement
} from './types';

import { B } from './builder';

// ============================================================================
// GENERATION CONFIGURATION
// ============================================================================

export interface GeneratorConfig {
  /** Maximum expression depth (prevents infinite recursion and overly complex shaders) */
  maxDepth: number;
  /** Minimum complexity score before accepting shader (anti-convergence) */
  minComplexity: number;
  /** Maximum complexity (prevents unreadable monstrosities) */
  maxComplexity: number;
  /** Probability weights for different expression types */
  weights: ExpressionWeights;
  /** Random seed for reproducibility */
  seed?: number;
  /** Enable/disable specific effect categories */
  effects: EffectCategories;
  /** Optional broad generation intent; affects grammar ranges, not fixed visual templates. */
  intent?: GeneratorIntent;
}

export type GeneratorIntent =
  | 'general'
  | 'math'
  | 'physics'
  | 'aesthetic'
  | 'cursor'
  | 'scroll'
  | 'fragment'
  | 'vertex'
  | 'compute'
  | 'website';

export interface ExpressionWeights {
  literal: number;
  identifier: number;
  binary: number;
  unary: number;
  call: number;
  swizzle: number;
  ternary: number;
}

export interface EffectCategories {
  /** UV-based patterns (sine waves, gradients) */
  uvPatterns: boolean;
  /** Time-based animation */
  timeAnimation: boolean;
  /** Mouse/cursor interaction */
  cursorEffect: boolean;
  /** Noise-based effects */
  noise: boolean;
  /** Color transformations */
  colorTransform: boolean;
  /** Mathematical fractals */
  fractals: boolean;
}

const DEFAULT_CONFIG: GeneratorConfig = {
  maxDepth: 6,
  minComplexity: 10,
  maxComplexity: 100,
  weights: {
    literal: 10,
    identifier: 20,
    binary: 30,
    unary: 10,
    call: 25,
    swizzle: 5,
    ternary: 5,
  },
  effects: {
    uvPatterns: true,
    timeAnimation: true,
    cursorEffect: true,
    noise: true,
    colorTransform: true,
    fractals: false, // Expensive, opt-in
  },
};

// ============================================================================
// COMPLEXITY TRACKING
// ============================================================================

interface ComplexityMetrics {
  /** Total nodes generated */
  nodeCount: number;
  /** Depth of deepest expression */
  maxDepthReached: number;
  /** Number of different operations used */
  operationDiversity: Set<string>;
  /** Number of uniforms referenced */
  uniformsUsed: Set<string>;
  /** Has time-varying component */
  hasTimeVariation: boolean;
  /** Has spatial variation (UV-based) */
  hasSpatialVariation: boolean;
}

interface GrammarProfile {
  frequencyScale: number;
  fieldDepthLimit: number;
  layerLimit: number;
  colorPassLimit: number;
  domainStepLimit: number;
  weightJitter: number;
  maskSharpness: number;
  colorBias: number;
  quantizationBias: number;
  restraint: number;
}

function computeComplexityScore(metrics: ComplexityMetrics): number {
  let score = 0;

  // Base complexity from node count
  score += metrics.nodeCount * 0.5;

  // Reward depth (interesting nested expressions)
  score += metrics.maxDepthReached * 2;

  // Reward operation diversity
  score += metrics.operationDiversity.size * 3;

  // Reward uniform usage (more dynamic shaders)
  score += metrics.uniformsUsed.size * 5;

  // Big bonus for time variation (animation)
  if (metrics.hasTimeVariation) score += 15;

  // Bonus for spatial variation (not just solid color)
  if (metrics.hasSpatialVariation) score += 10;

  return score;
}

// ============================================================================
// SEEDED RANDOM
// ============================================================================

class SeededRandom {
  private state: number;

  constructor(seed?: number) {
    this.state = seed ?? Date.now();
  }

  next(): number {
    // xorshift32
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return (this.state >>> 0) / 0xffffffff;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  weighted<T>(options: { value: T; weight: number }[]): T {
    const total = options.reduce((sum, o) => sum + o.weight, 0);
    let r = this.next() * total;
    for (const opt of options) {
      r -= opt.weight;
      if (r <= 0) return opt.value;
    }
    return options[options.length - 1].value;
  }
}

// ============================================================================
// GENERATOR CLASS
// ============================================================================

export class ShaderGenerator {
  private config: GeneratorConfig;
  private rng: SeededRandom;
  private metrics: ComplexityMetrics;
  private profile: GrammarProfile;

  constructor(config: Partial<GeneratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new SeededRandom(config.seed);
    this.metrics = this.freshMetrics();
    this.profile = this.sampleGrammarProfile();
  }

  private sampleGrammarProfile(): GrammarProfile {
    const intent = this.config.intent ?? 'general';
    let logFrequency = this.rng.range(Math.log(0.34), Math.log(1.35));
    const profile: GrammarProfile = {
      frequencyScale: 1.0,
      fieldDepthLimit: Math.floor(this.rng.range(1, 4.999)),
      layerLimit: Math.floor(this.rng.range(0, 3.999)),
      colorPassLimit: Math.floor(this.rng.range(1, 5.999)),
      domainStepLimit: Math.floor(this.rng.range(0, 3.999)),
      weightJitter: this.rng.range(0.75, 1.35),
      maskSharpness: this.rng.range(0.7, 1.15),
      colorBias: this.rng.range(0.65, 1.05),
      quantizationBias: this.rng.range(0.12, 0.55),
      restraint: this.rng.range(0.58, 0.98),
    };

    if (intent === 'math') {
      logFrequency = this.rng.range(Math.log(0.55), Math.log(1.55));
      profile.fieldDepthLimit = Math.floor(this.rng.range(2, 4.999));
      profile.layerLimit = Math.floor(this.rng.range(1, 3.999));
      profile.colorPassLimit = Math.floor(this.rng.range(2, 5.999));
      profile.domainStepLimit = Math.floor(this.rng.range(1, 4.999));
      profile.quantizationBias *= 0.45;
    } else if (intent === 'aesthetic') {
      logFrequency = this.rng.range(Math.log(0.32), Math.log(1.05));
      profile.layerLimit = Math.floor(this.rng.range(1, 3.999));
      profile.colorPassLimit = Math.floor(this.rng.range(1, 4.999));
      profile.domainStepLimit = Math.floor(this.rng.range(0, 2.999));
      profile.colorBias *= 1.15;
      profile.quantizationBias *= 0.55;
      profile.restraint *= 0.9;
    } else if (intent === 'physics') {
      logFrequency = this.rng.range(Math.log(0.45), Math.log(1.65));
      profile.fieldDepthLimit = Math.floor(this.rng.range(1, 3.999));
      profile.domainStepLimit = Math.floor(this.rng.range(1, 3.999));
      profile.maskSharpness *= 0.85;
      profile.quantizationBias *= 0.5;
    } else if (intent === 'cursor') {
      logFrequency = this.rng.range(Math.log(0.55), Math.log(1.7));
      profile.layerLimit = Math.floor(this.rng.range(2, 5.999));
      profile.maskSharpness *= 1.25;
    } else if (intent === 'scroll') {
      logFrequency = this.rng.range(Math.log(0.5), Math.log(1.45));
      profile.layerLimit = Math.floor(this.rng.range(1, 4.999));
      profile.domainStepLimit = Math.floor(this.rng.range(1, 3.999));
      profile.maskSharpness *= 1.15;
      profile.quantizationBias *= 0.65;
    } else if (intent === 'vertex' || intent === 'compute') {
      logFrequency = this.rng.range(Math.log(0.45), Math.log(1.45));
      profile.layerLimit = Math.floor(this.rng.range(1, 3.999));
    } else if (intent === 'website') {
      logFrequency = this.rng.range(Math.log(0.22), Math.log(0.72));
      profile.fieldDepthLimit = Math.floor(this.rng.range(1, 2.999));
      profile.layerLimit = Math.floor(this.rng.range(0, 2.999));
      profile.colorPassLimit = Math.floor(this.rng.range(1, 3.999));
      profile.domainStepLimit = Math.floor(this.rng.range(0, 1.999));
      profile.maskSharpness *= 0.68;
      profile.colorBias *= 1.25;
      profile.quantizationBias *= 0.08;
      profile.restraint *= 0.62;
    }

    profile.frequencyScale = Math.exp(logFrequency);
    return profile;
  }

  private currentIntent(): GeneratorIntent {
    return this.config.intent ?? 'general';
  }

  private weightedProfile<T>(options: { value: T; weight: number }[]): T {
    return this.rng.weighted(options.map((option) => ({
      value: option.value,
      weight: Math.max(0.1, option.weight * this.rng.range(1 / this.profile.weightJitter, this.profile.weightJitter)),
    })));
  }

  private freq(min: number, max: number): number {
    return this.rng.range(min, max) * this.profile.frequencyScale;
  }

  private thresholdPair(): [Expression, Expression] {
    const center = this.rng.range(0.25, 0.75);
    const width = this.rng.range(0.08, 0.32) / this.profile.maskSharpness;
    return [B.lit(Math.max(0.0, center - width)), B.lit(Math.min(1.0, center + width))];
  }

  private freshMetrics(): ComplexityMetrics {
    return {
      nodeCount: 0,
      maxDepthReached: 0,
      operationDiversity: new Set(),
      uniformsUsed: new Set(),
      hasTimeVariation: false,
      hasSpatialVariation: false,
    };
  }

  // ---- Public API ----

  /**
   * Generate a complete fragment shader program
   */
  generateProgram(): Program {
    return this.generateFragmentProgram();
  }

  /**
   * Generate a complete fragment shader program
   */
  generateFragmentProgram(): Program {
    // Try multiple times to meet complexity requirements
    for (let attempt = 0; attempt < 10; attempt++) {
      this.metrics = this.freshMetrics();

      const declarations: Declaration[] = [
        ...this.generateUniformBindings(),
        this.generateFragmentMain('main'),
      ];

      const complexity = computeComplexityScore(this.metrics);

      if (
        complexity >= this.config.minComplexity &&
        complexity <= this.config.maxComplexity
      ) {
        return { kind: 'Program', declarations };
      }

      // Adjust weights and retry for anti-convergence
      if (complexity < this.config.minComplexity) {
        // Too simple - encourage more complex expressions
        this.config.weights.call += 5;
        this.config.weights.binary += 5;
      } else {
        // Too complex - simplify
        this.config.weights.literal += 5;
        this.config.weights.identifier += 5;
      }
    }

    // Return last attempt even if not ideal
    return {
      kind: 'Program',
      declarations: [
        ...this.generateUniformBindings(),
        this.generateFragmentMain('main'),
      ],
    };
  }

  /**
   * Generate a complete vertex + fragment shader program
   */
  generateVertexFragmentProgram(): Program {
    for (let attempt = 0; attempt < 10; attempt++) {
      this.metrics = this.freshMetrics();

      const declarations: Declaration[] = [
        ...this.generateUniformBindings(),
        this.generateVertexMain('vs_main'),
        this.generateFragmentMain('fs_main'),
      ];

      const complexity = computeComplexityScore(this.metrics);
      if (
        complexity >= this.config.minComplexity &&
        complexity <= this.config.maxComplexity
      ) {
        return { kind: 'Program', declarations };
      }
    }

    return {
      kind: 'Program',
      declarations: [
        ...this.generateUniformBindings(),
        this.generateVertexMain('vs_main'),
        this.generateFragmentMain('fs_main'),
      ],
    };
  }

  /**
   * Generate a complete compute shader program
   */
  generateComputeProgram(): Program {
    for (let attempt = 0; attempt < 10; attempt++) {
      this.metrics = this.freshMetrics();

      const declarations: Declaration[] = [
        ...this.generateUniformBindings(),
        this.generateOutputTextureBinding(),
        this.generateComputeMain('cs_main'),
      ];

      const complexity = computeComplexityScore(this.metrics);
      if (
        complexity >= this.config.minComplexity &&
        complexity <= this.config.maxComplexity
      ) {
        return { kind: 'Program', declarations };
      }
    }

    return {
      kind: 'Program',
      declarations: [
        ...this.generateUniformBindings(),
        this.generateOutputTextureBinding(),
        this.generateComputeMain('cs_main'),
      ],
    };
  }

  /**
   * Generate just the color expression (for mutation)
   */
  generateColorExpression(depth: number = 0): Expression {
    return this.genVec4(depth);
  }

  // ---- Uniform Structure ----
  // ShaderCanvas provides individual uniform bindings, not a struct:
  // binding 0: time (f32)
  // binding 1: resolution (vec2f)
  // binding 2: mouse (vec2f)
  // binding 3: scroll (vec2f)

  private generateUniformBindings(): GlobalVarDecl[] {
    return [
      B.uniform('time', B.namedType('f32'), 0, 0),
      B.uniform('resolution', B.namedType('vec2<f32>'), 0, 1),
      B.uniform('mouse', B.namedType('vec2<f32>'), 0, 2),
      B.uniform('scroll', B.namedType('vec2<f32>'), 0, 3),
    ];
  }

  private generateOutputTextureBinding(): GlobalVarDecl {
    return B.storageTexture('outputTex', 0, 4, 'rgba8unorm', 'write');
  }

  // ---- Fragment Main ----

  private generateFragmentMain(entryName: string): FunctionDecl {
    const uvSetup = this.generateUVSetupWithBase(
      B.binary(
        B.member(B.ident('pos'), 'xy'),
        '/',
        B.ident('resolution')
      )
    );
    const colorCalc = this.generateColorCalculation();
    const returnStmt: ReturnStmt = {
      kind: 'ReturnStmt',
      value: colorCalc,
    };

    return B.fn(
      entryName,
      [B.param('pos', B.namedType('vec4f'), [B.builtin('position')])],
      B.namedType('vec4f'),
      B.block([...uvSetup, returnStmt]),
      [B.fragment()],
      [B.location(0)]
    );
  }

  private generateVertexMain(entryName: string): FunctionDecl {
    const statements: Statement[] = [];

    // Base fullscreen triangle positions
    statements.push(
      B.varStmt(
        'pos',
        B.vec2(B.lit(-1.0), B.lit(-1.0)),
        B.namedType('vec2<f32>')
      )
    );

    statements.push(
      B.ifStmt(
        B.eq(B.ident('vertexIndex'), B.u32(1)),
        B.block([
          B.assign(
            B.ident('pos'),
            B.vec2(B.lit(3.0), B.lit(-1.0))
          )
        ])
      )
    );

    statements.push(
      B.ifStmt(
        B.eq(B.ident('vertexIndex'), B.u32(2)),
        B.block([
          B.assign(
            B.ident('pos'),
            B.vec2(B.lit(-1.0), B.lit(3.0))
          )
        ])
      )
    );

    const uvBase = B.binary(
      B.binary(
        B.ident('pos'),
        '*',
        B.vec2(B.lit(0.5), B.lit(0.5))
      ),
      '+',
      B.vec2(B.lit(0.5), B.lit(0.5))
    );

    statements.push(...this.generateUVSetupWithBase(uvBase));

    if (this.rng.chance(0.6)) {
      const warp = B.binary(
        this.genVec2(0),
        '*',
        B.vec2(B.lit(0.2), B.lit(0.2))
      );
      const warped = B.clamp(
        B.binary(B.ident('pos'), '+', warp),
        B.vec2(B.lit(-1.5), B.lit(-1.5)),
        B.vec2(B.lit(1.5), B.lit(1.5))
      );
      statements.push(B.assign(B.ident('pos'), warped));
    }

    const returnStmt: ReturnStmt = {
      kind: 'ReturnStmt',
      value: B.vec4(
        B.member(B.ident('pos'), 'x'),
        B.member(B.ident('pos'), 'y'),
        B.lit(0.0),
        B.lit(1.0)
      ),
    };

    statements.push(returnStmt);

    return B.fn(
      entryName,
      [B.param('vertexIndex', B.namedType('u32'), [B.builtin('vertex_index')])],
      B.namedType('vec4f'),
      B.block(statements),
      [B.vertex()],
      [B.builtin('position')]
    );
  }

  private generateComputeMain(entryName: string): FunctionDecl {
    const statements: Statement[] = [];

    const gid = B.ident('gid', 'vec3<u32>');
    const gidX = B.member(gid, 'x');
    const gidY = B.member(gid, 'y');

    const width = B.call('u32', B.member(B.ident('resolution'), 'x'));
    const height = B.call('u32', B.member(B.ident('resolution'), 'y'));

    const outOfBounds = B.or(
      B.gte(gidX, width),
      B.gte(gidY, height)
    );

    statements.push(
      B.ifStmt(outOfBounds, B.block([B.returnStmt()]))
    );

    const uvBase = B.binary(
      B.vec2(
        B.call('f32', gidX),
        B.call('f32', gidY)
      ),
      '/',
      B.ident('resolution')
    );

    statements.push(...this.generateUVSetupWithBase(uvBase));

    const color = this.generateColorCalculation();
    const clamped = B.clamp(
      color,
      B.vec4(B.lit(0.0), B.lit(0.0), B.lit(0.0), B.lit(0.0)),
      B.vec4(B.lit(1.0), B.lit(1.0), B.lit(1.0), B.lit(1.0))
    );

    const coord = B.call(
      'vec2<i32>',
      B.call('i32', gidX),
      B.call('i32', gidY)
    );
    const store = B.call('textureStore', B.ident('outputTex'), coord, clamped);
    statements.push(B.exprStmt(store));

    return B.fn(
      entryName,
      [B.param('gid', B.namedType('vec3<u32>'), [B.builtin('global_invocation_id')])],
      null,
      B.block(statements),
      [B.compute(), B.attr('workgroup_size', B.i32(8), B.i32(8), B.i32(1))],
      []
    );
  }

  private generateUVSetupWithBase(base: Expression): Statement[] {
    const statements: Statement[] = [];

    // let uv = <base>;
    statements.push(
      B.letStmt(
        'uv',
        base
      )
    );
    this.metrics.hasSpatialVariation = true;

    statements.push(
      B.letStmt(
        'centered',
        B.binary(
          B.binary(B.ident('uv'), '*', B.lit(2.0)),
          '-',
          B.lit(1.0)
        )
      )
    );

    if (this.config.effects.timeAnimation) {
      statements.push(B.letStmt('t', B.ident('time')));
      this.metrics.hasTimeVariation = true;
      this.metrics.uniformsUsed.add('time');
    }

    statements.push(B.letStmt('p', this.generateDomainPoint()));
    this.metrics.operationDiversity.add('domain-warp');
    this.metrics.uniformsUsed.add('time');

    // Optionally add mouse reference (normalized)
    if (
      (this.config.effects.cursorEffect && this.rng.chance(0.3)) ||
      this.currentIntent() === 'cursor'
    ) {
      statements.push(
        B.letStmt(
          'mouseNorm',
          B.call(
            'clamp',
            B.ident('mouse'),
            B.vec2(B.lit(0.0)),
            B.vec2(B.lit(1.0))
          )
        )
      );
      this.metrics.uniformsUsed.add('mouse');
    }

    return statements;
  }

  private generateDomainPoint(): Expression {
    let domain: Expression = this.weightedProfile<() => Expression>([
      { value: () => B.ident('centered'), weight: 36 },
      { value: () => B.binary(B.ident('uv'), '-', B.vec2(B.lit(0.5))), weight: 18 },
      { value: () => B.vec2(B.member(B.ident('centered'), 'x'), B.binary(B.member(B.ident('centered'), 'y'), '*', B.binary(B.member(B.ident('resolution'), 'y'), '/', B.member(B.ident('resolution'), 'x')))), weight: 12 },
      { value: () => B.binary(B.call('fract', B.binary(B.ident('uv'), '*', B.vec2(B.lit(this.freq(0.9, 3.2)), B.lit(this.freq(0.9, 3.2))))), '-', B.vec2(B.lit(0.5))), weight: 2 * this.profile.quantizationBias },
    ])();

    const steps = this.profile.domainStepLimit;
    for (let i = 0; i < steps; i++) {
      domain = this.applyDomainStep(domain);
    }
    return domain;
  }

  private applyDomainStep(domain: Expression): Expression {
    const linear = B.call('dot', domain, B.vec2(B.lit(this.rng.range(-2.5, 2.5)), B.lit(this.rng.range(-2.5, 2.5))));
    const radial = B.call('length', domain);
    const options: { value: () => Expression; weight: number }[] = [
      { value: () => B.call('f_rot', domain, B.binary(B.ident('t'), '*', B.lit(this.rng.range(-1.1, 1.1)))), weight: 18 },
      { value: () => B.binary(B.call('abs', domain), '-', B.vec2(B.lit(this.rng.range(0.08, 0.55)))), weight: 13 },
      { value: () => B.binary(B.call('fract', B.binary(domain, '*', B.lit(this.freq(0.8, 2.8)))), '-', B.vec2(B.lit(0.5))), weight: 2 * this.profile.quantizationBias },
      { value: () => B.binary(domain, '+', B.binary(B.vec2(B.call('sin', B.binary(linear, '*', B.lit(this.freq(0.45, 2.2)))), B.call('cos', B.binary(radial, '*', B.lit(this.freq(0.45, 2.2))))), '*', B.lit(this.rng.range(0.035, 0.16) * this.profile.restraint))), weight: 20 },
      { value: () => B.binary(domain, '/', B.vec2(B.binary(B.lit(0.65), '+', radial))), weight: 7 },
      { value: () => B.binary(domain, '+', B.binary(B.vec2(B.call('f_hash', B.binary(domain, '*', B.lit(this.freq(1.2, 4)))), B.call('f_hash', B.binary(B.member(domain, 'yx'), '*', B.lit(this.freq(1.2, 4))))), '*', B.lit(this.rng.range(0.015, 0.07) * this.profile.restraint))), weight: 1.5 * this.profile.quantizationBias },
    ];
    this.metrics.operationDiversity.add('domain-step');
    return this.weightedProfile(options)();
  }

  private generateColorCalculation(): Expression {
    let color = this.generateColorAtom();
    const passes = Math.max(1, Math.min(6, this.profile.layerLimit + Math.floor(this.rng.range(0, this.profile.colorPassLimit))));

    for (let i = 0; i < passes; i++) {
      color = this.applyColorStep(color);
    }

    this.metrics.nodeCount += 14 + passes * 12;
    this.metrics.operationDiversity.add('open-color-program');
    return this.finalizeColor(color);
  }

  private generateColorAtom(): Expression {
    const field = this.generateField();
    const options: { value: () => Expression; weight: number }[] = [
      { value: () => this.palette(field), weight: 30 },
      { value: () => this.generateIndependentColor(), weight: 14 * this.profile.colorBias },
      { value: () => B.vec3(this.generateScalar01(), this.generateScalar01(), this.generateScalar01()), weight: 8 },
      { value: () => B.vec3(B.call('fract', field)), weight: 3 },
      { value: () => B.vec3(B.member(B.ident('uv'), 'x'), B.member(B.ident('uv'), 'y'), this.generateScalar01()), weight: 2 },
      { value: () => B.vec3(B.lit(this.rng.range(0.08, 0.92)), B.lit(this.rng.range(0.08, 0.92)), B.lit(this.rng.range(0.08, 0.92))), weight: 2 },
    ];
    this.metrics.operationDiversity.add('color-atom');
    return this.weightedProfile(options)();
  }

  private applyColorStep(color: Expression): Expression {
    const other = this.generateColorAtom();
    const a = this.generateMask();
    const b = this.generateScalar01();
    const amount = B.lit(this.rng.range(0.04, 0.42) * this.profile.restraint);
    const options: { value: () => Expression; weight: number }[] = [
      { value: () => B.call('mix', color, other, a), weight: 18 },
      { value: () => B.binary(color, '+', B.binary(other, '*', B.binary(a, '*', amount))), weight: 16 },
      { value: () => B.call('abs', B.binary(color, '-', other)), weight: 4 },
      { value: () => B.binary(color, '*', B.binary(other, '+', B.vec3(B.lit(this.rng.range(0.12, 0.45))))), weight: 8 },
      { value: () => B.call('mix', B.call('min', color, other), B.call('max', color, other), a), weight: 4 },
      { value: () => B.call('pow', B.call('abs', color), B.vec3(B.lit(this.rng.range(0.7, 1.8)))), weight: 6 },
      { value: () => B.call('smoothstep', B.vec3(B.lit(this.rng.range(0, 0.45))), B.vec3(B.lit(this.rng.range(0.55, 1))), color), weight: 9 },
      { value: () => B.call('mix', color, B.member(color, this.rng.pick(['yzx', 'zxy', 'xzy', 'zyx'])), b), weight: 8 },
      { value: () => B.binary(B.call('sin', B.binary(color, '*', B.vec3(B.lit(this.freq(0.6, 2.6))))), '*', B.lit(0.24)), weight: 3 },
      { value: () => B.call('mix', color, B.call('smoothstep', B.vec3(B.lit(0.08)), B.vec3(B.lit(0.92)), other), amount), weight: 12 },
      { value: () => B.call('mix', B.binary(color, '*', B.vec3(B.lit(this.rng.range(0.45, 0.95)))), other, B.binary(a, '*', amount)), weight: 12 },
    ];
    this.metrics.operationDiversity.add('color-step');
    return this.weightedProfile(options)();
  }

  private finalizeColor(color: Expression): Expression {
    const shaded = this.applyGraphicsPipeline(color);
    return B.vec4(B.call('clamp', shaded, B.vec3(B.lit(0.0)), B.vec3(B.lit(1.0))), B.lit(1.0));
  }

  private applyGraphicsPipeline(color: Expression): Expression {
    const p = B.ident('p', 'vec2<f32>');
    const centered = B.ident('centered', 'vec2<f32>');
    const normal = B.call(
      'normalize',
      B.vec3(
        B.binary(B.member(p, 'x'), '*', B.lit(0.36)),
        B.binary(B.member(p, 'y'), '*', B.lit(0.36)),
        B.lit(1.0)
      )
    );
    const lightDir = B.call('normalize', B.vec3(B.lit(-0.42), B.lit(0.58), B.lit(0.70)));
    const viewDir = B.vec3(B.lit(0.0), B.lit(0.0), B.lit(1.0));
    const ndotl = B.call('clamp', B.call('dot', normal, lightDir), B.lit(0.08), B.lit(1.0));
    const halfDir = B.call('normalize', B.binary(lightDir, '+', viewDir));
    const specular = B.binary(
      B.call('pow', B.call('clamp', B.call('dot', normal, halfDir), B.lit(0.0), B.lit(1.0)), B.lit(28.0)),
      '*',
      B.lit(0.16)
    );
    const fresnel = B.call(
      'pow',
      B.binary(B.lit(1.0), '-', B.call('clamp', B.call('dot', normal, viewDir), B.lit(0.0), B.lit(1.0))),
      B.lit(3.0)
    );
    const ao = B.call(
      'clamp',
      B.binary(B.lit(1.0), '-', B.binary(B.call('length', centered), '*', B.lit(0.32))),
      B.lit(0.55),
      B.lit(1.0)
    );
    const skyBounce = B.call(
      'mix',
      B.vec3(B.lit(0.05), B.lit(0.06), B.lit(0.08)),
      B.binary(B.member(color, 'yzx'), '*', B.vec3(B.lit(0.32))),
      B.call('clamp', B.binary(B.binary(B.member(normal, 'y'), '*', B.lit(0.5)), '+', B.lit(0.5)), B.lit(0.0), B.lit(1.0))
    );
    const groundBounce = B.binary(
      B.member(color, 'zxy'),
      '*',
      B.vec3(B.call('clamp', B.binary(B.lit(0.45), '-', B.binary(B.member(normal, 'y'), '*', B.lit(0.35))), B.lit(0.0), B.lit(0.32)))
    );
    const gi = B.binary(skyBounce, '+', groundBounce);
    const diffuse = B.binary(color, '*', B.vec3(B.binary(B.lit(0.30), '+', B.binary(ndotl, '*', B.lit(0.74)))));
    const rim = B.binary(B.member(color, 'zyx'), '*', B.vec3(B.binary(fresnel, '*', B.lit(0.16))));
    const lit = B.binary(
      B.binary(B.binary(B.binary(diffuse, '+', gi), '+', rim), '+', B.vec3(specular)),
      '*',
      B.vec3(ao)
    );
    const luma = B.call('dot', lit, B.vec3(B.lit(0.2126), B.lit(0.7152), B.lit(0.0722)));
    const bloom = B.call('smoothstep', B.lit(0.58), B.lit(1.12), luma);
    const focusDepth = B.call('smoothstep', B.lit(0.16), B.lit(1.18), B.call('length', centered));
    const dofSoft = B.call(
      'mix',
      lit,
      B.binary(B.vec3(luma), '+', B.binary(B.member(color, 'yzx'), '*', B.vec3(B.lit(0.18)))),
      B.binary(focusDepth, '*', B.lit(0.18))
    );
    const vignette = B.binary(
      B.lit(1.0),
      '-',
      B.binary(B.call('smoothstep', B.lit(0.28), B.lit(1.42), B.call('length', centered)), '*', B.lit(0.42))
    );
    const composed = B.binary(
      B.binary(dofSoft, '+', B.binary(B.binary(lit, '*', B.vec3(bloom)), '*', B.vec3(B.lit(0.22)))),
      '*',
      B.vec3(vignette)
    );
    const toneMapped = B.binary(composed, '/', B.binary(composed, '+', B.vec3(B.lit(1.0))));
    return B.call(
      'pow',
      B.call('clamp', toneMapped, B.vec3(B.lit(0.0)), B.vec3(B.lit(1.0))),
      B.vec3(B.lit(0.454545))
    );
  }

  private palette(field: Expression): Expression {
    return B.call(
      'f_pal',
      field,
      B.vec3(B.lit(this.rng.range(0.18, 0.58)), B.lit(this.rng.range(0.18, 0.58)), B.lit(this.rng.range(0.18, 0.58))),
      B.vec3(B.lit(this.rng.range(0.35, 0.75)), B.lit(this.rng.range(0.35, 0.75)), B.lit(this.rng.range(0.35, 0.75))),
      B.vec3(B.lit(this.rng.range(0.55, 1.9)), B.lit(this.rng.range(0.55, 1.9)), B.lit(this.rng.range(0.55, 1.9))),
      B.vec3(B.lit(this.rng.range(0, 1)), B.lit(this.rng.range(0, 1)), B.lit(this.rng.range(0, 1)))
    );
  }

  private generateIndependentColor(): Expression {
    return B.vec3(
      this.colorChannelField(),
      this.colorChannelField(),
      this.colorChannelField()
    );
  }

  private generateMask(): Expression {
    const field = this.generateField();
    const [low, high] = this.thresholdPair();
    return this.weightedProfile([
      { value: () => B.call('smoothstep', low, high, field), weight: 18 },
      { value: () => B.call('step', B.lit(this.rng.range(0.25, 0.85)), field), weight: 3 },
      { value: () => B.call('smoothstep', low, high, B.call('fract', B.binary(field, '*', B.lit(this.freq(0.8, 3.5))))), weight: 14 },
      { value: () => B.call('step', B.lit(this.rng.range(0.25, 0.85)), B.call('fract', B.binary(field, '*', B.lit(this.freq(0.8, 3.2))))), weight: 2 },
      { value: () => B.call('smoothstep', low, high, B.call('abs', B.call('sin', B.binary(field, '*', B.lit(this.freq(0.8, 4.2)))))), weight: 18 },
    ])();
  }

  private generateScalar01(): Expression {
    return B.call('fract', B.binary(this.generateField(), '+', B.lit(this.rng.range(0, 1))));
  }

  private generateField(): Expression {
    return this.composeField(0);
  }

  private composeField(depth: number): Expression {
    if (depth >= this.profile.fieldDepthLimit) {
      return this.generateBasisField();
    }

    const left = this.rng.chance(0.35) ? this.generateBasisField() : this.composeField(depth + 1);
    const right = this.rng.chance(0.45) ? this.generateBasisField() : this.composeField(depth + 1);

    this.metrics.nodeCount += 5;
    this.metrics.operationDiversity.add('field-composition');

    const ops: { value: () => Expression; weight: number }[] = [
      { value: () => B.binary(B.binary(left, '*', B.lit(this.rng.range(0.25, 1.25))), '+', B.binary(right, '*', B.lit(this.rng.range(0.25, 1.25)))), weight: 30 },
      { value: () => B.call('sin', B.binary(B.binary(left, '*', B.lit(this.freq(0.7, 3.8))), '+', right)), weight: 20 },
      { value: () => B.call('cos', B.binary(B.binary(left, '-', right), '*', B.lit(this.freq(0.7, 3.8)))), weight: 18 },
      { value: () => B.call('fract', B.binary(left, '+', B.binary(right, '*', B.lit(this.freq(0.45, 1.8))))), weight: 3 },
      { value: () => B.call('smoothstep', ...this.thresholdPair(), B.call('fract', B.binary(B.binary(left, '+', right), '*', B.lit(this.freq(0.7, 3))))), weight: 10 },
    ];
    return this.weightedProfile(ops)();
  }

  private generateBasisField(): Expression {
    const domain = this.generateDomain();
    const x = B.member(domain, 'x');
    const y = B.member(domain, 'y');
    const linear = B.call('dot', domain, B.vec2(B.lit(this.rng.range(-3, 3)), B.lit(this.rng.range(-3, 3))));
    const curved = B.call('length', B.binary(domain, '-', B.vec2(B.lit(this.rng.range(-0.8, 0.8)), B.lit(this.rng.range(-0.8, 0.8)))));
    const quantized = B.call('f_hash', B.call('floor', B.binary(domain, '*', B.lit(this.freq(2, 14)))));
    const angular = B.call('atan2', y, x);
    const product = B.binary(x, '*', y);
    const cursorField = B.call(
      'length',
      B.binary(
        B.ident('uv'),
        '-',
        B.ident('mouseNorm')
      )
    );
    const scrollField = B.binary(
      B.member(B.ident('scroll'), 'y'),
      '+',
      B.binary(B.member(B.ident('uv'), 'y'), '*', B.lit(this.freq(1, 6)))
    );

    this.metrics.nodeCount += 8;
    this.metrics.operationDiversity.add('basis-field');

    const bases: { value: () => Expression; weight: number }[] = [
      { value: () => x, weight: 10 },
      { value: () => y, weight: 10 },
      { value: () => linear, weight: 22 },
      { value: () => curved, weight: 22 },
      { value: () => quantized, weight: 4 * this.profile.quantizationBias },
      { value: () => angular, weight: 12 },
      { value: () => product, weight: 14 },
      { value: () => B.call('sin', B.binary(B.binary(linear, '*', B.lit(this.freq(0.8, 4))), '+', B.binary(B.ident('t'), '*', B.lit(this.rng.range(-2, 2))))), weight: 14 },
    ];
    if (this.currentIntent() === 'cursor') {
      bases.push(
        { value: () => cursorField, weight: 50 },
        { value: () => B.call('smoothstep', B.lit(0.02), B.lit(0.45), cursorField), weight: 40 },
      );
    }
    if (this.currentIntent() === 'scroll') {
      bases.push(
        { value: () => B.binary(B.member(B.ident('scroll'), 'y'), '+', B.binary(linear, '*', B.lit(0.25))), weight: 45 },
        { value: () => B.call('sin', scrollField), weight: 45 },
      );
    }
    if (this.currentIntent() === 'math') {
      bases.push(
        { value: () => B.call('cos', B.binary(angular, '*', B.lit(this.freq(1, 6)))), weight: 32 },
        { value: () => B.call('sin', B.binary(product, '*', B.lit(this.freq(2, 12)))), weight: 32 },
      );
    }
    if (this.currentIntent() === 'physics') {
      bases.push(
        { value: () => B.binary(B.lit(1.0), '/', B.binary(B.lit(0.12), '+', curved)), weight: 38 },
        { value: () => B.call('sin', B.binary(B.binary(curved, '*', B.lit(this.freq(1, 8))), '-', B.binary(B.ident('t'), '*', B.lit(this.rng.range(0.3, 2.2))))), weight: 34 },
      );
    }
    return this.weightedProfile(bases)();
  }

  private generateDomain(): Expression {
    const domains: { value: () => Expression; weight: number }[] = [
      { value: () => B.ident('p'), weight: 38 },
      { value: () => B.ident('uv'), weight: 28 },
      { value: () => B.call('f_rot', B.ident('p'), B.lit(this.rng.range(-2.4, 2.4))), weight: 24 },
      { value: () => B.call('fract', B.binary(B.ident('uv'), '*', B.vec2(B.lit(this.freq(1.5, 8)), B.lit(this.freq(1.5, 8))))), weight: 8 },
    ];
    this.metrics.operationDiversity.add('domain-transform');
    return this.weightedProfile(domains)();
  }

  private colorChannelField(): Expression {
    const field = this.generateField();
    const channels: { value: () => Expression; weight: number }[] = [
      { value: () => B.call('fract', B.binary(field, '+', B.lit(this.rng.range(0, 1)))), weight: 10 },
      { value: () => B.binary(B.binary(B.call('sin', B.binary(field, '*', B.lit(this.freq(0.7, 3.8)))), '*', B.lit(0.5)), '+', B.lit(0.5)), weight: 28 },
      { value: () => B.call('abs', B.call('sin', B.binary(field, '*', B.lit(this.freq(0.7, 4.2))))), weight: 12 },
      { value: () => B.call('smoothstep', ...this.thresholdPair(), B.call('fract', field)), weight: 8 },
      { value: () => B.call('step', B.lit(this.rng.range(0.2, 0.8)), B.call('fract', field)), weight: 1 },
    ];
    return this.weightedProfile(channels)();
  }

  // ---- Expression Generators (by type) ----

  /**
   * Generate a scalar (f32) expression
   */
  private genScalar(depth: number): Expression {
    this.metrics.nodeCount++;
    this.metrics.maxDepthReached = Math.max(this.metrics.maxDepthReached, depth);

    // Force leaf at max depth
    if (depth >= this.config.maxDepth) {
      return this.genScalarLeaf();
    }

    const choice = this.rng.weighted([
      { value: 'leaf', weight: this.config.weights.literal + this.config.weights.identifier },
      { value: 'binary', weight: this.config.weights.binary },
      { value: 'unary', weight: this.config.weights.unary },
      { value: 'call', weight: this.config.weights.call },
    ]);

    switch (choice) {
      case 'leaf':
        return this.genScalarLeaf();
      case 'binary':
        return this.genScalarBinary(depth + 1);
      case 'unary':
        return this.genScalarUnary(depth + 1);
      case 'call':
        return this.genScalarCall(depth + 1);
      default:
        return this.genScalarLeaf();
    }
  }

  private genScalarLeaf(): Expression {
    const options = [
      { value: 'literal', weight: 20 },
      { value: 'uv_x', weight: 25 },
      { value: 'uv_y', weight: 25 },
      { value: 'time', weight: this.config.effects.timeAnimation ? 20 : 0 },
      { value: 'centered_x', weight: 15 },
      { value: 'centered_y', weight: 15 },
      { value: 'p_x', weight: 25 },
      { value: 'p_y', weight: 25 },
      { value: 'radius', weight: 20 },
      { value: 'angle', weight: 12 },
      { value: 'cell_hash', weight: 18 },
    ];

    const choice = this.rng.weighted(options);

    switch (choice) {
      case 'literal':
        return B.lit(this.rng.range(0, 1));
      case 'uv_x':
        return B.member(B.ident('uv'), 'x');
      case 'uv_y':
        return B.member(B.ident('uv'), 'y');
      case 'time':
        this.metrics.hasTimeVariation = true;
        return B.ident('t');
      case 'centered_x':
        return B.member(B.ident('centered'), 'x');
      case 'centered_y':
        return B.member(B.ident('centered'), 'y');
      case 'p_x':
        return B.member(B.ident('p'), 'x');
      case 'p_y':
        return B.member(B.ident('p'), 'y');
      case 'radius':
        return B.call('length', B.ident('p'));
      case 'angle':
        return B.call('atan2', B.member(B.ident('p'), 'y'), B.member(B.ident('p'), 'x'));
      case 'cell_hash':
        return B.call('f_hash', B.binary(B.ident('p'), '*', B.lit(this.rng.range(3, 18))));
      default:
        return B.lit(0.5);
    }
  }

  private genScalarBinary(depth: number): Expression {
    const ops = ['+', '-', '*'];
    const op = this.rng.pick(ops);

    this.metrics.operationDiversity.add(op);

    const left = this.genScalar(depth);
    const right = this.genScalar(depth);

    // Use safe division for / operator
    if (this.rng.chance(0.2)) {
      this.metrics.operationDiversity.add('/');
      return B.safeDiv(left, right);
    }

    return B.binary(left, op as any, right);
  }

  private genScalarUnary(depth: number): Expression {
    const op = '-' as const;
    this.metrics.operationDiversity.add(`unary${op}`);
    return B.unary(op, this.genScalar(depth));
  }

  private genScalarCall(depth: number): Expression {
    const funcs = [
      'sin', 'cos', 'abs', 'fract', 'floor', 'ceil',
      'sqrt', 'exp', 'log', 'saturate', 'atan2',
    ];
    const func = this.rng.pick(funcs);

    this.metrics.operationDiversity.add(func);

    // Some functions need special handling
    switch (func) {
      case 'sin':
      case 'cos':
        // Often used with time or scaled UV
        if (this.rng.chance(0.6)) {
          const scale = B.lit(this.rng.range(1, 10));
          const arg = this.genScalar(depth);
          return B.call(func, B.binary(arg, '*', scale));
        }
        return B.call(func, this.genScalar(depth));

      case 'sqrt':
        // sqrt needs positive input - use abs
        return B.call('sqrt', B.call('abs', this.genScalar(depth)));

      case 'log':
        // log needs positive input - clamp to minimum
        return B.call('log', B.call('max', this.genScalar(depth), B.lit(0.001)));

      case 'atan2':
        return B.call('atan2', this.genScalar(depth), this.genScalar(depth));

      case 'smoothstep':
        // Use invariant-safe smoothstep
        return B.smoothstep(
          B.lit(this.rng.range(0, 0.4)),
          B.lit(this.rng.range(0.5, 1)),
          this.genScalar(depth)
        );

      case 'mix':
        return B.call('mix',
          this.genScalar(depth),
          this.genScalar(depth),
          B.call('saturate', this.genScalar(depth))
        );

      case 'clamp':
        return B.clamp(
          this.genScalar(depth),
          B.lit(this.rng.range(0, 0.3)),
          B.lit(this.rng.range(0.7, 1))
        );

      case 'pow':
        // pow(negative, non-integer) is undefined - use abs
        return B.call('pow',
          B.call('abs', this.genScalar(depth)),
          B.lit(this.rng.range(0.5, 3))
        );

      default:
        return B.call(func, this.genScalar(depth));
    }
  }

  /**
   * Generate a vec2 expression
   */
  private genVec2(depth: number): Expression {
    this.metrics.nodeCount++;

    if (this.rng.chance(0.6)) {
      // Use UV directly or transformed
      const base = this.rng.chance(0.55) ? B.ident('p') : B.ident('uv');
      if (this.rng.chance(0.3)) {
        return B.binary(base, '*', B.lit(this.rng.range(1, 5)));
      }
      return base;
    }

    // Construct from scalars
    return B.vec2(this.genScalar(depth), this.genScalar(depth));
  }

  /**
   * Generate a vec3 expression
   */
  private genVec3(depth: number): Expression {
    this.metrics.nodeCount++;

    // Construct from scalars
    return B.vec3(
      this.genScalar(depth),
      this.genScalar(depth),
      this.genScalar(depth)
    );
  }

  /**
   * Generate a vec4 expression
   */
  private genVec4(depth: number): Expression {
    this.metrics.nodeCount++;

    // Most common: vec3 color + alpha
    return B.vec4(
      this.genScalar(depth),
      this.genScalar(depth),
      this.genScalar(depth),
      B.lit(1.0)
    );
  }

  // ---- Utility ----

  /**
   * Get current complexity metrics
   */
  getMetrics(): ComplexityMetrics & { score: number } {
    return {
      ...this.metrics,
      operationDiversity: new Set(this.metrics.operationDiversity),
      uniformsUsed: new Set(this.metrics.uniformsUsed),
      score: computeComplexityScore(this.metrics),
    };
  }

  /**
   * Reset generator with new seed
   */
  reseed(seed?: number): void {
    this.rng = new SeededRandom(seed);
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Generate a complete shader program
 */
export function generateShader(config?: Partial<GeneratorConfig>): Program {
  return new ShaderGenerator(config).generateProgram();
}

/**
 * Generate a complete vertex + fragment shader program
 */
export function generateVertexFragmentShader(config?: Partial<GeneratorConfig>): Program {
  return new ShaderGenerator(config).generateVertexFragmentProgram();
}

/**
 * Generate a complete compute shader program
 */
export function generateComputeShader(config?: Partial<GeneratorConfig>): Program {
  return new ShaderGenerator(config).generateComputeProgram();
}

/**
 * Generate a color expression (for injection/mutation)
 */
export function generateColor(config?: Partial<GeneratorConfig>): Expression {
  return new ShaderGenerator(config).generateColorExpression();
}
