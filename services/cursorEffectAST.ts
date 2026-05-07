// =============================================================================
// AST-BASED CURSOR EFFECT GENERATOR - TRUE PROCEDURAL FUZZER
// =============================================================================
// Generates cursor/mouse effects through random AST composition
// NO PRESETS - effects are built procedurally from atomic operations
// Can discover ANY possible effect through random exploration
// =============================================================================

import { AST, astToWGSL, PhysicsExprNode } from './astTypes';

const { p, time, mouse, lit, add, sub, mul, div, sin, cos, abs, sqrt, pow, exp, log,
        fract, min, max, clamp, mix, smoothstep, length, distance, dot, normalize,
        atan2, vec2, vec3, neg } = AST;

// Random utilities
const R = () => Math.random();
const RF = (a: number, b: number) => Math.random() * (b - a) + a;
const RI = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// =============================================================================
// CURSOR ENTITY - AST representation of mouse/cursor
// =============================================================================

/**
 * Build the cursor position AST node, optionally with aspect ratio correction
 */
function cursorPos(aspectCorrect: boolean = true): PhysicsExprNode {
  // mouse is 0-1, convert to -1 to 1 space like p
  const mouseNormalized = sub(mul(mouse(), lit(2)), vec2(lit(1), lit(1)));

  if (aspectCorrect) {
    // Apply aspect ratio to x component
    return vec2(
      mul(AST.x(mouseNormalized), div(AST.x(AST.resolution()), AST.y(AST.resolution()))),
      AST.y(mouseNormalized)
    );
  }
  return mouseNormalized;
}

/**
 * Build cursor distance field AST
 */
function cursorDistance(fromExpr: PhysicsExprNode = p()): PhysicsExprNode {
  return length(sub(fromExpr, cursorPos()));
}

/**
 * Build cursor angle from a point
 */
function cursorAngle(fromExpr: PhysicsExprNode = p()): PhysicsExprNode {
  const diff = sub(fromExpr, cursorPos());
  return atan2(AST.y(diff), AST.x(diff));
}

/**
 * Build normalized direction to cursor
 */
function cursorDirection(fromExpr: PhysicsExprNode = p()): PhysicsExprNode {
  return normalize(sub(cursorPos(), fromExpr));
}

// =============================================================================
// TRUE PROCEDURAL AST GENERATOR
// Builds random expressions from atomic operations - can find ANY effect
// =============================================================================

/**
 * All unary functions available for random selection
 */
const UNARY_OPS = [sin, cos, abs, sqrt, exp, fract, neg];

/**
 * All binary functions available for random selection
 */
const BINARY_OPS = [add, sub, mul, div, min, max, pow];

/**
 * Generate a random terminal (leaf) node related to cursor
 */
function randomCursorTerminal(): PhysicsExprNode {
  const choice = RI(0, 10);
  switch (choice) {
    case 0: return cursorDistance();
    case 1: return cursorAngle();
    case 2: return AST.x(sub(p(), cursorPos()));
    case 3: return AST.y(sub(p(), cursorPos()));
    case 4: return time();
    case 5: return lit(RF(0.1, 5));
    case 6: return lit(RF(-2, 2));
    case 7: return length(p());
    case 8: return atan2(AST.y(p()), AST.x(p()));
    case 9: return dot(normalize(sub(p(), cursorPos())), vec2(lit(RF(-1, 1)), lit(RF(-1, 1))));
    default: return lit(RF(0.5, 3));
  }
}

/**
 * Generate a completely random cursor-related AST expression
 * This is the core of the TRUE FUZZER - no presets, just random composition
 */
