/**
 * WGSL Shader Validator & Sanitizer
 *
 * Ensures mutated shaders are ALWAYS valid WGSL.
 * A true fuzzer should NEVER produce compilation errors.
 *
 * This module catches and fixes:
 * - Type mismatches (f_n(vec2) -> f_n(length(vec2)))
 * - Invalid function calls (wrong arg count)
 * - Operator type errors (mat2x2 + vec2)
 * - Invalid clamp/smoothstep arguments
 * - Division by zero risks
 */

// ============================================================================
// FUNCTION SIGNATURES - What functions expect
// ============================================================================

interface FunctionSignature {
  name: string;
  argTypes: ('f32' | 'vec2' | 'vec3' | 'vec4' | 'any')[];
  returnType: 'f32' | 'vec2' | 'vec3' | 'vec4';
}

const FUNCTION_SIGNATURES: Record<string, FunctionSignature> = {
  // Preamble functions (from constants.ts)
  'f_n': { name: 'f_n', argTypes: ['f32'], returnType: 'f32' },
  'f_sin': { name: 'f_sin', argTypes: ['f32'], returnType: 'f32' },
  'f_cos': { name: 'f_cos', argTypes: ['f32'], returnType: 'f32' },
  'f_hash': { name: 'f_hash', argTypes: ['f32'], returnType: 'f32' },
  'f_pal': { name: 'f_pal', argTypes: ['f32', 'vec3', 'vec3', 'vec3', 'vec3'], returnType: 'vec3' },
  'f_rot': { name: 'f_rot', argTypes: ['f32'], returnType: 'vec2' }, // returns mat2x2 actually
  'f_smin': { name: 'f_smin', argTypes: ['f32', 'f32', 'f32'], returnType: 'f32' },

  // WGSL builtins that take f32
  'sin': { name: 'sin', argTypes: ['f32'], returnType: 'f32' },
  'cos': { name: 'cos', argTypes: ['f32'], returnType: 'f32' },
  'tan': { name: 'tan', argTypes: ['f32'], returnType: 'f32' },
  'asin': { name: 'asin', argTypes: ['f32'], returnType: 'f32' },
  'acos': { name: 'acos', argTypes: ['f32'], returnType: 'f32' },
  'atan': { name: 'atan', argTypes: ['f32'], returnType: 'f32' },
  'exp': { name: 'exp', argTypes: ['f32'], returnType: 'f32' },
  'log': { name: 'log', argTypes: ['f32'], returnType: 'f32' },
  'sqrt': { name: 'sqrt', argTypes: ['f32'], returnType: 'f32' },
  'abs': { name: 'abs', argTypes: ['any'], returnType: 'f32' },
  'floor': { name: 'floor', argTypes: ['any'], returnType: 'f32' },
  'ceil': { name: 'ceil', argTypes: ['any'], returnType: 'f32' },
  'fract': { name: 'fract', argTypes: ['any'], returnType: 'f32' },
  'sign': { name: 'sign', argTypes: ['any'], returnType: 'f32' },

  // Functions that need vec2
  'length': { name: 'length', argTypes: ['any'], returnType: 'f32' },
  'normalize': { name: 'normalize', argTypes: ['any'], returnType: 'vec2' },
  'dot': { name: 'dot', argTypes: ['any', 'any'], returnType: 'f32' },
  'distance': { name: 'distance', argTypes: ['any', 'any'], returnType: 'f32' },
  'atan2': { name: 'atan2', argTypes: ['f32', 'f32'], returnType: 'f32' },

  // Shader-defined functions
  'noise': { name: 'noise', argTypes: ['vec2'], returnType: 'f32' },
  'fbm': { name: 'fbm', argTypes: ['vec2'], returnType: 'f32' },
  'voronoi': { name: 'voronoi', argTypes: ['vec2'], returnType: 'f32' },
  'hash': { name: 'hash', argTypes: ['vec2'], returnType: 'f32' },
  'hash2': { name: 'hash2', argTypes: ['vec2'], returnType: 'vec2' },
  'rot2d': { name: 'rot2d', argTypes: ['f32'], returnType: 'vec2' }, // actually mat2x2
};

