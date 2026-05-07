/**
 * SHADER QUALITY ANALYZER
 *
 * Uses AST analysis to detect "ugly" or uninteresting shader patterns
 * and guide mutations toward more aesthetic results.
 *
 * UGLY PATTERNS TO AVOID:
 * - Solid colors (no variation)
 * - Grid/stripe patterns (heavy use of floor/step without smoothing)
 * - Harsh edges (step without smoothstep)
 * - Moiré patterns (high-frequency sin/cos without damping)
 * - NaN generators (division by values that could be zero)
 * - Uniform gray (r ≈ g ≈ b with low saturation)
 * - Excessive repetition (same expression repeated)
 * - Too simple (just UV coordinates)
 * - Too chaotic (too many nested operations)
 *
 * BEAUTIFUL PATTERNS TO ENCOURAGE:
 * - Smooth gradients (mix, smoothstep)
 * - Color palettes (cosine palette, hue rotation)
 * - Organic noise (fbm, voronoi, perlin)
 * - Time-based animation with reasonable frequencies
 * - Layered effects (multiple blended elements)
 * - Geometric harmony (circles, spirals, waves)
 */

import {
    ASTNode,
    BinaryExpression,
    CallExpression,
    Literal,
    Program,
    parseWGSLToAST,
    walkAST
} from './wgslAST';

// ============================================================================
// QUALITY METRICS
// ============================================================================

export interface ShaderQualityReport {
  score: number;           // 0-100, higher is better
  issues: QualityIssue[];
  suggestions: string[];
  metrics: QualityMetrics;
}

export interface QualityIssue {
  severity: 'warning' | 'error';
  type: string;
  message: string;
  location?: { start: number; end: number };
}

export interface QualityMetrics {
  complexity: number;         // Expression depth
  colorDiversity: number;     // How different are R, G, B channels
  smoothness: number;         // Ratio of smooth functions to harsh ones
  dynamism: number;           // Time-based variation
  noiseUsage: number;         // Organic noise functions
  repetitionScore: number;    // How much code is repeated
  mathBalance: number;        // Balance of different operations
}

// ============================================================================
// PATTERN DETECTORS
// ============================================================================

/**
 * Counts function calls of each type
 */
