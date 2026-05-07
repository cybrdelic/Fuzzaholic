/**
 * WGSL SYNTAX FIXER - Token-based approach
 *
 * Replaces the regex-based validateAndFixSyntax with a proper token-based
 * approach that understands the structure of WGSL code.
 *
 * Key improvements over regex:
 * - Never corrupts comments (// won't become /)
 * - Never corrupts increment operators (++ stays ++)
 * - Properly handles nested expressions
 * - Context-aware fixes (knows what's inside annotations vs expressions)
 */

import { Token, WGSLLexer } from './wgslParser';

// ============================================================================
// TOKEN STREAM UTILITIES
// ============================================================================

/**
 * A mutable token stream that allows modifications
 */
export class TokenStream {
  private tokens: Token[];
  private modifications: Map<number, string | null>; // index -> new value (null = delete)

  constructor(tokens: Token[]) {
    this.tokens = [...tokens];
    this.modifications = new Map();
  }

  get length(): number {
    return this.tokens.length;
  }

  get(index: number): Token | null {
    return this.tokens[index] || null;
  }

  /**
   * Get token, skipping whitespace and comments
   */
  getNonWS(index: number, direction: 1 | -1 = 1): { token: Token; index: number } | null {
    let i = index + direction;
    while (i >= 0 && i < this.tokens.length) {
      const t = this.tokens[i];
      if (t.type !== 'whitespace' && t.type !== 'comment') {
        return { token: t, index: i };
      }
      i += direction;
    }
    return null;
  }

  /**
   * Get previous non-whitespace token
   */
  prevNonWS(index: number): { token: Token; index: number } | null {
    return this.getNonWS(index, -1);
  }

  /**
   * Get next non-whitespace token
   */
  nextNonWS(index: number): { token: Token; index: number } | null {
    return this.getNonWS(index, 1);
  }

  /**
   * Replace a token's value
   */
  replace(index: number, newValue: string): void {
    this.modifications.set(index, newValue);
  }

  /**
   * Delete a token
   */
  delete(index: number): void {
    this.modifications.set(index, null);
  }

  /**
   * Insert a value before a token (by prepending to the token's value)
   */
  insertBefore(index: number, value: string): void {
    const existing = this.modifications.get(index);
    if (existing === null) return; // Token is deleted
    const current = existing !== undefined ? existing : this.tokens[index].value;
    this.modifications.set(index, value + current);
  }

  /**
   * Insert a value after a token (by appending to the token's value)
   */
  insertAfter(index: number, value: string): void {
    const existing = this.modifications.get(index);
    if (existing === null) return; // Token is deleted
    const current = existing !== undefined ? existing : this.tokens[index].value;
    this.modifications.set(index, current + value);
  }

  /**
   * Check if we're inside an annotation like @binding(...)
   */
  isInsideAnnotation(index: number): boolean {
    let parenDepth = 0;
    for (let i = index - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.type === 'rparen') parenDepth++;
      else if (t.type === 'lparen') {
        parenDepth--;
        if (parenDepth < 0) {
          // Check if preceded by annotation name
          const prev = this.prevNonWS(i);
          if (prev && prev.token.type === 'ident') {
            const name = prev.token.value;
            if (['binding', 'group', 'location', 'workgroup_size', 'vertex', 'fragment', 'compute'].includes(name)) {
              const prevPrev = this.prevNonWS(prev.index);
              if (prevPrev && prevPrev.token.type === 'at') {
                return true;
              }
            }
          }
          return false;
        }
      }
      // Stop at statement boundaries
      if (t.type === 'semicolon' || t.type === 'lbrace' || t.type === 'rbrace') {
        return false;
      }
    }
    return false;
  }

  /**
   * Check if we're inside a type parameter like vec2<f32>
   */
  isInsideTypeParam(index: number): boolean {
    let angleDepth = 0;
    for (let i = index - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.type === 'rangle') angleDepth++;
      else if (t.type === 'langle') {
        angleDepth--;
        if (angleDepth < 0) {
          return true;
        }
      }
      // Stop at statement boundaries
      if (t.type === 'semicolon' || t.type === 'lbrace' || t.type === 'rbrace') {
        return false;
      }
    }
    return false;
  }

  /**
   * Check if we're in a for-loop header
   */
  isInForLoopHeader(index: number): boolean {
    let parenDepth = 0;
    for (let i = index - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.type === 'rparen') parenDepth++;
      else if (t.type === 'lparen') {
        parenDepth--;
        if (parenDepth < 0) {
          // Check if preceded by 'for'
          const prev = this.prevNonWS(i);
          if (prev && prev.token.type === 'ident' && prev.token.value === 'for') {
            return true;
          }
          return false;
        }
      }
      // Stop at braces
      if (t.type === 'lbrace' || t.type === 'rbrace') {
        return false;
      }
    }
    return false;
  }

  /**
   * Reconstruct the source code with all modifications applied
   */
  toString(): string {
    let result = '';
    for (let i = 0; i < this.tokens.length; i++) {
      const mod = this.modifications.get(i);
      if (mod === null) {
        // Deleted
        continue;
      } else if (mod !== undefined) {
        result += mod;
      } else {
        result += this.tokens[i].value;
      }
    }
    return result;
  }
}