// ============================================================================
// TYPE INFERENCE HELPERS
// ============================================================================

/**
 * Infer the type of a simple expression
 */
function inferType(expr: string): 'f32' | 'vec2' | 'vec3' | 'vec4' | 'mat2x2' | 'unknown' {
  const trimmed = expr.trim();

  // Vector constructors
  if (trimmed.startsWith('vec4')) return 'vec4';
  if (trimmed.startsWith('vec3')) return 'vec3';
  if (trimmed.startsWith('vec2')) return 'vec2';
  if (trimmed.startsWith('mat2x2')) return 'mat2x2';

  // Known vec2 variables
  if (/^(uv|p|mouse|scroll|resolution|fragCoord\.xy)$/.test(trimmed)) return 'vec2';

  // Swizzles
  if (/\.(xy|yx|xx|yy)$/.test(trimmed)) return 'vec2';
  if (/\.(xyz|xzy|yxz|yzx|zxy|zyx|rgb|rbg|grb|gbr|brg|bgr)$/.test(trimmed)) return 'vec3';
  if (/\.(xyzw|rgba)$/.test(trimmed)) return 'vec4';
  if (/\.(x|y|z|w|r|g|b|a)$/.test(trimmed)) return 'f32';

  // Function calls that return specific types
  if (/^(length|distance|dot|f_n|f_sin|f_cos|f_hash|sin|cos|tan|exp|log|sqrt|abs|fract|noise|fbm|voronoi|hash|atan2)\s*\(/.test(trimmed)) {
    return 'f32';
  }
  if (/^(f_pal|mix)\s*\(/.test(trimmed) && trimmed.includes('vec3')) {
    return 'vec3';
  }
  if (/^(normalize|hash2)\s*\(/.test(trimmed)) {
    return 'vec2';
  }
  if (/^rot2d\s*\(/.test(trimmed) || /^f_rot\s*\(/.test(trimmed)) {
    return 'mat2x2';
  }

  // Numeric literals
  if (/^-?\d+\.?\d*(f|u|i)?$/.test(trimmed)) return 'f32';

  // Time is f32
  if (trimmed === 'time') return 'f32';

  return 'unknown';
}

/**
 * Check if expression looks like a vec2
 */
function looksLikeVec2(expr: string): boolean {
  const type = inferType(expr);
  return type === 'vec2' || type === 'unknown';
}

/**
 * Check if expression looks like f32
 */
function looksLikeF32(expr: string): boolean {
  const type = inferType(expr);
  return type === 'f32' || type === 'unknown';
}

// ============================================================================
// FIX FUNCTIONS
// ============================================================================

/**
 * Fix f_n calls - f_n expects f32, not vec2
 * f_n(uv * 8.0) -> f_n(length(uv * 8.0)) or noise(uv * 8.0)
 */
function fixF_nCalls(code: string): string {
  // Match f_n( followed by something that looks like vec2
  return code.replace(/\bf_n\s*\(\s*([^)]+)\s*\)/g, (match, arg) => {
    const argType = inferType(arg.trim());
    if (argType === 'vec2' || (argType === 'unknown' && (arg.includes('uv') || arg.includes(' * ') && arg.includes('vec2')))) {
      // Convert vec2 arg to f32 using length, or use noise instead
      if (Math.random() < 0.5) {
        return `noise(${arg})`; // Use noise for vec2 input
      } else {
        return `f_n(length(${arg}))`; // Convert to f32
      }
    }
    return match;
  });
}

/**
 * Fix f_pal calls - f_pal needs 5 arguments
 * f_pal(t) -> f_pal(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67))
 */
function fixF_palCalls(code: string): string {
  // Match f_pal with only 1 argument
  return code.replace(/\bf_pal\s*\(\s*([^,)]+)\s*\)/g, (match, arg) => {
    // Check if it's actually just one argument (no commas before closing paren)
    if (!match.includes(',')) {
      return `f_pal(${arg}, vec3<f32>(0.5, 0.5, 0.5), vec3<f32>(0.5, 0.5, 0.5), vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(0.0, 0.33, 0.67))`;
    }
    return match;
  });
}

/**
 * Fix mat2x2 + vec2 errors
 * rot2d(x) + p -> rot2d(x) * p
 * rot2d(x) - p -> rot2d(x) * p (can't subtract mat from vec)
 */
function fixMatrixVectorOps(code: string): string {
  // rot2d(...) + variable or rot2d(...) - variable
  return code.replace(/\b(rot2d|f_rot)\s*\([^)]+\)\s*([+-])\s*(\w+)/g, (match, fn, op, varName) => {
    // Replace + or - with * for matrix-vector operations
    return match.replace(` ${op} `, ' * ');
  });
}

/**
 * Fix clamp with low > high
 * clamp(x, 1.7, 1.0) -> clamp(x, 0.0, 1.0)
 */
function fixClampArgs(code: string): string {
  return code.replace(/\bclamp\s*\(\s*([^,]+)\s*,\s*vec3<f32>\s*\(\s*([^)]+)\s*\)\s*,\s*vec3<f32>\s*\(\s*([^)]+)\s*\)\s*\)/g,
    (match, value, lowArgs, highArgs) => {
      // Parse the low and high values
      const lowVals = lowArgs.split(',').map((s: string) => parseFloat(s.trim()));
      const highVals = highArgs.split(',').map((s: string) => parseFloat(s.trim()));

      // Fix any low > high cases
      let needsFix = false;
      for (let i = 0; i < Math.min(lowVals.length, highVals.length); i++) {
        if (!isNaN(lowVals[i]) && !isNaN(highVals[i]) && lowVals[i] > highVals[i]) {
          needsFix = true;
          break;
        }
      }

      if (needsFix) {
        return `clamp(${value}, vec3<f32>(0.0), vec3<f32>(1.0))`;
      }
      return match;
    });
}

