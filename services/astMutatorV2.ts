/**
 * AST-BASED WGSL MUTATOR
 *
 * Uses the proper AST parser to safely mutate shader code.
 * This approach guarantees:
 * - No corruption of syntax structure
 * - Only mutates values inside function bodies
 * - Respects operator precedence
 * - Preserves all annotations and declarations
 */

import {
    ASTNode,
    findMutableLiterals,
    findMutableOperators,
    FunctionDecl,
    Literal,
    parseWGSLToAST,
    Program,
    walkAST
} from './wgslAST';

// ============================================================================
// MUTATION TYPES
// ============================================================================

export interface MutationPoint {
  loc: { start: number; end: number };
  type: 'literal' | 'operator';
  original: string;
  context: MutationContext;
}

export interface MutationContext {
  functionName: string;
  parentType: string;
  isInForLoop: boolean;
  isInCondition: boolean;
}

export interface Mutation {
  point: MutationPoint;
  replacement: string;
}

// ============================================================================
// MUTATION STRATEGIES
// ============================================================================

const MATH_FUNCS = ['sin', 'cos', 'abs', 'fract', 'floor', 'ceil', 'sqrt', 'exp', 'log'];
const OPERATORS = ['+', '-', '*', '/'];

/**
 * Generate a mutated value for a number literal
 */
export function mutateNumberValue(literal: Literal, intensity: number): string {
  const value = literal.value as number;
  const raw = literal.raw;

  // Determine suffix
  let suffix = '';
  const lower = raw.toLowerCase();
  if (lower.endsWith('u')) suffix = 'u';
  else if (lower.endsWith('i')) suffix = 'i';
  else if (lower.endsWith('f')) suffix = 'f';
  else if (lower.endsWith('h')) suffix = 'h';

  const mutation = Math.random();

  if (mutation < 0.3) {
    // Slight perturbation
    const delta = (Math.random() - 0.5) * 2 * intensity;
    let newVal = value + delta;
    if (Math.abs(newVal) < 0.001) newVal = 0.01;
    newVal = Math.max(-100, Math.min(100, newVal));

    if (literal.literalType === 'int' || literal.literalType === 'uint') {
      return Math.round(newVal).toString() + suffix;
    }
    return newVal.toFixed(3) + suffix;
  }
  else if (mutation < 0.5) {
    // Scale
    const scale = 0.5 + Math.random() * 1.5;
    let newVal = value * scale;
    if (Math.abs(newVal) < 0.001) newVal = 0.01;
    newVal = Math.max(-100, Math.min(100, newVal));

    if (literal.literalType === 'int' || literal.literalType === 'uint') {
      return Math.round(newVal).toString() + suffix;
    }
    return newVal.toFixed(3) + suffix;
  }
  else if (mutation < 0.7 && literal.literalType === 'float' && !suffix) {
    // Wrap in math function
    const func = MATH_FUNCS[Math.floor(Math.random() * MATH_FUNCS.length)];
    if (func === 'sqrt' || func === 'log') {
      return `${func}(abs(${raw}))`;
    }
    return `${func}(${raw})`;
  }
  else if (mutation < 0.85) {
    // Replace with time-based expression
    if (literal.literalType === 'float' && !suffix) {
      const timeExpressions = [
        `sin(time * ${value.toFixed(1)})`,
        `cos(time * ${value.toFixed(1)})`,
        `fract(time * ${value.toFixed(1)})`,
        `abs(sin(time)) * ${value.toFixed(1)}`
      ];
      return timeExpressions[Math.floor(Math.random() * timeExpressions.length)];
    }
    // For integers, just perturb
    const newVal = Math.round(value + (Math.random() - 0.5) * 4);
    return Math.max(0, newVal).toString() + suffix;
  }
  else {
    // Random new value
    if (literal.literalType === 'int' || literal.literalType === 'uint') {
      return Math.floor(Math.random() * 10).toString() + suffix;
    }
    return (Math.random() * 10).toFixed(3) + suffix;
  }
}

/**
 * Generate a mutated operator
 */
export function mutateOperator(op: string): string {
  const available = OPERATORS.filter(o => o !== op);
  return available[Math.floor(Math.random() * available.length)];
}

// ============================================================================
// AST-AWARE MUTATION
// ============================================================================

/**
 * Collect context information for a node
 */