// ============================================================================
// SYNTAX FIXES
// ============================================================================

/**
 * Fix operator issues in the token stream
 */
function fixOperatorIssues(stream: TokenStream): void {
  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;

    // Skip non-operators
    if (t.type !== 'operator') continue;

    // Skip if in protected region
    if (stream.isInsideAnnotation(i) || stream.isInsideTypeParam(i)) continue;

    const prev = stream.prevNonWS(i);
    const next = stream.nextNonWS(i);

    // === Fix leading operators after = ===
    // "= *" or "= /" -> "= 1.0 *" or remove the operator
    if (prev && prev.token.type === 'assignment' && prev.token.value === '=') {
      if (t.value === '*' || t.value === '/') {
        // Delete the operator
        stream.delete(i);
        continue;
      } else if (t.value === '+') {
        // Delete unary +
        stream.delete(i);
        continue;
      }
      // Unary - is fine
    }

    // === Fix operator after ( ===
    if (prev && prev.token.type === 'lparen') {
      if (t.value === '*' || t.value === '/') {
        stream.delete(i);
        continue;
      } else if (t.value === '+') {
        stream.delete(i);
        continue;
      }
    }

    // === Fix operator after , ===
    if (prev && prev.token.type === 'comma') {
      if (t.value === '*' || t.value === '/') {
        stream.delete(i);
        continue;
      } else if (t.value === '+') {
        stream.delete(i);
        continue;
      }
    }

    // === Fix operator before ) ===
    if (next && next.token.type === 'rparen') {
      // "* )" -> "1.0)"
      stream.replace(i, '1.0');
      continue;
    }

    // === Fix operator before , ===
    if (next && next.token.type === 'comma') {
      // "* ," -> "1.0,"
      stream.replace(i, '1.0');
      continue;
    }

    // === Fix double operators ===
    if (next && next.token.type === 'operator') {
      const op1 = t.value;
      const op2 = next.token.value;

      // + - -> -
      if (op1 === '+' && op2 === '-') {
        stream.delete(i);
        continue;
      }
      // - + -> -
      if (op1 === '-' && op2 === '+') {
        stream.delete(next.index);
        continue;
      }
      // - - -> + (but be careful of --)
      if (op1 === '-' && op2 === '-') {
        stream.replace(i, '+');
        stream.delete(next.index);
        continue;
      }
      // + + -> +
      if (op1 === '+' && op2 === '+') {
        stream.delete(next.index);
        continue;
      }
      // * * -> *
      if (op1 === '*' && op2 === '*') {
        stream.delete(next.index);
        continue;
      }
      // * / -> *
      if (op1 === '*' && op2 === '/') {
        stream.delete(next.index);
        continue;
      }
      // / * -> /
      if (op1 === '/' && op2 === '*') {
        stream.delete(next.index);
        continue;
      }
      // * - -> * (-1.0) *
      if (op1 === '*' && op2 === '-') {
        stream.replace(i, '* (-1.0) *');
        stream.delete(next.index);
        continue;
      }
      // / - -> / (-1.0) *
      if (op1 === '/' && op2 === '-') {
        stream.replace(i, '/ (-1.0) *');
        stream.delete(next.index);
        continue;
      }
      // * + -> *
      if (op1 === '*' && op2 === '+') {
        stream.delete(next.index);
        continue;
      }
      // / + -> /
      if (op1 === '/' && op2 === '+') {
        stream.delete(next.index);
        continue;
      }
    }
  }
}