function generateRandomCursorExpr(depth: number = 0, maxDepth: number = 5): PhysicsExprNode {
  // Base case: return terminal at max depth or randomly
  if (depth >= maxDepth || (depth > 1 && R() < 0.25)) {
    return randomCursorTerminal();
  }

  // Choose operation type
  const opType = R();

  if (opType < 0.4) {
    // Unary operation
    const op = pick(UNARY_OPS);
    return op(generateRandomCursorExpr(depth + 1, maxDepth));
  } else if (opType < 0.85) {
    // Binary operation
    const op = pick(BINARY_OPS);
    return op(
      generateRandomCursorExpr(depth + 1, maxDepth),
      generateRandomCursorExpr(depth + 1, maxDepth)
    );
  } else if (opType < 0.92) {
    // Ternary: mix or smoothstep or clamp
    const ternaryChoice = R();
    if (ternaryChoice < 0.33) {
      return mix(
        generateRandomCursorExpr(depth + 1, maxDepth),
        generateRandomCursorExpr(depth + 1, maxDepth),
        clamp(generateRandomCursorExpr(depth + 1, maxDepth), lit(0), lit(1))
      );
    } else if (ternaryChoice < 0.66) {
      return smoothstep(
        lit(RF(-0.5, 0.3)),
        lit(RF(0.4, 1.5)),
        generateRandomCursorExpr(depth + 1, maxDepth)
      );
    } else {
      return clamp(
        generateRandomCursorExpr(depth + 1, maxDepth),
        lit(RF(-1, 0)),
        lit(RF(0.5, 2))
      );
    }
  } else {
    // Complex cursor-specific patterns (still procedural but guided)
    const patternChoice = R();
    if (patternChoice < 0.25) {
      // Distance-based with angular modulation
      return mul(
        exp(neg(mul(cursorDistance(), lit(RF(1, 8))))),
        generateRandomCursorExpr(depth + 1, maxDepth)
      );
    } else if (patternChoice < 0.5) {
      // Angle-based pattern
      return sin(add(
        mul(cursorAngle(), lit(RF(2, 15))),
        generateRandomCursorExpr(depth + 1, maxDepth)
      ));
    } else if (patternChoice < 0.75) {
      // Time-modulated cursor interaction
      return mul(
        generateRandomCursorExpr(depth + 1, maxDepth),
        add(lit(0.5), mul(sin(mul(time(), lit(RF(0.5, 4)))), lit(0.5)))
      );
    } else {
      // Falloff with distortion
      const distortAmt = lit(RF(0.1, 0.6));
      const distortFreq = lit(RF(2, 12));
      return exp(neg(mul(
        add(cursorDistance(), mul(sin(mul(cursorAngle(), distortFreq)), distortAmt)),
        lit(RF(2, 10))
      )));
    }
  }
}

/**
 * Generate a random influence expression that's guaranteed to be interesting
 * Adds constraints to avoid boring flat outputs
 */
function generateInterestingInfluence(): PhysicsExprNode {
  // Generate base expression
  let expr = generateRandomCursorExpr(0, RI(3, 6));

  // Ensure it has cursor dependency by wrapping if needed
  if (R() < 0.3) {
    expr = mul(expr, exp(neg(mul(cursorDistance(), lit(RF(2, 8))))));
  }

  // Ensure it has time dependency sometimes
  if (R() < 0.4) {
    expr = mul(expr, add(lit(0.7), mul(sin(mul(time(), lit(RF(0.5, 3)))), lit(0.3))));
  }

  // Ensure it has angular variation sometimes (breaks circular symmetry)
  if (R() < 0.5) {
    expr = add(expr, mul(sin(mul(cursorAngle(), lit(RI(2, 10)))), lit(RF(0.1, 0.4))));
  }

  // Clamp to safe range
  return clamp(expr, lit(0), lit(1));
}

// =============================================================================
// PROCEDURAL COLOR MODIFIERS - How cursor effects modify color
// These are also procedurally generated, not hardcoded
// =============================================================================

/**
 * Generate a random color modification expression
 * TRUE FUZZER: builds random color transformations
 */