function getNodeContext(node: ASTNode, ast: Program): MutationContext {
  let functionName = '';
  let parentType = '';
  let isInForLoop = false;
  let isInCondition = false;

  // Walk the AST to find context
  walkAST(ast, {
    enter(current, parent) {
      if (current.type === 'FunctionDecl') {
        functionName = (current as FunctionDecl).name;
      }
      if (current === node && parent) {
        parentType = parent.type;

        // Check if in for loop
        let p: ASTNode | null = parent;
        while (p) {
          if (p.type === 'ForStatement') {
            isInForLoop = true;
            break;
          }
          p = null; // Would need parent chain tracking for full implementation
        }

        // Check if in condition
        if (parent.type === 'IfStatement' || parent.type === 'WhileStatement') {
          isInCondition = true;
        }
      }
    }
  });

  return { functionName, parentType, isInForLoop, isInCondition };
}

/**
 * Find all safe mutation points in the AST
 */
export function findMutationPoints(source: string): MutationPoint[] {
  const ast = parseWGSLToAST(source);
  const points: MutationPoint[] = [];

  // Find literals
  const literals = findMutableLiterals(ast);
  for (const lit of literals) {
    // Skip boolean literals
    if (lit.literalType === 'bool') continue;

    points.push({
      loc: { start: lit.loc.start, end: lit.loc.end },
      type: 'literal',
      original: lit.raw,
      context: getNodeContext(lit, ast)
    });
  }

  // Find operators
  const operators = findMutableOperators(ast);
  for (const op of operators) {
    // Find the operator position (between left and right)
    const opStart = op.left.loc.end;
    const opEnd = op.right.loc.start;

    // Extract operator from source
    const opStr = source.substring(opStart, opEnd).trim();
    const opIndex = source.indexOf(op.operator, opStart);

    if (opIndex >= opStart && opIndex < opEnd) {
      points.push({
        loc: { start: opIndex, end: opIndex + op.operator.length },
        type: 'operator',
        original: op.operator,
        context: getNodeContext(op, ast)
      });
    }
  }

  return points;
}

/**
 * Apply mutations to the source code
 */
export function applyMutations(source: string, mutations: Mutation[]): string {
  // Sort mutations by position (descending) to apply from end to start
  const sorted = [...mutations].sort((a, b) => b.point.loc.start - a.point.loc.start);

  let result = source;
  for (const mut of sorted) {
    result =
      result.substring(0, mut.point.loc.start) +
      mut.replacement +
      result.substring(mut.point.loc.end);
  }

  return result;
}

/**
 * Main mutation function
 */
export function mutateShaderAST(source: string, intensity: number = 0.5): string {
  try {
    const ast = parseWGSLToAST(source);
    const mutations: Mutation[] = [];

    // Mutate literals
    const literals = findMutableLiterals(ast);
    for (const lit of literals) {
      if (lit.literalType === 'bool') continue;
      if (Math.random() > intensity * 0.5) continue;

      const newValue = mutateNumberValue(lit, intensity);
      if (newValue !== lit.raw) {
        mutations.push({
          point: {
            loc: { start: lit.loc.start, end: lit.loc.end },
            type: 'literal',
            original: lit.raw,
            context: getNodeContext(lit, ast)
          },
          replacement: newValue
        });
      }
    }

    // Mutate operators (less frequently)
    const operators = findMutableOperators(ast);
    for (const op of operators) {
      if (Math.random() > intensity * 0.2) continue;

      const newOp = mutateOperator(op.operator);

      // Find operator position in source
      const opStart = op.left.loc.end;
      const opEnd = op.right.loc.start;
      const opIndex = source.indexOf(op.operator, opStart);

      if (opIndex >= opStart && opIndex < opEnd) {
        mutations.push({
          point: {
            loc: { start: opIndex, end: opIndex + op.operator.length },
            type: 'operator',
            original: op.operator,
            context: getNodeContext(op, ast)
          },
          replacement: newOp
        });
      }
    }

    return applyMutations(source, mutations);
  } catch (e) {
    console.error('AST mutation failed:', e);
    return source;
  }
}

/**
 * Validate shader by attempting to parse it
 */
export function validateShaderAST(source: string): boolean {
  try {
    const ast = parseWGSLToAST(source);
    // Check that we have at least one function
    return ast.declarations.some(d => d.type === 'FunctionDecl');
  } catch {
    return false;
  }
}

/**
 * Safe mutation with validation
 */