/**
 * Fix annotation values (must be integers)
 */
function fixAnnotations(stream: TokenStream): void {
  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;

    if (t.type !== 'at') continue;

    const nameInfo = stream.nextNonWS(i);
    if (!nameInfo || nameInfo.token.type !== 'ident') continue;

    const name = nameInfo.token.value;
    if (!['binding', 'group', 'location'].includes(name)) continue;

    // Find the ( and look for numbers inside
    const lparen = stream.nextNonWS(nameInfo.index);
    if (!lparen || lparen.token.type !== 'lparen') continue;

    // Find numbers and fix them
    let j = lparen.index + 1;
    while (j < stream.length) {
      const tok = stream.get(j)!;
      if (tok.type === 'rparen') break;

      if (tok.type === 'number') {
        // Convert to integer
        const val = parseFloat(tok.value);
        if (!isNaN(val)) {
          let intVal = Math.round(val);
          // Clamp based on annotation type
          if (name === 'binding') intVal = Math.max(0, Math.min(intVal, 31));
          else if (name === 'group') intVal = Math.max(0, Math.min(intVal, 3));
          else if (name === 'location') intVal = Math.max(0, intVal);

          stream.replace(j, intVal.toString());
        }
      }
      j++;
    }
  }
}

/**
 * Fix uniform binding layout to standard values
 */
function fixUniformBindings(stream: TokenStream): void {
  const uniformBindings: Map<string, number> = new Map([
    ['time', 0],
    ['resolution', 1],
    ['mouse', 2],
    ['scroll', 3]
  ]);

  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;

    // Look for var<uniform>
    if (t.type !== 'ident' || t.value !== 'var') continue;

    const angle = stream.nextNonWS(i);
    if (!angle || angle.token.type !== 'langle') continue;

    // Check for 'uniform' inside
    let j = angle.index + 1;
    let isUniform = false;
    while (j < stream.length) {
      const tok = stream.get(j)!;
      if (tok.type === 'rangle') break;
      if (tok.type === 'ident' && tok.value === 'uniform') {
        isUniform = true;
      }
      j++;
    }

    if (!isUniform) continue;

    // Find the variable name
    const rangle = stream.get(j);
    if (!rangle) continue;

    const varName = stream.nextNonWS(j);
    if (!varName || varName.token.type !== 'ident') continue;

    const expectedBinding = uniformBindings.get(varName.token.value);
    if (expectedBinding === undefined) continue;

    // Find the @binding before this var declaration and fix it
    for (let k = i - 1; k >= 0; k--) {
      const tok = stream.get(k)!;
      if (tok.type === 'semicolon' || tok.type === 'rbrace') break;

      if (tok.type === 'ident' && tok.value === 'binding') {
        // Find the number inside
        const lp = stream.nextNonWS(k);
        if (lp && lp.token.type === 'lparen') {
          const num = stream.nextNonWS(lp.index);
          if (num && num.token.type === 'number') {
            stream.replace(num.index, expectedBinding.toString());
          }
        }
      }

      if (tok.type === 'ident' && tok.value === 'group') {
        // Ensure group is 0
        const lp = stream.nextNonWS(k);
        if (lp && lp.token.type === 'lparen') {
          const num = stream.nextNonWS(lp.index);
          if (num && num.token.type === 'number') {
            stream.replace(num.index, '0');
          }
        }
      }
    }
  }
}

/**
 * Fix empty parentheses
 */
function fixEmptyParens(stream: TokenStream): void {
  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;

    if (t.type !== 'lparen') continue;

    const next = stream.nextNonWS(i);
    if (next && next.token.type === 'rparen') {
      // Check if this is a function call that should have no args
      const prev = stream.prevNonWS(i);
      if (prev && prev.token.type === 'ident') {
        // Some functions are fine with no args
        const noArgFuncs = ['discard'];
        if (noArgFuncs.includes(prev.token.value)) continue;
      }

      // Insert 1.0 between empty parens
      stream.insertAfter(i, '1.0');
    }
  }
}