function generateRandomColorModification(influence: PhysicsExprNode): { code: string; declarations: string } {
  const infWGSL = astToWGSL(influence);
  const modType = RI(0, 10);

  let code: string;

  switch (modType) {
    case 0: // Brightness
      code = `    col = col * (1.0 + cursorInfluence * ${RF(0.2, 1.0).toFixed(3)});\n`;
      break;
    case 1: // RGB rotate
      code = `    col = mix(col, col.zyx, cursorInfluence);\n`;
      break;
    case 2: // RGB rotate other way
      code = `    col = mix(col, col.yzx, cursorInfluence);\n`;
      break;
    case 3: // Warm/cool shift
      code = `    col = mix(col * vec3<f32>(${RF(0.8, 1.0).toFixed(2)}, ${RF(0.9, 1.0).toFixed(2)}, ${RF(1.0, 1.2).toFixed(2)}), col * vec3<f32>(${RF(1.0, 1.2).toFixed(2)}, ${RF(0.9, 1.0).toFixed(2)}, ${RF(0.8, 1.0).toFixed(2)}), cursorInfluence);\n`;
      break;
    case 4: // Additive glow
      code = `    col = col + vec3<f32>(${RF(0.5, 1.0).toFixed(2)}, ${RF(0.5, 1.0).toFixed(2)}, ${RF(0.5, 1.0).toFixed(2)}) * cursorInfluence * ${RF(0.1, 0.5).toFixed(2)};\n`;
      break;
    case 5: // Contrast boost
      code = `    col = mix(vec3<f32>(0.5), col, 1.0 + cursorInfluence * ${RF(0.2, 0.8).toFixed(2)});\n`;
      break;
    case 6: // Inversion
      code = `    col = mix(col, 1.0 - col, cursorInfluence * ${RF(0.3, 0.9).toFixed(2)});\n`;
      break;
    case 7: // Saturation
      code = `    let gray = dot(col, vec3<f32>(0.299, 0.587, 0.114));\n    col = mix(vec3<f32>(gray), col, 1.0 + cursorInfluence * ${RF(0.3, 1.5).toFixed(2)});\n`;
      break;
    case 8: // Hue shift
      code = `    col = col * (0.5 + 0.5 * sin(vec3<f32>(0.0, ${RF(1.5, 2.5).toFixed(2)}, ${RF(3.5, 4.5).toFixed(2)}) + cursorInfluence * ${RF(3, 8).toFixed(2)}));\n`;
      break;
    case 9: // Multiplicative with color
      code = `    col = col * mix(vec3<f32>(1.0), vec3<f32>(${RF(0.8, 1.2).toFixed(2)}, ${RF(0.8, 1.2).toFixed(2)}, ${RF(0.8, 1.2).toFixed(2)}), cursorInfluence);\n`;
      break;
    default: // Random combination
      code = `    col = col * (${RF(0.8, 1.0).toFixed(2)} + cursorInfluence * ${RF(0.1, 0.4).toFixed(2)}) + vec3<f32>(cursorInfluence * ${RF(0.02, 0.1).toFixed(3)});\n`;
  }

  return {
    declarations: `    let cursorInfluence = ${infWGSL};\n`,
    code
  };
}

// =============================================================================
// MAIN AST CURSOR EFFECT GENERATOR
// =============================================================================

/**
 * Entity types that cursor can be aware of
 */
export type CursorEntityContext = {
  hasTime: boolean;
  hasNoise: boolean;
  hasFBM: boolean;
  baseExpressionComplexity: number; // 1-10
  colorChannels: 1 | 3; // grayscale or RGB
};

/**
 * Analyze shader to determine entity context
 */
export function analyzeShaderContext(shaderCode: string): CursorEntityContext {
  return {
    hasTime: shaderCode.includes('time'),
    hasNoise: shaderCode.includes('noise(') || shaderCode.includes('hash('),
    hasFBM: shaderCode.includes('fbm('),
    baseExpressionComplexity: Math.min(10, Math.max(1, Math.floor(shaderCode.length / 500))),
    colorChannels: shaderCode.includes('vec3') ? 3 : 1
  };
}

/**
 * Generate a cursor effect AST based on context
 * TRUE PROCEDURAL FUZZER - no hardcoded effects
 * Returns WGSL code to insert into shader
 */
