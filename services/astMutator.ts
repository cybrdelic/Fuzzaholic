/**
 * AST-BASED WGSL MUTATOR
 *
 * Uses our custom WGSL parser to properly parse WGSL into tokens and
 * extract structural information, then safely mutates only numeric
 * literals and operators INSIDE fn main() / entry points.
 *
 * This eliminates all regex-based corruption issues by understanding
 * the actual structure of the shader code through proper tokenization.
 */

import {
    analyzeShaderHealth,
    ensureShaderHealth,
    isNumberDangerous,
    SAFE_RANGES,
    safeMutateNumber
} from './antiConvergence';
import { validateAndFixShader } from './shaderValidator';
import {
    MutableNumber,
    MutableOperator,
    parseWGSL
} from './wgslParser';

// ============================================================================
// TYPES
// ============================================================================

export interface MutationTarget {
  start: number;      // Character offset in source
  end: number;        // Character offset end
  originalValue: string;
  type: 'number' | 'operator';
  context?: string;   // e.g., 'for-increment', 'binding', etc.
}

// Operator mutation options
const OPERATORS = ['+', '-', '*', '/'];

// Math functions to wrap numbers with
const MATH_FUNCS = ['sin', 'cos', 'abs', 'fract', 'floor', 'ceil', 'sqrt', 'exp', 'log'];

// ============================================================================
// MUTATION FUNCTIONS
// ============================================================================

/**
 * Convert MutableNumber to MutationTarget
 */
function numberToTarget(n: MutableNumber): MutationTarget {
  return {
    start: n.range.start,
    end: n.range.end,
    originalValue: n.value,
    type: 'number',
    context: n.context
  };
}

/**
 * Convert MutableOperator to MutationTarget
 */
function operatorToTarget(o: MutableOperator): MutationTarget {
  return {
    start: o.range.start,
    end: o.range.end,
    originalValue: o.value,
    type: 'operator',
    context: o.context
  };
}

/**
 * Find all mutable numbers using our parser
 */
export function findMutableNumbers(source: string): MutationTarget[] {
  const parsed = parseWGSL(source);

  // Only return numbers that are safe to mutate (expression context)
  return parsed.mutableNumbers
    .filter(n => n.context === 'expression')
    .map(numberToTarget);
}

/**
 * Find all mutable operators using our parser
 */
export function findMutableOperators(source: string): MutationTarget[] {
  const parsed = parseWGSL(source);

  // Only return binary operators (safe to mutate)
  return parsed.mutableOperators
    .filter(o => o.context === 'binary')
    .map(operatorToTarget);
}

// ============================================================================
// MUTATION FUNCTIONS
// ============================================================================

/**
 * Mutate a number value with anti-convergence safeguards
 */
function mutateNumber(value: string, intensity: number): string {
  // Parse the numeric value, handling suffixes
  let numStr = value.toLowerCase();
  let suffix = '';
  if (numStr.endsWith('u') || numStr.endsWith('i') || numStr.endsWith('f') || numStr.endsWith('h')) {
    suffix = value[value.length - 1];
    numStr = numStr.slice(0, -1);
  }

  let num: number;
  if (numStr.startsWith('0x')) {
    num = parseInt(numStr, 16);
  } else {
    num = parseFloat(numStr);
  }

  if (isNaN(num)) return value;

  const mutation = Math.random();

  // Use safe mutation that prevents convergence to dangerous values
  let newVal: number;

  if (mutation < 0.4) {
    // Slight perturbation - but ensure we don't go to zero
    newVal = safeMutateNumber(num, intensity * 0.5, 'amplitude');
  } else if (mutation < 0.7) {
    // Scale - biased away from zero
    const scale = 0.5 + Math.random() * 1.5; // 0.5 to 2.0, never < 0.5
    newVal = num * scale;
    // Anti-convergence: push away from zero
    if (Math.abs(newVal) < SAFE_RANGES.amplitude.min) {
      newVal = Math.sign(newVal || 1) * SAFE_RANGES.amplitude.min * (1 + Math.random());
    }
  } else if (mutation < 0.85 && !suffix) {
    // Wrap in math function (only for non-suffixed numbers)
    const func = MATH_FUNCS[Math.floor(Math.random() * MATH_FUNCS.length)];
    if (func === 'sqrt' || func === 'log') {
      // These need positive input
      return `${func}(abs(${value}))`;
    }
    return `${func}(${value})`;
  } else {
    // Replace with fresh value - in safe range
    newVal = SAFE_RANGES.amplitude.min + Math.random() * (SAFE_RANGES.amplitude.max - SAFE_RANGES.amplitude.min);
  }

  // Final safety check
  if (isNumberDangerous(newVal)) {
    newVal = 0.5 + Math.random() * 2; // Safe fallback
  }

  // Clamp to reasonable range
  newVal = Math.max(-100, Math.min(100, newVal));

  return newVal.toFixed(3) + suffix;
}