/**
 * Fix double semicolons
 */
function fixDoubleSemicolons(stream: TokenStream): void {
  for (let i = 0; i < stream.length - 1; i++) {
    const t = stream.get(i)!;

    if (t.type !== 'semicolon') continue;

    // Look for next semicolon (allowing whitespace)
    let j = i + 1;
    while (j < stream.length) {
      const tok = stream.get(j)!;
      if (tok.type === 'whitespace') {
        j++;
        continue;
      }
      if (tok.type === 'semicolon') {
        stream.delete(j);
      }
      break;
    }
  }
}

/**
 * Replace undefined uniforms with defaults
 */
function replaceUndefinedUniforms(stream: TokenStream): void {
  const replacements: Map<string, string> = new Map([
    ['u_time', 'time'],
    ['u_mouse', 'vec2<f32>(0.5, 0.5)'],
    ['u_scroll', 'vec2<f32>(time * 50.0, time * 100.0)']
  ]);

  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;

    if (t.type !== 'ident') continue;

    // Check for u_mouse.x, u_mouse.y, etc.
    if (t.value === 'u_mouse') {
      const dot = stream.nextNonWS(i);
      if (dot && dot.token.type === 'dot') {
        const prop = stream.nextNonWS(dot.index);
        if (prop && prop.token.type === 'ident') {
          if (prop.token.value === 'x') {
            stream.replace(i, '0.5');
            stream.delete(dot.index);
            stream.delete(prop.index);
            continue;
          } else if (prop.token.value === 'y') {
            stream.replace(i, '0.5');
            stream.delete(dot.index);
            stream.delete(prop.index);
            continue;
          } else if (prop.token.value === 'xy') {
            stream.replace(i, 'vec2<f32>(0.5, 0.5)');
            stream.delete(dot.index);
            stream.delete(prop.index);
            continue;
          }
        }
      }
      stream.replace(i, 'vec2<f32>(0.5, 0.5)');
      continue;
    }

    if (t.value === 'u_scroll') {
      const dot = stream.nextNonWS(i);
      if (dot && dot.token.type === 'dot') {
        const prop = stream.nextNonWS(dot.index);
        if (prop && prop.token.type === 'ident') {
          if (prop.token.value === 'x') {
            stream.replace(i, '(time * 50.0)');
            stream.delete(dot.index);
            stream.delete(prop.index);
            continue;
          } else if (prop.token.value === 'y') {
            stream.replace(i, '(time * 100.0)');
            stream.delete(dot.index);
            stream.delete(prop.index);
            continue;
          }
        }
      }
      stream.replace(i, 'vec2<f32>(time * 50.0, time * 100.0)');
      continue;
    }

    if (t.value === 'u_time') {
      stream.replace(i, 'time');
    }
  }
}

/**
 * Fix mod() function calls - WGSL doesn't have mod(), use fract(a/b)*b or %
 */
function fixModFunction(stream: TokenStream): void {
  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;
    if (t.type !== 'ident' || t.value !== 'mod') continue;

    const lparen = stream.nextNonWS(i);
    if (!lparen || lparen.token.type !== 'lparen') continue;

    // Skip if it's a function definition
    const prev = stream.prevNonWS(i);
    if (prev && prev.token.type === 'ident' && prev.token.value === 'fn') continue;

    const args = collectFunctionArgs(stream, lparen.index);
    if (!args || args.argStrings.length !== 2) continue;

    // Replace mod(a, b) with ((a) - (b) * floor((a) / (b)))
    // This is the correct WGSL equivalent of GLSL mod
    const a = args.argStrings[0];
    const b = args.argStrings[1];
    const replacement = `((${a}) - (${b}) * floor((${a}) / (${b})))`;
    replaceTokenRange(stream, i, args.endIndex, replacement);
  }
}

/**
 * Fix type-mismatched function calls (pow, mix, clamp, atan2, smoothstep)
 * These WGSL functions require all arguments to have matching types
 */