/**
 * Fix scalar clamp with low > high
 */
function fixScalarClampArgs(code: string): string {
  return code.replace(/\bclamp\s*\(\s*([^,]+)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/g,
    (match, value, low, high) => {
      const lowVal = parseFloat(low);
      const highVal = parseFloat(high);

      if (!isNaN(lowVal) && !isNaN(highVal) && lowVal > highVal) {
        // Swap them or use safe defaults
        return `clamp(${value}, ${Math.min(lowVal, highVal).toFixed(3)}, ${Math.max(lowVal, highVal).toFixed(3)})`;
      }
      return match;
    });
}

/**
 * Fix smoothstep with low == high or low > high
 * smoothstep(0.0, 0.0, x) -> smoothstep(0.0, 1.0, x)
 * smoothstep(0.0, fract(1.0), x) -> smoothstep(0.0, 1.0, x) because fract(1.0) = 0.0
 */
function fixSmoothstepArgs(code: string): string {
  return code.replace(/\bsmoothstep\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
    (match, low, high, value) => {
      const lowTrimmed = low.trim();
      const highTrimmed = high.trim();

      // Check for fract(1.0) which equals 0
      if (highTrimmed.match(/fract\s*\(\s*1\.0+\s*\)/)) {
        return `smoothstep(${lowTrimmed}, 1.0, ${value})`;
      }

      // Check for literal equality
      const lowVal = parseFloat(lowTrimmed);
      const highVal = parseFloat(highTrimmed);

      if (!isNaN(lowVal) && !isNaN(highVal)) {
        if (lowVal === highVal) {
          return `smoothstep(${lowVal.toFixed(3)}, ${(lowVal + 1.0).toFixed(3)}, ${value})`;
        }
        if (lowVal > highVal) {
          return `smoothstep(${highVal.toFixed(3)}, ${lowVal.toFixed(3)}, ${value})`;
        }
      }

      return match;
    });
}

/**
 * Fix type mismatches in arithmetic with mouse/vec2
 * mouse + 3.0 -> mouse + vec2<f32>(3.0) or (mouse.x + 3.0) depending on context
 */
function fixVec2ScalarOps(code: string): string {
  // mouse + scalar or mouse - scalar (outside of vec2 constructor)
  // This is actually valid in WGSL, so we might not need this
  return code;
}

/**
 * Ensure division doesn't produce NaN/Inf
 * Replace division by values that could be 0
 */
function fixDivisionByZero(code: string): string {
  // / 0.0 -> / 0.001
  return code.replace(/\/\s*0\.0+([^0-9]|$)/g, '/ 0.001$1');
}

// ============================================================================
// MAIN VALIDATION & SANITIZATION
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  fixedCode: string;
  issues: string[];
  fixes: string[];
}