/**
 * Mutate an operator
 */
function mutateOperator(value: string, intensity: number): string {
  if (Math.random() > intensity) return value;

  // Pick a different operator
  const available = OPERATORS.filter(op => op !== value);
  return available[Math.floor(Math.random() * available.length)];
}

// ============================================================================
// MAIN MUTATION LOGIC
// ============================================================================

/**
 * Apply mutations to the shader source
 */
export function mutateShader(source: string, intensity: number = 0.5): string {
  const parsed = parseWGSL(source);

  // Get safe mutable targets
  const numbers = parsed.mutableNumbers.filter(n => n.context === 'expression');
  const operators = parsed.mutableOperators.filter(o => o.context === 'binary');

  // Collect all mutations to apply
  const mutations: Array<{ start: number; end: number; newValue: string }> = [];

  // Mutate numbers
  for (const target of numbers) {
    if (Math.random() < intensity * 0.5) {
      const newValue = mutateNumber(target.value, intensity);
      if (newValue !== target.value) {
        mutations.push({
          start: target.range.start,
          end: target.range.end,
          newValue
        });
      }
    }
  }

  // Mutate operators (less frequently)
  for (const target of operators) {
    if (Math.random() < intensity * 0.3) {
      const newValue = mutateOperator(target.value, intensity);
      if (newValue !== target.value) {
        mutations.push({
          start: target.range.start,
          end: target.range.end,
          newValue
        });
      }
    }
  }

  // Apply mutations in reverse order (so positions stay valid)
  mutations.sort((a, b) => b.start - a.start);

  let result = source;
  for (const mut of mutations) {
    result = result.substring(0, mut.start) + mut.newValue + result.substring(mut.end);
  }

  return result;
}

/**
 * Validate that the shader is still valid WGSL
 * Uses our parser to check if it can be tokenized and parsed
 */
export function validateShader(source: string): boolean {
  try {
    const parsed = parseWGSL(source);
    // Basic validation: must have at least one function
    return parsed.entryPoints.length > 0 || parsed.mainFunction !== null;
  } catch {
    return false;
  }
}

/**
 * Safe mutation - mutate and validate, with anti-convergence health checks
 */
export function safeMutateShader(source: string, intensity: number = 0.5, maxAttempts: number = 3): string {
  // First, check current shader health
  const initialHealth = analyzeShaderHealth(source);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const mutated = mutateShader(source, intensity);

    if (validateShader(mutated)) {
      // Check if mutation caused convergence issues
      const { code: healthyCode, health, wasRepaired } = ensureShaderHealth(mutated, true);

      if (wasRepaired) {
        console.log(`Shader repaired after mutation (health: ${health.overallHealth.toFixed(2)})`);
      }

      // If health degraded significantly, try again
      if (health.overallHealth < initialHealth.overallHealth * 0.5 && attempt < maxAttempts - 1) {
        console.log(`Mutation degraded shader health, retrying... (${health.overallHealth.toFixed(2)} < ${(initialHealth.overallHealth * 0.5).toFixed(2)})`);
        continue;
      }

      // CRITICAL: Validate and fix WGSL type errors before returning
      const { fixedCode, fixes } = validateAndFixShader(healthyCode);
      if (fixes.length > 0) {
        console.log(`[AST Mutator] Applied type fixes:`, fixes);
      }
      return fixedCode;
    }
  }
  // All attempts failed, return original
  console.warn('All mutation attempts failed validation, returning original');
  return source;
}

// ============================================================================
// LEGACY API COMPATIBILITY
// ============================================================================

// Re-export parseWGSL as parseShader for compatibility
export { parseWGSL as parseShader };

// Re-export ParsedShader type from wgslParser
    export type { ParsedShader } from './wgslParser';