function fixTypeMismatchedFunctions(stream: TokenStream): void {
  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;
    if (t.type !== 'ident') continue;

    // Skip if it's a function definition
    const prev = stream.prevNonWS(i);
    if (prev && prev.token.type === 'ident' && prev.token.value === 'fn') continue;

    const lparen = stream.nextNonWS(i);
    if (!lparen || lparen.token.type !== 'lparen') continue;

    const args = collectFunctionArgs(stream, lparen.index);
    if (!args) continue;

    const funcName = t.value;

    // Helper to detect if an expression is scalar or vector
    const isVector = (expr: string): boolean => {
      return expr.includes('vec2') || expr.includes('vec3') || expr.includes('vec4') ||
             expr.includes('.xy') || expr.includes('.xyz') || expr.includes('.xyzw') ||
             expr.includes('.yx') || expr.includes('.zyx') ||
             /\.\s*[xyzwrgba]{2,}/.test(expr);
    };

    const isScalar = (expr: string): boolean => {
      // Ends with .x, .y, .z, .w, .r, .g, .b, .a (single component)
      if (/\.[xyzwrgba]\s*$/.test(expr)) return true;
      // Simple number
      if (/^-?\d+\.?\d*f?$/.test(expr.trim())) return true;
      // length(), dot(), distance() always return scalar
      if (expr.includes('length(') || expr.includes('dot(') || expr.includes('distance(')) return true;
      // No vector indicators
      return !isVector(expr);
    };

    // Fix pow(vec, scalar) -> pow(vec, vec2/vec3<f32>(scalar))
    if (funcName === 'pow' && args.argStrings.length === 2) {
      const arg0Vec = isVector(args.argStrings[0]);
      const arg1Vec = isVector(args.argStrings[1]);

      if (arg0Vec && !arg1Vec) {
        // First arg is vec, second is scalar - wrap second in matching vec
        const vecType = args.argStrings[0].includes('vec3') ? 'vec3<f32>' : 'vec2<f32>';
        const scalar = args.argStrings[1];
        const replacement = `pow(${args.argStrings[0]}, ${vecType}(${scalar}))`;
        replaceTokenRange(stream, i, args.endIndex, replacement);
        continue;
      }
      if (!arg0Vec && arg1Vec) {
        // First arg is scalar, second is vec - wrap first in matching vec
        const vecType = args.argStrings[1].includes('vec3') ? 'vec3<f32>' : 'vec2<f32>';
        const scalar = args.argStrings[0];
        const replacement = `pow(${vecType}(${scalar}), ${args.argStrings[1]})`;
        replaceTokenRange(stream, i, args.endIndex, replacement);
        continue;
      }
    }

    // Fix atan2(vec, scalar) or atan2(scalar, vec)
    if (funcName === 'atan2' && args.argStrings.length === 2) {
      const arg0Vec = isVector(args.argStrings[0]);
      const arg1Vec = isVector(args.argStrings[1]);

      if (arg0Vec && !arg1Vec) {
        const vecType = args.argStrings[0].includes('vec3') ? 'vec3<f32>' : 'vec2<f32>';
        const scalar = args.argStrings[1];
        const replacement = `atan2(${args.argStrings[0]}, ${vecType}(${scalar}))`;
        replaceTokenRange(stream, i, args.endIndex, replacement);
        continue;
      }
      if (!arg0Vec && arg1Vec) {
        const vecType = args.argStrings[1].includes('vec3') ? 'vec3<f32>' : 'vec2<f32>';
        const scalar = args.argStrings[0];
        const replacement = `atan2(${vecType}(${scalar}), ${args.argStrings[1]})`;
        replaceTokenRange(stream, i, args.endIndex, replacement);
        continue;
      }
    }

    // Fix mix(scalar, vec, t) or mix(vec, scalar, t)
    if (funcName === 'mix' && args.argStrings.length === 3) {
      const arg0Vec = isVector(args.argStrings[0]);
      const arg1Vec = isVector(args.argStrings[1]);

      if (arg0Vec !== arg1Vec) {
        // Mismatched types - use the vector type to broadcast scalar
        const vecType = arg0Vec ?
          (args.argStrings[0].includes('vec3') ? 'vec3<f32>' : 'vec2<f32>') :
          (args.argStrings[1].includes('vec3') ? 'vec3<f32>' : 'vec2<f32>');

        const a = arg0Vec ? args.argStrings[0] : `${vecType}(${args.argStrings[0]})`;
        const b = arg1Vec ? args.argStrings[1] : `${vecType}(${args.argStrings[1]})`;
        const replacement = `mix(${a}, ${b}, ${args.argStrings[2]})`;
        replaceTokenRange(stream, i, args.endIndex, replacement);
        continue;
      }
    }

    // Fix clamp(vec, scalar, scalar)
    if (funcName === 'clamp' && args.argStrings.length === 3) {
      const arg0Vec = isVector(args.argStrings[0]);
      const arg1Scalar = isScalar(args.argStrings[1]);
      const arg2Scalar = isScalar(args.argStrings[2]);

      if (arg0Vec && arg1Scalar && arg2Scalar) {
        const vecType = args.argStrings[0].includes('vec3') ? 'vec3<f32>' : 'vec2<f32>';
        const replacement = `clamp(${args.argStrings[0]}, ${vecType}(${args.argStrings[1]}), ${vecType}(${args.argStrings[2]}))`;
        replaceTokenRange(stream, i, args.endIndex, replacement);
        continue;
      }
    }

    // Fix smoothstep(scalar, scalar, vec)
    if (funcName === 'smoothstep' && args.argStrings.length === 3) {
      const arg0Scalar = isScalar(args.argStrings[0]);
      const arg1Scalar = isScalar(args.argStrings[1]);
      const arg2Vec = isVector(args.argStrings[2]);

      if (arg0Scalar && arg1Scalar && arg2Vec) {
        const vecType = args.argStrings[2].includes('vec3') ? 'vec3<f32>' : 'vec2<f32>';
        const replacement = `smoothstep(${vecType}(${args.argStrings[0]}), ${vecType}(${args.argStrings[1]}), ${args.argStrings[2]})`;
        replaceTokenRange(stream, i, args.endIndex, replacement);
        continue;
      }
    }
  }
}