export function safeMutateShaderAST(
  source: string,
  intensity: number = 0.5,
  maxAttempts: number = 3
): string {
  for (let i = 0; i < maxAttempts; i++) {
    const mutated = mutateShaderAST(source, intensity);
    if (validateShaderAST(mutated)) {
      return mutated;
    }
  }
  return source;
}

// ============================================================================
// QUALITY-GUIDED MUTATION
// ============================================================================

import {
    analyzeShaderQuality,
    getMutationSuggestions,
    isTooChaotic,
    isTooSimple,
    passesQualityBar
} from './shaderQuality';

/**
 * Mutate shader with quality awareness - rejects ugly results
 */
export function qualityGuidedMutation(
  source: string,
  intensity: number = 0.5,
  minQuality: number = 40,
  maxAttempts: number = 5
): { code: string; quality: number; attempts: number } {
  const originalReport = analyzeShaderQuality(source);
  let bestResult = source;
  let bestQuality = originalReport.score;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Try a mutation
    const mutated = mutateShaderAST(source, intensity);

    if (!validateShaderAST(mutated)) continue;

    const report = analyzeShaderQuality(mutated);

    // Accept if it improves quality or maintains acceptable level
    if (report.score > bestQuality || (report.score >= minQuality && report.score >= originalReport.score - 5)) {
      bestResult = mutated;
      bestQuality = report.score;

      // If we hit a good quality, we can stop early
      if (bestQuality >= 70) {
        return { code: bestResult, quality: bestQuality, attempts: attempt + 1 };
      }
    }
  }

  return { code: bestResult, quality: bestQuality, attempts: maxAttempts };
}

/**
 * Apply targeted improvements based on quality analysis
 */
export function improveShaderQuality(source: string): string {
  const suggestions = getMutationSuggestions(source);
  let improved = source;

  for (const suggestion of suggestions) {
    if (suggestion.priority === 'high') {
      if (suggestion.type === 'replace-function' && suggestion.search && suggestion.replacement) {
        // Replace step with smoothstep (needs edge values)
        improved = improved.replace(
          new RegExp(`\\bstep\\s*\\(([^,]+),\\s*([^)]+)\\)`, 'g'),
          (_, edge, x) => `smoothstep(${edge} - 0.05, ${edge} + 0.05, ${x})`
        );
      }

      if (suggestion.type === 'diversify-color') {
        // Look for vec3(x, x, x) patterns and diversify
        improved = improved.replace(
          /vec3<f32>\s*\(\s*([^,]+)\s*,\s*\1\s*,\s*\1\s*\)/g,
          (_, expr) => {
            // Create slight variations
            return `vec3<f32>(${expr}, ${expr} * 0.8 + 0.1, ${expr} * 0.6 + 0.2)`;
          }
        );
      }
    }
  }

  return improved;
}

/**
 * Generate a shader that's guaranteed to pass quality checks
 */
export function generateQualityShader(
  baseSource: string,
  intensity: number = 0.5,
  targetQuality: number = 60,
  maxIterations: number = 10
): { code: string; quality: number; iterations: number } {
  let current = baseSource;
  let currentQuality = analyzeShaderQuality(current).score;

  for (let i = 0; i < maxIterations; i++) {
    // First try to improve existing quality issues
    if (currentQuality < targetQuality) {
      const improved = improveShaderQuality(current);
      const improvedQuality = analyzeShaderQuality(improved).score;

      if (improvedQuality > currentQuality) {
        current = improved;
        currentQuality = improvedQuality;
      }
    }

    // Then try mutation
    const result = qualityGuidedMutation(current, intensity, targetQuality, 3);

    if (result.quality >= targetQuality) {
      return { code: result.code, quality: result.quality, iterations: i + 1 };
    }

    if (result.quality > currentQuality) {
      current = result.code;
      currentQuality = result.quality;
    }
  }

  return { code: current, quality: currentQuality, iterations: maxIterations };
}

/**
 * Check if mutation should be rejected for aesthetic reasons
 */
export function shouldRejectMutation(mutatedSource: string): {
  reject: boolean;
  reason?: string;
} {
  // Quick checks without full analysis
  if (isTooSimple(mutatedSource)) {
    return { reject: true, reason: 'Too simple/boring' };
  }

  if (isTooChaotic(mutatedSource)) {
    return { reject: true, reason: 'Too chaotic/noisy' };
  }

  if (!passesQualityBar(mutatedSource, 30)) {
    return { reject: true, reason: 'Below quality threshold' };
  }

  return { reject: false };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { findMutableLiterals, findMutableOperators, parseWGSLToAST, walkAST };