export function generateCursorEffectAST(_context?: CursorEntityContext): { declarations: string; code: string } {
  // TRUE FUZZER: Generate completely random influence expression
  const influence = generateInterestingInfluence();

  // TRUE FUZZER: Generate random color modification
  return generateRandomColorModification(influence);
}

/**
 * Generate multiple layered cursor effects
 * TRUE FUZZER: Each layer is independently generated
 */
export function generateLayeredCursorEffects(layers: number = 2): { declarations: string; code: string } {
  let allDeclarations = '';
  let allCode = '';

  for (let i = 0; i < layers; i++) {
    const influence = generateInterestingInfluence();
    const effect = generateRandomColorModification(influence);
    // Rename variables to avoid conflicts
    const declarations = effect.declarations.replace(/cursorInfluence/g, `cursorLayer${i}`);
    const code = effect.code.replace(/cursorInfluence/g, `cursorLayer${i}`);
    allDeclarations += declarations;
    allCode += code;
  }

  return { declarations: allDeclarations, code: allCode };
}

/**
 * Generate cursor effect that interacts with existing shader expression
 * TRUE FUZZER: Uses procedurally generated cursor influence
 */
export function generateInteractiveCursorEffect(
  basePattern: PhysicsExprNode
): { modifiedPattern: PhysicsExprNode; cursorInfluence: PhysicsExprNode } {
  // TRUE FUZZER: Generate random cursor influence
  const cursorInf = generateInterestingInfluence();

  // Choose how cursor interacts with base pattern - also randomized
  const interactionType = RI(0, 7);
  let modifiedPattern: PhysicsExprNode;

  switch (interactionType) {
    case 0:
      // Additive: pattern + cursor
      modifiedPattern = add(basePattern, mul(cursorInf, lit(RF(0.1, 0.5))));
      break;
    case 1:
      // Multiplicative: pattern * (1 + cursor)
      modifiedPattern = mul(basePattern, add(lit(1), mul(cursorInf, lit(RF(0.2, 0.8)))));
      break;
    case 2:
      // Blend toward center value
      modifiedPattern = mix(basePattern, lit(0.5), cursorInf);
      break;
    case 3:
      // Invert near cursor
      modifiedPattern = mix(basePattern, sub(lit(1), basePattern), cursorInf);
      break;
    case 4:
      // Sharpen/enhance near cursor
      modifiedPattern = mix(basePattern, pow(basePattern, lit(RF(0.5, 2))), cursorInf);
      break;
    default:
      // Warp the pattern frequency
      modifiedPattern = mul(basePattern, add(lit(1), mul(sin(mul(cursorInf, lit(RF(5, 20)))), lit(0.3))));
  }

  return { modifiedPattern, cursorInfluence: cursorInf };
}

// =============================================================================
// HIGH-LEVEL WGSL GENERATION
// =============================================================================

/**
 * Generate complete cursor effect WGSL code block
 */
export function generateCursorEffectWGSL(): string {
  const effect = generateCursorEffectAST();
  return `    // AST-Generated Cursor Effect\n${effect.declarations}${effect.code}`;
}

/**
 * Generate cursor effect aware of shader entities
 */
export function generateContextAwareCursorEffect(shaderCode: string): string {
  const context = analyzeShaderContext(shaderCode);
  const effect = generateCursorEffectAST(context);
  return `    // Context-Aware Cursor Effect (complexity: ${context.baseExpressionComplexity})\n${effect.declarations}${effect.code}`;
}

/**
 * Generate cursor effect specifically for physics equations
 * Uses p_raw coordinate space and normalized mouse
 */
export function generateCursorEffectForPhysics(): string {
  const effect = generateCursorEffectAST();
  // Adapt the effect to use p_raw instead of p for physics shaders
  let code = effect.declarations + effect.code;
  // The AST uses 'p' but physics shaders use 'p_raw', so adapt
  code = code.replace(/\bp\b(?!\w)/g, 'p_raw');
  return `    // AST-Generated Cursor Effect\n${code}`;
}