/**
 * Replace undefined function calls with valid alternatives
 * Handles: noise(), fbm(), and other common shader functions
 */
function replaceUndefinedFunctions(stream: TokenStream): void {
  // Track which functions are defined in the shader
  const definedFunctions = new Set<string>();

  // First pass: find all function definitions
  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;
    if (t.type === 'ident' && t.value === 'fn') {
      const name = stream.nextNonWS(i);
      if (name && name.token.type === 'ident') {
        definedFunctions.add(name.token.value);
      }
    }
  }

  // Second pass: replace undefined function calls
  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;
    if (t.type !== 'ident') continue;

    // Check if this is a function call
    const lparen = stream.nextNonWS(i);
    if (!lparen || lparen.token.type !== 'lparen') continue;

    // Skip if it's a function definition (preceded by 'fn')
    const prev = stream.prevNonWS(i);
    if (prev && prev.token.type === 'ident' && prev.token.value === 'fn') continue;

    // Skip if the function is defined
    if (definedFunctions.has(t.value)) continue;

    const funcName = t.value;

    // Collect the argument(s)
    const args = collectFunctionArgs(stream, lparen.index);
    if (!args) continue;

    // Replace noise() with hash-based alternative
    if (funcName === 'noise' && args.argStrings.length === 1) {
      const arg = args.argStrings[0];
      // Don't replace if it looks like a function parameter definition
      if (arg.includes(':')) continue;

      const replacement = `fract(sin(dot(${arg}, vec2<f32>(12.9898, 78.233))) * 43758.5453)`;
      replaceTokenRange(stream, i, args.endIndex, replacement);
      continue;
    }

    // Replace fbm() with multi-octave approximation
    if (funcName === 'fbm' && args.argStrings.length === 1) {
      const arg = args.argStrings[0];
      if (arg.includes(':')) continue;

      const replacement = `(fract(sin(dot(${arg}, vec2<f32>(12.9898, 78.233))) * 43758.5453) * 0.5 + fract(sin(dot(${arg} * 2.0, vec2<f32>(12.9898, 78.233))) * 43758.5453) * 0.25)`;
      replaceTokenRange(stream, i, args.endIndex, replacement);
      continue;
    }
  }
}

/**
 * Collect function arguments from token stream
 */