function countFunctionCalls(ast: Program): Map<string, number> {
  const counts = new Map<string, number>();

  walkAST(ast, {
    enter(node) {
      if (node.type === 'CallExpression') {
        const call = node as CallExpression;
        const name = call.callee;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
  });

  return counts;
}

/**
 * Counts binary operators of each type
 */
function countOperators(ast: Program): Map<string, number> {
  const counts = new Map<string, number>();

  walkAST(ast, {
    enter(node) {
      if (node.type === 'BinaryExpression') {
        const op = (node as BinaryExpression).operator;
        counts.set(op, (counts.get(op) || 0) + 1);
      }
    }
  });

  return counts;
}

/**
 * Calculate maximum expression depth
 */
function getMaxExpressionDepth(node: ASTNode): number {
  let maxDepth = 0;

  function walk(n: ASTNode, depth: number) {
    maxDepth = Math.max(maxDepth, depth);

    if (n.type === 'BinaryExpression') {
      const bin = n as BinaryExpression;
      walk(bin.left, depth + 1);
      walk(bin.right, depth + 1);
    } else if (n.type === 'CallExpression') {
      const call = n as CallExpression;
      for (const arg of call.args) {
        walk(arg, depth + 1);
      }
    } else if (n.type === 'UnaryExpr') {
      walk((n as any).argument, depth + 1);
    }
  }

  walk(node, 0);
  return maxDepth;
}

/**
 * Find all literal values
 */
function findLiterals(ast: Program): Literal[] {
  const literals: Literal[] = [];

  walkAST(ast, {
    enter(node) {
      if (node.type === 'Literal') {
        literals.push(node as Literal);
      }
    }
  });

  return literals;
}

/**
 * Check for potential division by zero
 */
function findDivisionByZeroRisks(ast: Program, source: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  walkAST(ast, {
    enter(node) {
      if (node.type === 'BinaryExpression') {
        const bin = node as BinaryExpression;
        if (bin.operator === '/') {
          // Check if divisor is a literal zero or small number
          if (bin.right.type === 'Literal') {
            const lit = bin.right as Literal;
            if (typeof lit.value === 'number' && Math.abs(lit.value) < 0.001) {
              issues.push({
                severity: 'error',
                type: 'division-by-zero',
                message: 'Division by zero or near-zero value',
                location: bin.loc
              });
            }
          }

          // Check if divisor is just a variable that could be zero
          if (bin.right.type === 'Identifier') {
            // Check if it's wrapped in abs() or max()
            const rightSrc = source.substring(bin.right.loc.start, bin.right.loc.end);
            if (!rightSrc.includes('abs') && !rightSrc.includes('max')) {
              issues.push({
                severity: 'warning',
                type: 'potential-division-by-zero',
                message: 'Division by variable that could be zero',
                location: bin.loc
              });
            }
          }
        }
      }
    }
  });

  return issues;
}

/**
 * Detect harsh patterns (step without smoothstep)
 */
function detectHarshPatterns(funcCounts: Map<string, number>): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const stepCount = funcCounts.get('step') || 0;
  const smoothstepCount = funcCounts.get('smoothstep') || 0;
  const floorCount = funcCounts.get('floor') || 0;
  const fractCount = funcCounts.get('fract') || 0;

  // Too much step without smoothstep
  if (stepCount > 2 && smoothstepCount === 0) {
    issues.push({
      severity: 'warning',
      type: 'harsh-edges',
      message: `Heavy use of step() (${stepCount}x) without smoothstep() creates harsh edges`
    });
  }

  // Too much floor/fract creates grid patterns
  if (floorCount + fractCount > 4 && smoothstepCount < 2) {
    issues.push({
      severity: 'warning',
      type: 'grid-pattern',
      message: `Heavy floor/fract usage (${floorCount + fractCount}x) may create grid artifacts`
    });
  }

  return issues;
}

/**
 * Detect high-frequency oscillation (moiré risk)
 */
function detectHighFrequency(ast: Program, source: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  walkAST(ast, {
    enter(node) {
      if (node.type === 'CallExpression') {
        const call = node as CallExpression;
        const name = call.callee;

        // Check sin/cos arguments for high multipliers
        if (name === 'sin' || name === 'cos') {
          for (const arg of call.args) {
            // Look for multiplication with high constants
            if (arg.type === 'BinaryExpression') {
              const bin = arg as BinaryExpression;
              if (bin.operator === '*') {
                if (bin.right.type === 'Literal') {
                  const val = (bin.right as Literal).value as number;
                  if (Math.abs(val) > 50) {
                    issues.push({
                      severity: 'warning',
                      type: 'high-frequency',
                      message: `High frequency in ${name}() (${val}x) may cause moiré patterns`,
                      location: call.loc
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  return issues;
}

/**
 * Check for color diversity (R ≈ G ≈ B = gray)
 */
function analyzeColorDiversity(ast: Program, source: string): { score: number; issue?: QualityIssue } {
  // Find vec3 constructions in return statements
  let colorExpressions: string[] = [];

  walkAST(ast, {
    enter(node) {
      if (node.type === 'CallExpression') {
        const call = node as CallExpression;
        const name = call.callee;
        if (name === 'vec3' && call.args.length === 3) {
          // Extract the three channel expressions
          const args = call.args.map(arg =>
            source.substring(arg.loc.start, arg.loc.end)
          );
          colorExpressions.push(...args);
        }
      }
    }
  });

  if (colorExpressions.length < 3) {
    return { score: 50 }; // Can't analyze
  }

  // Check if all expressions are identical (grayscale)
  const unique = new Set(colorExpressions.map(e => e.replace(/\s/g, '')));

  if (unique.size === 1 && colorExpressions.length >= 3) {
    return {
      score: 20,
      issue: {
        severity: 'warning',
        type: 'grayscale',
        message: 'All color channels are identical (grayscale output)'
      }
    };
  }

  // More unique expressions = more color diversity
  const diversityRatio = unique.size / colorExpressions.length;
  return { score: Math.min(100, diversityRatio * 100 + 30) };
}

/**
 * Analyze smoothness (smooth functions vs harsh ones)
 */
function analyzeSmoothness(funcCounts: Map<string, number>): number {
  const smooth = ['smoothstep', 'mix', 'sin', 'cos', 'exp', 'log', 'sqrt', 'pow'];
  const harsh = ['step', 'floor', 'ceil', 'sign', 'round', 'trunc'];

  let smoothCount = 0;
  let harshCount = 0;

  for (const fn of smooth) {
    smoothCount += funcCounts.get(fn) || 0;
  }

  for (const fn of harsh) {
    harshCount += funcCounts.get(fn) || 0;
  }

  if (smoothCount + harshCount === 0) return 50;

  return (smoothCount / (smoothCount + harshCount)) * 100;
}

/**
 * Analyze time-based dynamism
 */
function analyzeDynamism(ast: Program, source: string): number {
  let timeUsage = 0;

  walkAST(ast, {
    enter(node) {
      if (node.type === 'Identifier' && (node as any).name === 'time') {
        timeUsage++;
      }
    }
  });

  // Ideal is 2-5 time references
  if (timeUsage === 0) return 20;
  if (timeUsage <= 2) return 60;
  if (timeUsage <= 5) return 100;
  if (timeUsage <= 10) return 80;
  return 50; // Too much time usage = chaotic
}

/**
 * Check for noise function usage
 */
function analyzeNoiseUsage(funcCounts: Map<string, number>): number {
  const noiseFuncs = ['f_n', 'f_hash', 'noise', 'fbm', 'voronoi', 'perlin'];

  let noiseCount = 0;
  for (const fn of noiseFuncs) {
    noiseCount += funcCounts.get(fn) || 0;
  }

  // Some noise is good, too much is chaotic
  if (noiseCount === 0) return 30;
  if (noiseCount <= 3) return 100;
  if (noiseCount <= 6) return 70;
  return 40;
}

/**
 * Check math balance (variety of operations)
 */
function analyzeMathBalance(funcCounts: Map<string, number>, opCounts: Map<string, number>): number {
  // Good shaders use a variety of functions
  const uniqueFuncs = funcCounts.size;
  const uniqueOps = opCounts.size;

  // Ideal is 4-8 unique functions and 3-4 operators
  const funcScore = Math.min(100, uniqueFuncs * 15);
  const opScore = uniqueOps >= 3 ? 100 : uniqueOps * 30;

  return (funcScore + opScore) / 2;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze shader quality and return a comprehensive report
 */
export function analyzeShaderQuality(source: string): ShaderQualityReport {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];

  try {
    const ast = parseWGSLToAST(source);

    // Count functions and operators
    const funcCounts = countFunctionCalls(ast);
    const opCounts = countOperators(ast);

    // Run all detectors
    issues.push(...findDivisionByZeroRisks(ast, source));
    issues.push(...detectHarshPatterns(funcCounts));
    issues.push(...detectHighFrequency(ast, source));

    // Calculate metrics
    const colorAnalysis = analyzeColorDiversity(ast, source);
    if (colorAnalysis.issue) {
      issues.push(colorAnalysis.issue);
    }

    const metrics: QualityMetrics = {
      complexity: getMaxExpressionDepth(ast),
      colorDiversity: colorAnalysis.score,
      smoothness: analyzeSmoothness(funcCounts),
      dynamism: analyzeDynamism(ast, source),
      noiseUsage: analyzeNoiseUsage(funcCounts),
      repetitionScore: 100, // TODO: implement repetition detection
      mathBalance: analyzeMathBalance(funcCounts, opCounts)
    };

    // Generate suggestions based on issues
    for (const issue of issues) {
      if (issue.type === 'harsh-edges') {
        suggestions.push('Try replacing step() with smoothstep() for softer transitions');
      }
      if (issue.type === 'grid-pattern') {
        suggestions.push('Add mix() or smoothstep() to blend floor/fract effects');
      }
      if (issue.type === 'high-frequency') {
        suggestions.push('Reduce the frequency multiplier or add damping with fract()');
      }
      if (issue.type === 'grayscale') {
        suggestions.push('Use a cosine palette (f_pal) or add hue variation to RGB channels');
      }
      if (issue.type === 'division-by-zero') {
        suggestions.push('Wrap divisor in abs() + small epsilon, or use max(divisor, 0.001)');
      }
    }

    // Add suggestions based on metrics
    if (metrics.dynamism < 40) {
      suggestions.push('Add time-based animation for more dynamic visuals');
    }
    if (metrics.noiseUsage < 40) {
      suggestions.push('Consider adding noise functions (f_n, f_hash) for organic texture');
    }
    if (metrics.smoothness < 40) {
      suggestions.push('Use more smooth functions (sin, cos, mix, smoothstep)');
    }
    if (metrics.colorDiversity < 40) {
      suggestions.push('Add color variation - different expressions for R, G, B channels');
    }

    // Calculate overall score
    const errorPenalty = issues.filter(i => i.severity === 'error').length * 20;
    const warningPenalty = issues.filter(i => i.severity === 'warning').length * 5;

    const metricScore = (
      metrics.colorDiversity * 0.25 +
      metrics.smoothness * 0.2 +
      metrics.dynamism * 0.15 +
      metrics.noiseUsage * 0.15 +
      metrics.mathBalance * 0.15 +
      Math.min(100, metrics.complexity * 10) * 0.1
    );

    const score = Math.max(0, Math.min(100, metricScore - errorPenalty - warningPenalty));

    return { score, issues, suggestions, metrics };
  } catch (e) {
    // If parsing fails, return a basic report
    return {
      score: 0,
      issues: [{
        severity: 'error',
        type: 'parse-error',
        message: `Failed to parse shader: ${e}`
      }],
      suggestions: ['Fix syntax errors before quality analysis'],
      metrics: {
        complexity: 0,
        colorDiversity: 0,
        smoothness: 0,
        dynamism: 0,
        noiseUsage: 0,
        repetitionScore: 0,
        mathBalance: 0
      }
    };
  }
}

// ============================================================================
// QUALITY-GUIDED MUTATION
// ============================================================================

/**
 * Determines if a mutation would improve quality
 */
export function wouldMutationImprove(
  originalScore: number,
  mutatedSource: string
): { improved: boolean; newScore: number; delta: number } {
  const report = analyzeShaderQuality(mutatedSource);
  const delta = report.score - originalScore;

  return {
    improved: delta > 0,
    newScore: report.score,
    delta
  };
}

/**
 * Generate mutation suggestions based on quality analysis
 */
export function getMutationSuggestions(source: string): MutationSuggestion[] {
  const report = analyzeShaderQuality(source);
  const suggestions: MutationSuggestion[] = [];

  // Based on metrics, suggest specific mutations
  if (report.metrics.smoothness < 50) {
    suggestions.push({
      type: 'replace-function',
      description: 'Replace step with smoothstep',
      priority: 'high',
      search: 'step',
      replacement: 'smoothstep'
    });
  }

  if (report.metrics.dynamism < 40) {
    suggestions.push({
      type: 'inject-time',
      description: 'Add time-based variation',
      priority: 'medium'
    });
  }

  if (report.metrics.colorDiversity < 50) {
    suggestions.push({
      type: 'diversify-color',
      description: 'Use cosine palette for color',
      priority: 'high'
    });
  }

  if (report.metrics.noiseUsage < 30) {
    suggestions.push({
      type: 'add-noise',
      description: 'Add organic noise texture',
      priority: 'medium'
    });
  }

  return suggestions;
}

export interface MutationSuggestion {
  type: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  search?: string;
  replacement?: string;
}

// ============================================================================
// BEAUTIFUL PATTERN TEMPLATES
// ============================================================================

/**
 * Templates for beautiful visual patterns that mutations can inject
 */
export const BEAUTIFUL_PATTERNS = {
  // Smooth gradient patterns
  radialGradient: (uv: string) => `length(${uv} - 0.5)`,
  spiralGradient: (uv: string) => `atan2(${uv}.y - 0.5, ${uv}.x - 0.5) / 6.283`,
  diagonalGradient: (uv: string) => `(${uv}.x + ${uv}.y) * 0.5`,

  // Organic patterns
  noiseTexture: (uv: string, scale: number) => `f_n(${uv}.x * ${scale.toFixed(1)})`,
  fbmLayers: (uv: string) => `(f_n(${uv}.x * 2.0) * 0.5 + f_n(${uv}.x * 4.0) * 0.25)`,
  voronoiCells: (uv: string, scale: number) => `f_hash(floor(${uv} * ${scale.toFixed(1)}))`,

  // Color patterns
  cosinePalette: (t: string) =>
    `f_pal(${t}, vec3<f32>(0.5, 0.5, 0.5), vec3<f32>(0.5, 0.5, 0.5), vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(0.0, 0.33, 0.67))`,
  rainbowHue: (t: string) =>
    `vec3<f32>(sin(${t} * 6.283) * 0.5 + 0.5, sin((${t} + 0.333) * 6.283) * 0.5 + 0.5, sin((${t} + 0.666) * 6.283) * 0.5 + 0.5)`,

  // Animated patterns
  pulsingGlow: (base: string) => `${base} * (sin(time * 2.0) * 0.3 + 0.7)`,
  wavyDistortion: (uv: string) => `${uv} + vec2<f32>(sin(${uv}.y * 10.0 + time) * 0.02, 0.0)`,
  rotatingPattern: (uv: string) => `f_rot(${uv} - 0.5, time * 0.5) + 0.5`,

  // Blending helpers
  softBlend: (a: string, b: string) => `mix(${a}, ${b}, smoothstep(0.3, 0.7, time))`,
  layeredEffect: (base: string, overlay: string) => `${base} + ${overlay} * 0.3`,
} as const;

/**
 * Check if a shader is "too simple" (boring)
 */
export function isTooSimple(source: string): boolean {
  const report = analyzeShaderQuality(source);

  // Too simple if:
  // - Very low complexity
  // - No time animation
  // - No noise
  // - Grayscale
  return (
    report.metrics.complexity < 3 ||
    (report.metrics.dynamism < 30 && report.metrics.noiseUsage < 30) ||
    report.metrics.colorDiversity < 30
  );
}

/**
 * Check if a shader is "too chaotic" (ugly noise)
 */
export function isTooChaotic(source: string): boolean {
  const report = analyzeShaderQuality(source);

  // Too chaotic if:
  // - Very high frequency oscillations
  // - Too much noise stacking
  // - Division by zero risks
  const hasErrors = report.issues.some(i => i.severity === 'error');
  const hasHighFreq = report.issues.some(i => i.type === 'high-frequency');

  return hasErrors || (hasHighFreq && report.metrics.noiseUsage > 80);
}

/**
 * Quick check if shader passes basic quality bar
 */
export function passesQualityBar(source: string, minScore: number = 40): boolean {
  const report = analyzeShaderQuality(source);
  return report.score >= minScore && !report.issues.some(i => i.severity === 'error');
}