/**
 * Validate and fix a mutated shader
 * Returns fixed code that should always compile
 */
export function validateAndFixShader(code: string): ValidationResult {
  const issues: string[] = [];
  const fixes: string[] = [];
  let fixedCode = code;

  // Fix f_n type mismatches
  const beforeF_n = fixedCode;
  fixedCode = fixF_nCalls(fixedCode);
  if (fixedCode !== beforeF_n) {
    fixes.push('Fixed f_n() vec2->f32 type mismatch');
  }

  // Fix f_pal argument count
  const beforeF_pal = fixedCode;
  fixedCode = fixF_palCalls(fixedCode);
  if (fixedCode !== beforeF_pal) {
    fixes.push('Fixed f_pal() argument count');
  }

  // Fix matrix-vector operations
  const beforeMatVec = fixedCode;
  fixedCode = fixMatrixVectorOps(fixedCode);
  if (fixedCode !== beforeMatVec) {
    fixes.push('Fixed mat2x2 +/- vec2 -> mat2x2 * vec2');
  }

  // Fix clamp arguments
  const beforeClamp = fixedCode;
  fixedCode = fixClampArgs(fixedCode);
  fixedCode = fixScalarClampArgs(fixedCode);
  if (fixedCode !== beforeClamp) {
    fixes.push('Fixed clamp() low > high');
  }

  // Fix smoothstep arguments
  const beforeSmoothstep = fixedCode;
  fixedCode = fixSmoothstepArgs(fixedCode);
  if (fixedCode !== beforeSmoothstep) {
    fixes.push('Fixed smoothstep() low == high');
  }

  // Fix division by zero
  const beforeDiv = fixedCode;
  fixedCode = fixDivisionByZero(fixedCode);
  if (fixedCode !== beforeDiv) {
    fixes.push('Fixed division by zero');
  }

  // Final check - look for remaining issues
  if (fixedCode.match(/\bf_n\s*\([^)]*uv[^)]*\)/)) {
    issues.push('Possible remaining f_n(vec2) issue');
  }
  if (fixedCode.match(/\bf_pal\s*\([^,)]+\)/)) {
    issues.push('Possible remaining f_pal(1 arg) issue');
  }

  return {
    isValid: issues.length === 0,
    fixedCode,
    issues,
    fixes,
  };
}

/**
 * Quick check if shader has obvious type errors
 */
export function hasObviousTypeErrors(code: string): boolean {
  // f_n with vec2 argument
  if (code.match(/\bf_n\s*\(\s*(uv|p|mouse|vec2)/)) return true;

  // f_pal with single argument
  if (code.match(/\bf_pal\s*\([^,)]+\)/)) return true;

  // rot2d + or - (not *)
  if (code.match(/rot2d\s*\([^)]+\)\s*[+-]\s*\w/)) return true;

  return false;
}

/**
 * Pre-mutation check - identify patterns that shouldn't be mutated
 */
export function getProtectedPatterns(): RegExp[] {
  return [
    // Don't change rot2d multiplication to addition
    /rot2d\s*\([^)]+\)\s*\*/,
    // Don't change clamp's 0.0/1.0 bounds
    /clamp\s*\([^,]+,\s*vec3<f32>\s*\(\s*0\.0/,
    /clamp\s*\([^,]+,\s*0\.0\s*,\s*1\.0\s*\)/,
    // Don't change smoothstep bounds
    /smoothstep\s*\(\s*0\.0\s*,\s*1\.0/,
  ];
}