function collectFunctionArgs(stream: TokenStream, lparenIndex: number): { argStrings: string[]; endIndex: number } | null {
  const args: string[] = [];
  let currentArg = '';
  let depth = 1;
  let i = lparenIndex + 1;

  while (i < stream.length && depth > 0) {
    const t = stream.get(i)!;

    if (t.type === 'lparen') {
      depth++;
      currentArg += t.value;
    } else if (t.type === 'rparen') {
      depth--;
      if (depth === 0) {
        if (currentArg.trim()) args.push(currentArg.trim());
        return { argStrings: args, endIndex: i };
      }
      currentArg += t.value;
    } else if (t.type === 'comma' && depth === 1) {
      if (currentArg.trim()) args.push(currentArg.trim());
      currentArg = '';
    } else {
      currentArg += t.value;
    }
    i++;
  }

  return null;
}

/**
 * Replace a range of tokens with a single string value
 */
function replaceTokenRange(stream: TokenStream, startIndex: number, endIndex: number, replacement: string): void {
  // Replace first token with the replacement
  stream.replace(startIndex, replacement);
  // Delete all other tokens in range
  for (let i = startIndex + 1; i <= endIndex; i++) {
    stream.delete(i);
  }
}

/**
 * Fix smoothstep calls that only have 2 arguments
 */
function fixSmoothstep(stream: TokenStream): void {
  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;
    if (t.type !== 'ident' || t.value !== 'smoothstep') continue;

    const lparen = stream.nextNonWS(i);
    if (!lparen || lparen.token.type !== 'lparen') continue;

    const args = collectFunctionArgs(stream, lparen.index);
    if (!args || args.argStrings.length !== 2) continue;

    // smoothstep needs 3 args: edge0, edge1, x
    // If only 2, assume they meant: smoothstep(0.0, arg1, arg2)
    const replacement = `smoothstep(0.0, ${args.argStrings[0]}, ${args.argStrings[1]})`;
    replaceTokenRange(stream, i, args.endIndex, replacement);
  }
}

/**
 * Fix clamp arguments order (min should be <= max)
 */
function fixClampOrder(stream: TokenStream): void {
  for (let i = 0; i < stream.length; i++) {
    const t = stream.get(i)!;
    if (t.type !== 'ident' || t.value !== 'clamp') continue;

    const lparen = stream.nextNonWS(i);
    if (!lparen || lparen.token.type !== 'lparen') continue;

    const args = collectFunctionArgs(stream, lparen.index);
    if (!args || args.argStrings.length !== 3) continue;

    // Try to parse min and max as numbers
    const minVal = parseFloat(args.argStrings[1]);
    const maxVal = parseFloat(args.argStrings[2]);

    if (!isNaN(minVal) && !isNaN(maxVal) && minVal > maxVal) {
      // Swap min and max
      const replacement = `clamp(${args.argStrings[0]}, ${args.argStrings[2]}, ${args.argStrings[1]})`;
      replaceTokenRange(stream, i, args.endIndex, replacement);
    }
  }
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Fix WGSL syntax issues using token-based approach
 */
export function fixWGSLSyntax(source: string): string {
  // Tokenize
  const lexer = new WGSLLexer(source);
  const tokens = lexer.tokenize();
  const stream = new TokenStream(tokens);

  // Apply fixes in order (order matters!)
  fixUniformBindings(stream);
  fixAnnotations(stream);
  fixModFunction(stream);           // Fix mod() before other function fixes
  fixTypeMismatchedFunctions(stream); // Fix pow, mix, clamp, atan2, smoothstep type mismatches
  replaceUndefinedFunctions(stream);
  fixSmoothstep(stream);
  fixClampOrder(stream);
  fixOperatorIssues(stream);
  fixEmptyParens(stream);
  fixDoubleSemicolons(stream);
  replaceUndefinedUniforms(stream);

  // Reconstruct
  let result = stream.toString();

  // Run a second pass for any issues created by first pass
  const lexer2 = new WGSLLexer(result);
  const tokens2 = lexer2.tokenize();
  const stream2 = new TokenStream(tokens2);

  fixOperatorIssues(stream2);

  return stream2.toString();
}

/**
 * Validate and fix syntax - main entry point
 * This can be used as a drop-in replacement for the regex-based version
 */
export function validateAndFixSyntax(code: string): string {
  return fixWGSLSyntax(code);
}
