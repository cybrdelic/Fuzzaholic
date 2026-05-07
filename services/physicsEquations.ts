// Physics Equations Library - AST-Based Expression Generation
// Comprehensive physics formulas for shader generation using AST nodes

import { AST, astToWGSL, PhysicsExprNode } from './astTypes';
import { generateCursorEffectForPhysics } from './cursorEffectAST';
import { validateAndFixShader } from './shaderValidator';

// Re-export for backward compatibility
export { AST, astToWGSL };
export type { PhysicsExprNode };

// Shorthand aliases from the shared AST module
const { p, time, mouse, x, y, lit, add, sub, mul, div, mod, sin, cos, tan, abs, sqrt, pow, exp, log,
        floor, ceil, fract, min, max, clamp, mix, step, smoothstep, length, distance, dot, normalize,
        atan2, asin, acos, sinh, cosh, tanh, sign, vec2, vec3, vec4, neg, lt, gt, ternary } = AST;

// ============================================================================
// AST MUTATION SYSTEM - Infinite Variation Through AST Transformations
// ============================================================================

// Random utilities for mutation
const RF = (a: number, b: number) => Math.random() * (b - a) + a;
const RI = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// All safe unary functions for mutation
const UNARY_FNS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'exp', 'exp2', 'log', 'log2', 'sqrt', 'abs', 'sign', 'floor', 'ceil', 'fract', 'saturate'];

// All safe binary functions (NO 'mod' - WGSL uses % operator instead)
const BINARY_FNS = ['min', 'max', 'pow', 'step', 'atan2', 'distance'];

// All ternary functions
const TERNARY_FNS = ['clamp', 'mix', 'smoothstep'];

/**
 * Deep clone an AST node
 */
function cloneAST(node: PhysicsExprNode): PhysicsExprNode {
  switch (node.type) {
    case 'var': return { ...node };
    case 'literal': return { ...node };
    case 'component': return { ...node, expr: cloneAST(node.expr) };
    case 'binary': return { ...node, left: cloneAST(node.left), right: cloneAST(node.right) };
    case 'call': return { ...node, args: node.args.map(cloneAST) };
    case 'vec2': return { ...node, x: cloneAST(node.x), y: cloneAST(node.y) };
    case 'vec3': return { ...node, x: cloneAST(node.x), y: cloneAST(node.y), z: cloneAST(node.z) };
    case 'vec4': return { ...node, x: cloneAST(node.x), y: cloneAST(node.y), z: cloneAST(node.z), w: cloneAST(node.w) };
    case 'ternary': return { ...node, cond: cloneAST(node.cond), then: cloneAST(node.then), else: cloneAST(node.else) };
    case 'unary': return { ...node, expr: cloneAST(node.expr) };
    case 'compare': return { ...node, left: cloneAST(node.left), right: cloneAST(node.right) };
    default: return node;
  }
}

/**
 * Generate a random AST expression (for inserting new sub-expressions)
 */
function genRandomExpr(depth: number = 0): PhysicsExprNode {
  if (depth > 4 || Math.random() < 0.2) {
    // Terminal nodes
    const choice = RI(0, 8);
    // NOTE: mouse excluded to prevent cursor affecting shader pattern
    switch (choice) {
      case 0: return p();
      case 1: return time();
      case 2: return x(p());
      case 3: return y(p());
      case 4: return lit(RF(-2, 2));
      case 5: return length(p());
      case 6: return atan2(y(p()), x(p()));
      default: return lit(RF(0.1, 3));
    }
  }

  const choice = RI(0, 12);
  switch (choice) {
    case 0: return AST.call(pick(UNARY_FNS), genRandomExpr(depth + 1));
    case 1: return add(genRandomExpr(depth + 1), genRandomExpr(depth + 1));
    case 2: return sub(genRandomExpr(depth + 1), genRandomExpr(depth + 1));
    case 3: return mul(genRandomExpr(depth + 1), genRandomExpr(depth + 1));
    case 4: return div(genRandomExpr(depth + 1), max(abs(genRandomExpr(depth + 1)), lit(0.001)));
    case 5: return pow(abs(genRandomExpr(depth + 1)), lit(RF(0.5, 3)));
    case 6: return mix(genRandomExpr(depth + 1), genRandomExpr(depth + 1), clamp(genRandomExpr(depth + 1), lit(0), lit(1)));
    case 7: return smoothstep(lit(RF(-1, 0)), lit(RF(0.1, 1)), genRandomExpr(depth + 1));
    case 8: return fract(mul(genRandomExpr(depth + 1), lit(RF(1, 20))));
    case 9: return dot(vec2(genRandomExpr(depth + 1), genRandomExpr(depth + 1)), vec2(genRandomExpr(depth + 1), genRandomExpr(depth + 1)));
    case 10: return length(vec2(genRandomExpr(depth + 1), genRandomExpr(depth + 1)));
    case 11: return sin(mul(genRandomExpr(depth + 1), lit(RF(1, 10))));
    default: return cos(mul(genRandomExpr(depth + 1), lit(RF(1, 10))));
  }
}

/**
 * Mutate an AST node with given intensity (0-1)
 * Returns a new mutated AST (original is not modified)
 */
export function mutateAST(node: PhysicsExprNode, intensity: number = 0.5): PhysicsExprNode {
  const clone = cloneAST(node);
  return mutateASTInPlace(clone, intensity, 0);
}

function mutateASTInPlace(node: PhysicsExprNode, intensity: number, depth: number): PhysicsExprNode {
  // Limit recursion depth
  if (depth > 10) return node;

  // Random chance to mutate this node
  const mutateChance = intensity * 0.3;

  switch (node.type) {
    case 'literal':
      // Mutate literal values
      if (Math.random() < intensity * 0.5) {
        const mutation = RI(0, 5);
        switch (mutation) {
          case 0: return lit(node.value * RF(0.5, 2)); // Scale
          case 1: return lit(node.value + RF(-1, 1)); // Offset
          case 2: return lit(RF(-3, 3)); // Replace
          case 3: return sin(mul(time(), lit(node.value))); // Make time-dependent
          case 4: return add(lit(node.value), mul(sin(time()), lit(RF(0.1, 0.5)))); // Oscillate
          default: return lit(node.value * -1); // Negate
        }
      }
      break;

    case 'var':
      // Wrap in function - NOTE: no mouse swap to prevent cursor affecting pattern
      if (Math.random() < mutateChance) {
        const mutation = RI(0, 3);
        switch (mutation) {
          case 0: return mul(node, lit(RF(0.5, 2)));
          case 1: return sin(node);
          case 2: return fract(mul(node, lit(RF(2, 10))));
          default: return node;
        }
      }
      break;

    case 'component':
      // Swap x/y or mutate inner expression
      if (Math.random() < mutateChance) {
        const newComp = node.comp === 'x' ? 'y' : 'x';
        return { ...node, comp: newComp, expr: mutateASTInPlace(node.expr, intensity, depth + 1) };
      }
      node.expr = mutateASTInPlace(node.expr, intensity, depth + 1);
      break;

    case 'binary':
      // Mutate operator or operands
      if (Math.random() < mutateChance) {
        const ops: ('+' | '-' | '*' | '/')[] = ['+', '-', '*', '/'];
        (node as any).op = pick(ops);
      }
      node.left = mutateASTInPlace(node.left, intensity, depth + 1);
      node.right = mutateASTInPlace(node.right, intensity, depth + 1);
      break;

    case 'call':
      // Replace function or mutate arguments
      if (Math.random() < mutateChance) {
        const argCount = node.args.length;
        if (argCount === 1) {
          (node as any).fn = pick(UNARY_FNS);
        } else if (argCount === 2) {
          (node as any).fn = pick(BINARY_FNS);
        } else if (argCount === 3) {
          (node as any).fn = pick(TERNARY_FNS);
        }
      }
      node.args = node.args.map(arg => mutateASTInPlace(arg, intensity, depth + 1));
      break;

    case 'vec2':
      node.x = mutateASTInPlace(node.x, intensity, depth + 1);
      node.y = mutateASTInPlace(node.y, intensity, depth + 1);
      // Maybe swap components
      if (Math.random() < mutateChance * 0.3) {
        const temp = node.x;
        node.x = node.y;
        node.y = temp;
      }
      break;

    case 'vec3':
      node.x = mutateASTInPlace(node.x, intensity, depth + 1);
      node.y = mutateASTInPlace(node.y, intensity, depth + 1);
      node.z = mutateASTInPlace(node.z, intensity, depth + 1);
      break;

    case 'unary':
      node.expr = mutateASTInPlace(node.expr, intensity, depth + 1);
      if (Math.random() < mutateChance) {
        // Remove negation or wrap in function
        return Math.random() < 0.5 ? node.expr : abs(node);
      }
      break;
  }

  // Random chance to wrap entire node in a new expression
  if (Math.random() < intensity * 0.15 && depth < 5) {
    const wrapType = RI(0, 7);
    switch (wrapType) {
      case 0: return sin(node);
      case 1: return cos(node);
      case 2: return abs(node);
      case 3: return fract(node);
      case 4: return mul(node, lit(RF(0.5, 2)));
      case 5: return add(node, mul(sin(time()), lit(RF(0.1, 0.5))));
      case 6: return mix(node, genRandomExpr(depth + 1), lit(RF(0.2, 0.8)));
      default: return node;
    }
  }

  return node;
}

/**
 * Combine two AST expressions in interesting ways
 */
export function combineAST(a: PhysicsExprNode, b: PhysicsExprNode): PhysicsExprNode {
  const combineType = RI(0, 10);
  switch (combineType) {
    case 0: return add(a, b);
    case 1: return sub(a, b);
    case 2: return mul(a, b);
    case 3: return mix(a, b, clamp(sin(time()), lit(0), lit(1)));
    case 4: return max(a, b);
    case 5: return min(a, b);
    case 6: return mul(sin(a), cos(b));
    case 7: return add(mul(a, lit(0.7)), mul(b, lit(0.3)));
    case 8: return smoothstep(a, b, length(p()));
    case 9: return fract(add(a, b));
    default: return add(mul(a, x(p())), mul(b, y(p())));
  }
}

/**
 * TRUE PROCEDURAL PHYSICS EXPRESSION GENERATOR
 *
 * Generates expressions from ATOMIC building blocks only.
 * NO preset patterns - builds random AST trees from scratch.
 * Can theoretically generate ANY possible mathematical expression.
 */
export function generateTrueProceduralPhysicsExpr(depth: number = 5): PhysicsExprNode {
  // TRUE PROCEDURAL - Start from nothing, build everything randomly
  return genRandomExprDeep(depth);
}

/**
 * Deep random expression generator - NO PRESETS
 * Builds expression trees purely from atomic operations
 */
function genRandomExprDeep(depth: number): PhysicsExprNode {
  // Base case - return a random terminal
  if (depth <= 0 || Math.random() < 0.15) {
    return genRandomTerminal();
  }

  // Randomly choose what kind of expression to build
  const choice = RI(0, 20);

  switch (choice) {
    // Unary function application
    case 0: case 1: case 2: case 3:
      return AST.call(pick(UNARY_FNS), genRandomExprDeep(depth - 1));

    // Binary operations
    case 4:
      return add(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1));
    case 5:
      return sub(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1));
    case 6:
      return mul(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1));
    case 7:
      // Safe division
      return div(genRandomExprDeep(depth - 1), max(abs(genRandomExprDeep(depth - 1)), lit(0.001)));

    // Binary function calls
    case 8:
      return min(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1));
    case 9:
      return max(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1));
    case 10:
      return pow(abs(genRandomExprDeep(depth - 1)), clamp(genRandomExprDeep(depth - 1), lit(0.1), lit(4)));

    // Ternary functions
    case 11:
      return mix(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1), clamp(genRandomExprDeep(depth - 1), lit(0), lit(1)));
    case 12:
      return smoothstep(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1));
    case 13:
      return clamp(genRandomExprDeep(depth - 1), lit(RF(-2, 0)), lit(RF(0.1, 2)));

    // Vector operations converted to scalar
    case 14:
      return length(vec2(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1)));
    case 15:
      return dot(vec2(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1)), vec2(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1)));
    case 16:
      return distance(vec2(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1)), vec2(x(p()), y(p())));

    // Angle operations
    case 17:
      return atan2(genRandomExprDeep(depth - 1), genRandomExprDeep(depth - 1));

    // Compound expressions
    case 18:
      // Trigonometric compound
      return mul(sin(genRandomExprDeep(depth - 1)), cos(genRandomExprDeep(depth - 1)));
    case 19:
      // Exponential decay/growth
      return exp(neg(abs(genRandomExprDeep(depth - 1))));

    default:
      // Fract for wrapping
      return fract(mul(genRandomExprDeep(depth - 1), lit(RF(1, 20))));
  }
}

/**
 * Generate a random terminal node - NO PRESETS
 */
function genRandomTerminal(): PhysicsExprNode {
  const choice = RI(0, 12);
  switch (choice) {
    case 0: return p();  // UV position
    case 1: return time();  // Time
    case 2: return x(p());  // X coordinate
    case 3: return y(p());  // Y coordinate
    case 4: return lit(RF(-3, 3));  // Random float
    case 5: return lit(RF(0.01, 0.5));  // Small positive
    case 6: return lit(RF(1, 20));  // Medium positive
    case 7: return length(p());  // Distance from origin
    case 8: return atan2(y(p()), x(p()));  // Angle
    case 9: return lit(Math.PI * RF(0.5, 2));  // PI multiple
    case 10: return lit(RF(0.1, 1));  // Unit range
    case 11: return sub(x(p()), lit(0.5));  // Centered X
    default: return sub(y(p()), lit(0.5));  // Centered Y
  }
}

/**
 * Generate a completely random physics expression from scratch
 * LEGACY - kept for compatibility but now uses true procedural generation
 */
export function generateRandomPhysicsExpr(complexity: number = 5): PhysicsExprNode {
  // NOW TRULY PROCEDURAL - No preset patterns
  return generateTrueProceduralPhysicsExpr(complexity);
}

// ============================================================================
// Physics Equation Interface
// ============================================================================

export interface PhysicsEquation {
  name: string;
  category: string;
  description: string;
  buildExpr: () => PhysicsExprNode;
  colorScheme: 'thermal' | 'electric' | 'plasma' | 'fire' | 'quantum' | 'magnetic' | 'ocean' | 'neon' | 'grayscale' | 'heatmap';
}

// ============================================================================
// CATEGORY 1: CLASSICAL MECHANICS (20 equations)
// ============================================================================

export const mechanicsEquations: PhysicsEquation[] = [
  {
    name: 'Simple Harmonic Motion',
    category: 'mechanics',
    description: 'x(t) = A·cos(ωt + φ)',
    buildExpr: () => mul(lit(0.5), cos(add(mul(time(), lit(3)), x(p())))),
    colorScheme: 'thermal',
  },
  {
    name: 'Damped Oscillation',
    category: 'mechanics',
    description: 'x(t) = A·e^(-γt)·cos(ωt)',
    buildExpr: () => mul(exp(mul(neg(time()), lit(0.3))), cos(mul(add(x(p()), y(p())), mul(time(), lit(5))))),
    colorScheme: 'thermal',
  },
  {
    name: 'Projectile Motion Y',
    category: 'mechanics',
    description: 'y = v₀t - ½gt²',
    buildExpr: () => sub(mul(y(p()), time()), mul(lit(0.5), mul(lit(9.8), pow(time(), lit(2))))),
    colorScheme: 'fire',
  },
  {
    name: 'Kinetic Energy Field',
    category: 'mechanics',
    description: 'KE = ½mv² visualized',
    buildExpr: () => mul(lit(0.5), pow(length(p()), lit(2))),
    colorScheme: 'fire',
  },
  {
    name: 'Potential Energy Gradient',
    category: 'mechanics',
    description: 'PE = mgh height field',
    buildExpr: () => mul(lit(9.8), add(y(p()), lit(0.5))),
    colorScheme: 'thermal',
  },
  {
    name: 'Centripetal Acceleration',
    category: 'mechanics',
    description: 'a = v²/r circular motion',
    buildExpr: () => div(pow(length(p()), lit(2)), max(length(p()), lit(0.01))),
    colorScheme: 'plasma',
  },
  {
    name: 'Angular Momentum',
    category: 'mechanics',
    description: 'L = r × p cross product magnitude',
    buildExpr: () => abs(sub(mul(x(p()), sin(time())), mul(y(p()), cos(time())))),
    colorScheme: 'magnetic',
  },
  {
    name: 'Torque Field',
    category: 'mechanics',
    description: 'τ = r × F torque visualization',
    buildExpr: () => mul(length(p()), sin(add(atan2(y(p()), x(p())), time()))),
    colorScheme: 'fire',
  },
  {
    name: 'Elastic Collision',
    category: 'mechanics',
    description: 'Momentum conservation pattern',
    buildExpr: () => abs(sin(mul(add(x(p()), mul(time(), lit(2))), lit(10)))),
    colorScheme: 'neon',
  },
  {
    name: 'Spring Force Field',
    category: 'mechanics',
    description: 'F = -kx Hooke\'s law',
    buildExpr: () => mul(neg(lit(5)), sub(length(p()), lit(0.3))),
    colorScheme: 'electric',
  },
  {
    name: 'Pendulum Phase Space',
    category: 'mechanics',
    description: 'θ vs ω phase portrait',
    buildExpr: () => sin(add(mul(x(p()), lit(6.28)), mul(cos(mul(time(), lit(2))), y(p())))),
    colorScheme: 'plasma',
  },
  {
    name: 'Work Energy Theorem',
    category: 'mechanics',
    description: 'W = ∫F·dx integral visualization',
    buildExpr: () => mul(length(p()), cos(mul(length(p()), add(time(), lit(1))))),
    colorScheme: 'fire',
  },
  {
    name: 'Impulse Pattern',
    category: 'mechanics',
    description: 'J = ∫F dt momentum transfer',
    buildExpr: () => mul(exp(neg(pow(sub(fract(time()), lit(0.5)), lit(2)))), sin(mul(length(p()), lit(20)))),
    colorScheme: 'neon',
  },
  {
    name: 'Rolling Motion',
    category: 'mechanics',
    description: 'Combined rotation and translation',
    buildExpr: () => add(sin(mul(x(p()), lit(10))), cos(sub(mul(y(p()), lit(10)), mul(time(), lit(3))))),
    colorScheme: 'thermal',
  },
  {
    name: 'Moment of Inertia',
    category: 'mechanics',
    description: 'I = ∫r²dm distribution',
    buildExpr: () => pow(length(p()), lit(2)),
    colorScheme: 'grayscale',
  },
  {
    name: 'Gyroscopic Precession',
    category: 'mechanics',
    description: 'Precessing top pattern',
    buildExpr: () => sin(add(mul(atan2(y(p()), x(p())), lit(3)), mul(time(), lit(2)))),
    colorScheme: 'magnetic',
  },
  {
    name: 'Coriolis Effect',
    category: 'mechanics',
    description: 'Rotating reference frame',
    buildExpr: () => add(mul(x(p()), cos(time())), mul(y(p()), sin(time()))),
    colorScheme: 'ocean',
  },
  {
    name: 'Foucault Pendulum',
    category: 'mechanics',
    description: 'Earth rotation demonstration',
    buildExpr: () => mul(cos(mul(length(p()), lit(5))), sin(add(atan2(y(p()), x(p())), mul(time(), lit(0.1))))),
    colorScheme: 'magnetic',
  },
  {
    name: 'Reduced Mass System',
    category: 'mechanics',
    description: 'Two-body problem visualization',
    buildExpr: () => div(lit(1), add(lit(1), pow(length(p()), lit(2)))),
    colorScheme: 'plasma',
  },
  {
    name: 'Hamiltonian Flow',
    category: 'mechanics',
    description: 'Phase space trajectories',
    buildExpr: () => sin(add(pow(x(p()), lit(2)), pow(y(p()), lit(2)))),
    colorScheme: 'quantum',
  },
];

// ============================================================================
// CATEGORY 2: WAVES & OSCILLATIONS (20 equations)
// ============================================================================

export const waveEquations: PhysicsEquation[] = [
  {
    name: 'Plane Wave',
    category: 'waves',
    description: 'ψ = A·sin(kx - ωt)',
    buildExpr: () => sin(sub(mul(x(p()), lit(10)), mul(time(), lit(3)))),
    colorScheme: 'ocean',
  },
  {
    name: 'Circular Wave',
    category: 'waves',
    description: 'Ripples from point source',
    buildExpr: () => sin(sub(mul(length(p()), lit(20)), mul(time(), lit(5)))),
    colorScheme: 'ocean',
  },
  {
    name: 'Standing Wave',
    category: 'waves',
    description: 'Two counter-propagating waves',
    buildExpr: () => mul(sin(mul(x(p()), lit(10))), cos(mul(time(), lit(5)))),
    colorScheme: 'electric',
  },
  {
    name: 'Wave Interference',
    category: 'waves',
    description: 'Two-source interference pattern',
    buildExpr: () => add(
      sin(sub(mul(length(sub(p(), vec2(neg(lit(0.3)), lit(0)))), lit(30)), mul(time(), lit(5)))),
      sin(sub(mul(length(sub(p(), vec2(lit(0.3), lit(0)))), lit(30)), mul(time(), lit(5))))
    ),
    colorScheme: 'electric',
  },
  {
    name: 'Doppler Shift',
    category: 'waves',
    description: 'Moving source frequency shift',
    buildExpr: () => sin(mul(sub(mul(length(p()), lit(20)), mul(time(), lit(3))), add(lit(1), mul(x(p()), lit(0.5))))),
    colorScheme: 'neon',
  },
  {
    name: 'Wave Packet',
    category: 'waves',
    description: 'Gaussian envelope modulation',
    buildExpr: () => mul(exp(neg(mul(pow(sub(x(p()), mul(time(), lit(0.2))), lit(2)), lit(5)))), sin(mul(x(p()), lit(30)))),
    colorScheme: 'quantum',
  },
  {
    name: 'Dispersion Relation',
    category: 'waves',
    description: 'Frequency-dependent velocity',
    buildExpr: () => sin(sub(mul(x(p()), lit(10)), mul(time(), sqrt(abs(x(p())))))),
    colorScheme: 'plasma',
  },
  {
    name: 'Beats Pattern',
    category: 'waves',
    description: 'Two close frequencies',
    buildExpr: () => add(sin(mul(x(p()), lit(20))), sin(mul(x(p()), lit(22)))),
    colorScheme: 'neon',
  },
  {
    name: 'Resonance Curve',
    category: 'waves',
    description: 'Amplitude vs frequency',
    buildExpr: () => div(lit(1), add(lit(0.1), pow(sub(length(p()), lit(0.5)), lit(2)))),
    colorScheme: 'fire',
  },
  {
    name: 'Diffraction Grating',
    category: 'waves',
    description: 'Multiple slit interference',
    buildExpr: () => pow(abs(div(sin(mul(x(p()), lit(50))), max(sin(mul(x(p()), lit(10))), lit(0.01)))), lit(2)),
    colorScheme: 'electric',
  },
  {
    name: 'Single Slit Diffraction',
    category: 'waves',
    description: 'sinc² intensity pattern',
    buildExpr: () => pow(div(sin(mul(x(p()), lit(20))), max(mul(x(p()), lit(20)), lit(0.01))), lit(2)),
    colorScheme: 'quantum',
  },
  {
    name: 'Spherical Wave',
    category: 'waves',
    description: '1/r amplitude decay',
    buildExpr: () => mul(div(lit(1), max(length(p()), lit(0.1))), sin(sub(mul(length(p()), lit(20)), mul(time(), lit(5))))),
    colorScheme: 'ocean',
  },
  {
    name: 'Evanescent Wave',
    category: 'waves',
    description: 'Exponential decay beyond boundary',
    buildExpr: () => mul(exp(neg(mul(max(sub(y(p()), lit(0)), lit(0)), lit(10)))), sin(sub(mul(x(p()), lit(15)), mul(time(), lit(3))))),
    colorScheme: 'quantum',
  },
  {
    name: 'Longitudinal Wave',
    category: 'waves',
    description: 'Compression wave visualization',
    buildExpr: () => add(x(p()), mul(lit(0.1), sin(sub(mul(x(p()), lit(20)), mul(time(), lit(5)))))),
    colorScheme: 'thermal',
  },
  {
    name: 'Transverse Wave',
    category: 'waves',
    description: 'Perpendicular oscillation',
    buildExpr: () => add(y(p()), mul(lit(0.1), sin(sub(mul(x(p()), lit(15)), mul(time(), lit(4)))))),
    colorScheme: 'ocean',
  },
  {
    name: 'Wave Superposition',
    category: 'waves',
    description: 'Multiple frequency sum',
    buildExpr: () => add(add(sin(mul(x(p()), lit(5))), mul(lit(0.5), sin(mul(x(p()), lit(10))))), mul(lit(0.25), sin(mul(x(p()), lit(20))))),
    colorScheme: 'plasma',
  },
  {
    name: 'Phase Velocity',
    category: 'waves',
    description: 'Constant phase surface motion',
    buildExpr: () => fract(sub(mul(length(p()), lit(5)), mul(time(), lit(2)))),
    colorScheme: 'neon',
  },
  {
    name: 'Group Velocity',
    category: 'waves',
    description: 'Envelope propagation',
    buildExpr: () => mul(cos(sub(mul(x(p()), lit(2)), mul(time(), lit(0.5)))), sin(sub(mul(x(p()), lit(20)), mul(time(), lit(5))))),
    colorScheme: 'electric',
  },
  {
    name: 'Waveguide Mode',
    category: 'waves',
    description: 'Confined wave pattern',
    buildExpr: () => mul(sin(mul(y(p()), lit(6.28))), sin(sub(mul(x(p()), lit(10)), mul(time(), lit(3))))),
    colorScheme: 'electric',
  },
  {
    name: 'Surface Wave',
    category: 'waves',
    description: 'Rayleigh wave motion',
    buildExpr: () => mul(exp(neg(mul(abs(y(p())), lit(5)))), sin(sub(mul(x(p()), lit(15)), mul(time(), lit(4))))),
    colorScheme: 'ocean',
  },
];

// ============================================================================
// CATEGORY 3: ELECTROMAGNETISM (20 equations)
// ============================================================================

export const emEquations: PhysicsEquation[] = [
  {
    name: 'Electric Field Point Charge',
    category: 'electromagnetism',
    description: 'E = kq/r² Coulomb field',
    buildExpr: () => div(lit(1), max(pow(length(p()), lit(2)), lit(0.01))),
    colorScheme: 'electric',
  },
  {
    name: 'Dipole Field',
    category: 'electromagnetism',
    description: 'Electric dipole pattern',
    buildExpr: () => sub(
      div(lit(1), max(length(sub(p(), vec2(lit(0.2), lit(0)))), lit(0.05))),
      div(lit(1), max(length(add(p(), vec2(lit(0.2), lit(0)))), lit(0.05)))
    ),
    colorScheme: 'electric',
  },
  {
    name: 'Magnetic Field Lines',
    category: 'electromagnetism',
    description: 'B-field visualization',
    buildExpr: () => sin(mul(atan2(y(p()), x(p())), lit(2))),
    colorScheme: 'magnetic',
  },
  {
    name: 'Electromagnetic Wave',
    category: 'electromagnetism',
    description: 'E × B propagation',
    buildExpr: () => mul(sin(sub(mul(x(p()), lit(10)), mul(time(), lit(5)))), cos(sub(mul(x(p()), lit(10)), mul(time(), lit(5))))),
    colorScheme: 'plasma',
  },
  {
    name: 'Faraday Induction',
    category: 'electromagnetism',
    description: 'Changing magnetic flux',
    buildExpr: () => mul(cos(mul(time(), lit(3))), sin(mul(length(p()), lit(10)))),
    colorScheme: 'electric',
  },
  {
    name: 'Lenz\'s Law Pattern',
    category: 'electromagnetism',
    description: 'Opposing induced field',
    buildExpr: () => mul(neg(sin(mul(time(), lit(2)))), exp(neg(pow(length(p()), lit(2))))),
    colorScheme: 'magnetic',
  },
  {
    name: 'Capacitor Field',
    category: 'electromagnetism',
    description: 'Parallel plate E-field',
    buildExpr: () => mul(step(neg(lit(0.3)), x(p())), step(x(p()), lit(0.3))),
    colorScheme: 'electric',
  },
  {
    name: 'Solenoid B-Field',
    category: 'electromagnetism',
    description: 'Uniform interior field',
    buildExpr: () => mul(step(length(p()), lit(0.3)), lit(1)),
    colorScheme: 'magnetic',
  },
  {
    name: 'Ampere\'s Law',
    category: 'electromagnetism',
    description: 'Current loop field',
    buildExpr: () => div(lit(1), max(length(p()), lit(0.1))),
    colorScheme: 'magnetic',
  },
  {
    name: 'Gauss\'s Law Flux',
    category: 'electromagnetism',
    description: 'Enclosed charge flux',
    buildExpr: () => mul(sign(sub(length(p()), lit(0.3))), div(lit(1), max(pow(length(p()), lit(2)), lit(0.01)))),
    colorScheme: 'electric',
  },
  {
    name: 'Poynting Vector',
    category: 'electromagnetism',
    description: 'Energy flow S = E × B',
    buildExpr: () => mul(pow(sin(sub(mul(x(p()), lit(10)), mul(time(), lit(5)))), lit(2)), lit(0.5)),
    colorScheme: 'fire',
  },
  {
    name: 'Skin Effect',
    category: 'electromagnetism',
    description: 'Current density at surface',
    buildExpr: () => mul(exp(neg(mul(abs(sub(length(p()), lit(0.5))), lit(20)))), sin(mul(time(), lit(5)))),
    colorScheme: 'electric',
  },
  {
    name: 'Waveguide TE Mode',
    category: 'electromagnetism',
    description: 'Transverse electric mode',
    buildExpr: () => mul(cos(mul(y(p()), lit(3.14))), sin(sub(mul(x(p()), lit(10)), mul(time(), lit(5))))),
    colorScheme: 'plasma',
  },
  {
    name: 'Radiation Pattern',
    category: 'electromagnetism',
    description: 'Antenna dipole radiation',
    buildExpr: () => mul(pow(sin(atan2(y(p()), x(p()))), lit(2)), div(lit(1), max(length(p()), lit(0.1)))),
    colorScheme: 'neon',
  },
  {
    name: 'Polarization Rotation',
    category: 'electromagnetism',
    description: 'Faraday rotation effect',
    buildExpr: () => cos(add(mul(atan2(y(p()), x(p())), lit(1)), mul(time(), lit(2)))),
    colorScheme: 'plasma',
  },
  {
    name: 'Cyclotron Motion',
    category: 'electromagnetism',
    description: 'Charged particle in B-field',
    buildExpr: () => length(sub(p(), vec2(mul(lit(0.3), cos(mul(time(), lit(5)))), mul(lit(0.3), sin(mul(time(), lit(5))))))),
    colorScheme: 'magnetic',
  },
  {
    name: 'Hall Effect',
    category: 'electromagnetism',
    description: 'Transverse voltage pattern',
    buildExpr: () => mul(x(p()), mul(y(p()), sin(mul(time(), lit(2))))),
    colorScheme: 'electric',
  },
  {
    name: 'Eddy Currents',
    category: 'electromagnetism',
    description: 'Induced circular currents',
    buildExpr: () => mul(sin(mul(length(p()), lit(15))), mul(cos(mul(time(), lit(3))), exp(neg(pow(length(p()), lit(2)))))),
    colorScheme: 'magnetic',
  },
  {
    name: 'Plasma Oscillation',
    category: 'electromagnetism',
    description: 'Electron density wave',
    buildExpr: () => sin(add(mul(x(p()), lit(20)), mul(sin(mul(time(), lit(10))), lit(0.5)))),
    colorScheme: 'plasma',
  },
  {
    name: 'Debye Shielding',
    category: 'electromagnetism',
    description: 'Screened Coulomb potential',
    buildExpr: () => mul(div(lit(1), max(length(p()), lit(0.05))), exp(neg(mul(length(p()), lit(3))))),
    colorScheme: 'electric',
  },
];

// ============================================================================
// CATEGORY 4: THERMODYNAMICS (15 equations)
// ============================================================================

export const thermoEquations: PhysicsEquation[] = [
  {
    name: 'Heat Diffusion',
    category: 'thermodynamics',
    description: '∂T/∂t = α∇²T heat equation',
    buildExpr: () => mul(exp(neg(mul(pow(length(p()), lit(2)), div(lit(1), add(time(), lit(0.1)))))), lit(1)),
    colorScheme: 'heatmap',
  },
  {
    name: 'Boltzmann Distribution',
    category: 'thermodynamics',
    description: 'P(E) ∝ e^(-E/kT)',
    buildExpr: () => exp(neg(mul(pow(length(p()), lit(2)), lit(3)))),
    colorScheme: 'thermal',
  },
  {
    name: 'Maxwell-Boltzmann Speed',
    category: 'thermodynamics',
    description: 'v² e^(-v²) distribution',
    buildExpr: () => mul(pow(length(p()), lit(2)), exp(neg(pow(length(p()), lit(2))))),
    colorScheme: 'thermal',
  },
  {
    name: 'Entropy Gradient',
    category: 'thermodynamics',
    description: 'S = k ln(Ω) disorder field',
    buildExpr: () => log(add(lit(1), mul(pow(length(p()), lit(2)), lit(10)))),
    colorScheme: 'heatmap',
  },
  {
    name: 'Carnot Cycle',
    category: 'thermodynamics',
    description: 'Efficiency η = 1 - Tc/Th',
    buildExpr: () => sub(lit(1), div(min(y(p()), lit(0.5)), max(y(p()), lit(0.1)))),
    colorScheme: 'fire',
  },
  {
    name: 'Stefan-Boltzmann Radiation',
    category: 'thermodynamics',
    description: 'j = σT⁴ blackbody power',
    buildExpr: () => pow(add(length(p()), lit(0.5)), lit(4)),
    colorScheme: 'fire',
  },
  {
    name: 'Planck Spectrum',
    category: 'thermodynamics',
    description: 'Blackbody radiation curve',
    buildExpr: () => div(pow(x(p()), lit(3)), sub(exp(div(x(p()), max(y(p()), lit(0.1)))), lit(1))),
    colorScheme: 'thermal',
  },
  {
    name: 'Fourier Heat Conduction',
    category: 'thermodynamics',
    description: 'q = -k∇T heat flux',
    buildExpr: () => neg(sub(x(p()), mul(lit(0.5), y(p())))),
    colorScheme: 'heatmap',
  },
  {
    name: 'Thermal Expansion',
    category: 'thermodynamics',
    description: 'ΔL = αLΔT length change',
    buildExpr: () => mul(length(p()), mul(lit(0.1), sin(mul(time(), lit(2))))),
    colorScheme: 'thermal',
  },
  {
    name: 'Ideal Gas Pressure',
    category: 'thermodynamics',
    description: 'PV = nRT isotherms',
    buildExpr: () => div(lit(1), max(length(p()), lit(0.05))),
    colorScheme: 'fire',
  },
  {
    name: 'Adiabatic Process',
    category: 'thermodynamics',
    description: 'PV^γ = constant',
    buildExpr: () => pow(div(lit(1), max(length(p()), lit(0.1))), lit(1.4)),
    colorScheme: 'thermal',
  },
  {
    name: 'Phase Transition',
    category: 'thermodynamics',
    description: 'Order parameter jump',
    buildExpr: () => tanh(mul(sub(y(p()), lit(0)), lit(10))),
    colorScheme: 'heatmap',
  },
  {
    name: 'Gibbs Free Energy',
    category: 'thermodynamics',
    description: 'G = H - TS landscape',
    buildExpr: () => sub(pow(length(p()), lit(4)), mul(lit(2), pow(length(p()), lit(2)))),
    colorScheme: 'thermal',
  },
  {
    name: 'Brownian Motion',
    category: 'thermodynamics',
    description: 'Random thermal fluctuations',
    buildExpr: () => sin(mul(add(mul(x(p()), lit(50)), mul(time(), lit(10))), add(lit(1), mul(y(p()), lit(3))))),
    colorScheme: 'thermal',
  },
  {
    name: 'Equipartition Energy',
    category: 'thermodynamics',
    description: '⟨E⟩ = ½kT per DOF',
    buildExpr: () => mul(lit(0.5), add(pow(x(p()), lit(2)), pow(y(p()), lit(2)))),
    colorScheme: 'fire',
  },
];

// ============================================================================
// CATEGORY 5: QUANTUM MECHANICS (15 equations)
// ============================================================================

export const quantumEquations: PhysicsEquation[] = [
  {
    name: 'Particle in Box',
    category: 'quantum',
    description: 'ψₙ = sin(nπx/L) eigenstate',
    buildExpr: () => pow(sin(mul(x(p()), lit(3.14159))), lit(2)),
    colorScheme: 'quantum',
  },
  {
    name: 'Quantum Harmonic Oscillator',
    category: 'quantum',
    description: 'Hermite-Gaussian ground state',
    buildExpr: () => mul(exp(neg(pow(length(p()), lit(2)))), cos(mul(length(p()), lit(5)))),
    colorScheme: 'quantum',
  },
  {
    name: 'Hydrogen 1s Orbital',
    category: 'quantum',
    description: 'ψ₁ₛ = e^(-r/a₀)',
    buildExpr: () => exp(neg(mul(length(p()), lit(5)))),
    colorScheme: 'quantum',
  },
  {
    name: 'Hydrogen 2p Orbital',
    category: 'quantum',
    description: 'ψ₂ₚ ∝ r·e^(-r/2a₀)·cosθ',
    buildExpr: () => mul(mul(length(p()), exp(neg(mul(length(p()), lit(2.5))))), cos(atan2(y(p()), x(p())))),
    colorScheme: 'quantum',
  },
  {
    name: 'Quantum Tunneling',
    category: 'quantum',
    description: 'Wavefunction in barrier',
    buildExpr: () => mul(exp(neg(mul(abs(x(p())), lit(5)))), sin(sub(mul(abs(x(p())), lit(20)), mul(time(), lit(5))))),
    colorScheme: 'quantum',
  },
  {
    name: 'Double Slit Probability',
    category: 'quantum',
    description: '|ψ₁ + ψ₂|² interference',
    buildExpr: () => pow(abs(add(
      sin(mul(length(sub(p(), vec2(lit(0), lit(0.1)))), lit(30))),
      sin(mul(length(sub(p(), vec2(lit(0), neg(lit(0.1))))), lit(30)))
    )), lit(2)),
    colorScheme: 'quantum',
  },
  {
    name: 'Schrödinger Time Evolution',
    category: 'quantum',
    description: 'ψ(t) = e^(-iEt/ℏ)ψ(0)',
    buildExpr: () => mul(cos(mul(time(), mul(pow(length(p()), lit(2)), lit(5)))), exp(neg(pow(length(p()), lit(2))))),
    colorScheme: 'quantum',
  },
  {
    name: 'Uncertainty Principle',
    category: 'quantum',
    description: 'ΔxΔp ≥ ℏ/2 visualization',
    buildExpr: () => mul(exp(neg(pow(x(p()), lit(2)))), exp(neg(mul(pow(y(p()), lit(2)), lit(4))))),
    colorScheme: 'quantum',
  },
  {
    name: 'Spin-½ State',
    category: 'quantum',
    description: 'Bloch sphere projection',
    buildExpr: () => add(mul(cos(mul(time(), lit(2))), x(p())), mul(sin(mul(time(), lit(2))), y(p()))),
    colorScheme: 'magnetic',
  },
  {
    name: 'de Broglie Wave',
    category: 'quantum',
    description: 'λ = h/p matter wave',
    buildExpr: () => sin(mul(add(mul(x(p()), lit(1)), mul(y(p()), lit(0.5))), mul(lit(20), div(lit(1), add(length(p()), lit(0.5)))))),
    colorScheme: 'quantum',
  },
  {
    name: 'Fermi-Dirac Distribution',
    category: 'quantum',
    description: 'f(E) = 1/(e^((E-μ)/kT) + 1)',
    buildExpr: () => div(lit(1), add(exp(mul(sub(length(p()), lit(0.5)), lit(10))), lit(1))),
    colorScheme: 'electric',
  },
  {
    name: 'Bose-Einstein Condensate',
    category: 'quantum',
    description: 'Ground state occupation',
    buildExpr: () => div(lit(1), sub(exp(mul(pow(length(p()), lit(2)), lit(5))), lit(0.99))),
    colorScheme: 'quantum',
  },
  {
    name: 'Quantum Dot Energy',
    category: 'quantum',
    description: 'Confined electron levels',
    buildExpr: () => mul(sin(mul(x(p()), lit(6.28))), sin(mul(y(p()), lit(6.28)))),
    colorScheme: 'neon',
  },
  {
    name: 'WKB Approximation',
    category: 'quantum',
    description: 'Semiclassical wavefunction',
    buildExpr: () => mul(div(lit(1), sqrt(max(abs(sub(lit(0.5), pow(length(p()), lit(2)))), lit(0.01)))), sin(mul(length(p()), lit(10)))),
    colorScheme: 'quantum',
  },
  {
    name: 'Aharonov-Bohm Phase',
    category: 'quantum',
    description: 'Topological phase shift',
    buildExpr: () => cos(add(mul(atan2(y(p()), x(p())), lit(1)), mul(time(), lit(1)))),
    colorScheme: 'magnetic',
  },
];

// ============================================================================
// CATEGORY 6: SPECIAL RELATIVITY (10 equations)
// ============================================================================

export const relativityEquations: PhysicsEquation[] = [
  {
    name: 'Lorentz Contraction',
    category: 'relativity',
    description: 'L = L₀√(1 - v²/c²)',
    buildExpr: () => mul(x(p()), sqrt(max(sub(lit(1), pow(mul(sin(time()), lit(0.9)), lit(2))), lit(0.01)))),
    colorScheme: 'plasma',
  },
  {
    name: 'Time Dilation',
    category: 'relativity',
    description: 't = t₀/√(1 - v²/c²)',
    buildExpr: () => div(sin(mul(time(), lit(2))), sqrt(max(sub(lit(1), pow(length(p()), lit(2))), lit(0.01)))),
    colorScheme: 'plasma',
  },
  {
    name: 'Light Cone',
    category: 'relativity',
    description: 'x² - c²t² = 0 structure',
    buildExpr: () => abs(sub(pow(x(p()), lit(2)), pow(mul(time(), lit(0.3)), lit(2)))),
    colorScheme: 'neon',
  },
  {
    name: 'Relativistic Doppler',
    category: 'relativity',
    description: 'f\' = f√((1-β)/(1+β))',
    buildExpr: () => mul(sin(mul(x(p()), lit(20))), sqrt(div(sub(lit(1), mul(x(p()), lit(0.5))), add(lit(1), mul(x(p()), lit(0.5)))))),
    colorScheme: 'neon',
  },
  {
    name: 'Minkowski Metric',
    category: 'relativity',
    description: 'ds² = -c²dt² + dx² + dy²',
    buildExpr: () => sub(add(pow(x(p()), lit(2)), pow(y(p()), lit(2))), pow(mul(time(), lit(0.5)), lit(2))),
    colorScheme: 'plasma',
  },
  {
    name: 'Relativistic Energy',
    category: 'relativity',
    description: 'E = γmc² total energy',
    buildExpr: () => div(lit(1), sqrt(max(sub(lit(1), pow(length(p()), lit(2))), lit(0.01)))),
    colorScheme: 'fire',
  },
  {
    name: 'Relativistic Momentum',
    category: 'relativity',
    description: 'p = γmv momentum',
    buildExpr: () => mul(length(p()), div(lit(1), sqrt(max(sub(lit(1), pow(length(p()), lit(2))), lit(0.01))))),
    colorScheme: 'plasma',
  },
  {
    name: 'Worldline',
    category: 'relativity',
    description: 'Spacetime trajectory',
    buildExpr: () => exp(neg(pow(sub(x(p()), mul(time(), lit(0.3))), lit(2)))),
    colorScheme: 'neon',
  },
  {
    name: 'Simultaneity',
    category: 'relativity',
    description: 'Relative simultaneity',
    buildExpr: () => step(sub(x(p()), mul(time(), lit(0.5))), lit(0)),
    colorScheme: 'plasma',
  },
  {
    name: 'Proper Time',
    category: 'relativity',
    description: 'dτ² = dt²(1 - v²/c²)',
    buildExpr: () => mul(time(), sqrt(max(sub(lit(1), mul(pow(length(p()), lit(2)), lit(0.5))), lit(0.01)))),
    colorScheme: 'quantum',
  },
];

// ============================================================================
// CATEGORY 7: FLUID DYNAMICS (10 equations)
// ============================================================================

export const fluidEquations: PhysicsEquation[] = [
  {
    name: 'Laminar Flow',
    category: 'fluids',
    description: 'Parabolic velocity profile',
    buildExpr: () => sub(lit(1), pow(y(p()), lit(2))),
    colorScheme: 'ocean',
  },
  {
    name: 'Vortex Flow',
    category: 'fluids',
    description: 'v = Γ/(2πr) circulation',
    buildExpr: () => div(lit(1), max(length(p()), lit(0.05))),
    colorScheme: 'ocean',
  },
  {
    name: 'Turbulence Pattern',
    category: 'fluids',
    description: 'Kolmogorov cascade',
    buildExpr: () => add(add(sin(mul(x(p()), lit(5))), mul(lit(0.5), sin(mul(x(p()), lit(13))))), mul(lit(0.25), sin(mul(x(p()), lit(31))))),
    colorScheme: 'ocean',
  },
  {
    name: 'Bernoulli Pressure',
    category: 'fluids',
    description: 'P + ½ρv² = const',
    buildExpr: () => sub(lit(1), mul(lit(0.5), pow(div(lit(1), max(abs(y(p())), lit(0.1))), lit(2)))),
    colorScheme: 'ocean',
  },
  {
    name: 'Stokes Drag',
    category: 'fluids',
    description: 'F = 6πμrv viscous drag',
    buildExpr: () => mul(length(p()), exp(neg(mul(time(), lit(0.5))))),
    colorScheme: 'ocean',
  },
  {
    name: 'Kelvin-Helmholtz',
    category: 'fluids',
    description: 'Shear instability waves',
    buildExpr: () => mul(sin(mul(x(p()), lit(10))), tanh(mul(y(p()), lit(10)))),
    colorScheme: 'ocean',
  },
  {
    name: 'Rayleigh-Bénard',
    category: 'fluids',
    description: 'Convection cells',
    buildExpr: () => mul(cos(mul(x(p()), lit(6.28))), sin(mul(y(p()), lit(3.14)))),
    colorScheme: 'thermal',
  },
  {
    name: 'Couette Flow',
    category: 'fluids',
    description: 'Linear shear flow',
    buildExpr: () => y(p()),
    colorScheme: 'ocean',
  },
  {
    name: 'Poiseuille Flow',
    category: 'fluids',
    description: 'Pipe flow profile',
    buildExpr: () => mul(sub(lit(1), pow(length(p()), lit(2))), step(length(p()), lit(1))),
    colorScheme: 'ocean',
  },
  {
    name: 'Taylor-Couette',
    category: 'fluids',
    description: 'Rotating cylinder flow',
    buildExpr: () => add(div(lit(1), max(length(p()), lit(0.1))), mul(lit(0.3), sin(mul(atan2(y(p()), x(p())), lit(6))))),
    colorScheme: 'ocean',
  },
];

// ============================================================================
// CATEGORY 8: OPTICS (10 equations)
// ============================================================================

export const opticsEquations: PhysicsEquation[] = [
  {
    name: 'Fresnel Diffraction',
    category: 'optics',
    description: 'Near-field diffraction',
    buildExpr: () => pow(abs(add(cos(mul(pow(x(p()), lit(2)), lit(50))), sin(mul(pow(x(p()), lit(2)), lit(50))))), lit(2)),
    colorScheme: 'electric',
  },
  {
    name: 'Fraunhofer Diffraction',
    category: 'optics',
    description: 'Far-field pattern',
    buildExpr: () => pow(div(sin(mul(x(p()), lit(30))), max(mul(x(p()), lit(30)), lit(0.01))), lit(2)),
    colorScheme: 'quantum',
  },
  {
    name: 'Thin Film Interference',
    category: 'optics',
    description: 'Oil slick colors',
    buildExpr: () => add(add(pow(cos(mul(length(p()), lit(40))), lit(2)), mul(lit(0.5), pow(cos(mul(length(p()), lit(50))), lit(2)))), mul(lit(0.3), pow(cos(mul(length(p()), lit(60))), lit(2)))),
    colorScheme: 'neon',
  },
  {
    name: 'Newton\'s Rings',
    category: 'optics',
    description: 'Circular interference',
    buildExpr: () => pow(cos(mul(pow(length(p()), lit(2)), lit(100))), lit(2)),
    colorScheme: 'grayscale',
  },
  {
    name: 'Michelson Interferometer',
    category: 'optics',
    description: 'Path difference fringes',
    buildExpr: () => pow(cos(add(mul(x(p()), lit(30)), mul(y(p()), lit(0.5)))), lit(2)),
    colorScheme: 'electric',
  },
  {
    name: 'Gaussian Beam',
    category: 'optics',
    description: 'Laser beam profile',
    buildExpr: () => exp(neg(mul(pow(length(p()), lit(2)), div(lit(10), pow(add(lit(1), mul(pow(x(p()), lit(2)), lit(10))), lit(1)))))),
    colorScheme: 'neon',
  },
  {
    name: 'Snell Refraction',
    category: 'optics',
    description: 'n₁sinθ₁ = n₂sinθ₂',
    buildExpr: () => ternary(gt(y(p()), lit(0)),
      sin(mul(x(p()), lit(10))),
      sin(mul(x(p()), lit(15)))
    ),
    colorScheme: 'ocean',
  },
  {
    name: 'Total Internal Reflection',
    category: 'optics',
    description: 'Critical angle boundary',
    buildExpr: () => mul(step(y(p()), lit(0)), mul(step(abs(atan2(y(p()), x(p()))), lit(0.73)), lit(1))),
    colorScheme: 'electric',
  },
  {
    name: 'Brewster Angle',
    category: 'optics',
    description: 'Polarization at interface',
    buildExpr: () => mul(pow(cos(sub(atan2(y(p()), x(p())), lit(0.98))), lit(2)), step(y(p()), lit(0))),
    colorScheme: 'plasma',
  },
  {
    name: 'Holographic Pattern',
    category: 'optics',
    description: 'Reference + object beam',
    buildExpr: () => pow(abs(add(sin(mul(x(p()), lit(50))), sin(mul(length(p()), lit(30))))), lit(2)),
    colorScheme: 'grayscale',
  },
];

// ============================================================================
// CATEGORY 9: GRAVITY & ORBITS (10 equations)
// ============================================================================

export const gravityEquations: PhysicsEquation[] = [
  {
    name: 'Gravitational Potential',
    category: 'gravity',
    description: 'φ = -GM/r potential well',
    buildExpr: () => neg(div(lit(1), max(length(p()), lit(0.05)))),
    colorScheme: 'plasma',
  },
  {
    name: 'Kepler Ellipse',
    category: 'gravity',
    description: 'Orbital path r = a(1-e²)/(1+e·cosθ)',
    buildExpr: () => abs(sub(length(p()), div(lit(0.3), add(lit(1), mul(lit(0.5), cos(atan2(y(p()), x(p())))))))),
    colorScheme: 'neon',
  },
  {
    name: 'Tidal Force',
    category: 'gravity',
    description: 'Differential gravity',
    buildExpr: () => mul(sub(div(lit(1), pow(max(sub(length(p()), lit(0.1)), lit(0.01)), lit(2))),
                         div(lit(1), pow(max(add(length(p()), lit(0.1)), lit(0.01)), lit(2)))), lit(0.1)),
    colorScheme: 'ocean',
  },
  {
    name: 'Roche Limit',
    category: 'gravity',
    description: 'Tidal disruption boundary',
    buildExpr: () => mul(step(length(p()), lit(0.4)), div(lit(1), max(pow(length(p()), lit(3)), lit(0.001)))),
    colorScheme: 'fire',
  },
  {
    name: 'Lagrange Points',
    category: 'gravity',
    description: 'Gravitational equilibrium',
    buildExpr: () => add(
      div(lit(1), max(length(sub(p(), vec2(lit(0.5), lit(0)))), lit(0.05))),
      mul(lit(0.3), div(lit(1), max(length(add(p(), vec2(lit(0.5), lit(0)))), lit(0.05))))
    ),
    colorScheme: 'plasma',
  },
  {
    name: 'Escape Velocity',
    category: 'gravity',
    description: 'v_e = √(2GM/r)',
    buildExpr: () => sqrt(div(lit(2), max(length(p()), lit(0.05)))),
    colorScheme: 'fire',
  },
  {
    name: 'Orbital Velocity',
    category: 'gravity',
    description: 'v = √(GM/r)',
    buildExpr: () => sqrt(div(lit(1), max(length(p()), lit(0.05)))),
    colorScheme: 'neon',
  },
  {
    name: 'Gravitational Lens',
    category: 'gravity',
    description: 'Light bending around mass',
    buildExpr: () => sin(mul(add(x(p()), div(lit(0.1), max(length(p()), lit(0.05)))), lit(20))),
    colorScheme: 'quantum',
  },
  {
    name: 'Schwarzschild Radius',
    category: 'gravity',
    description: 'Event horizon r_s = 2GM/c²',
    buildExpr: () => mul(step(lit(0.2), length(p())), sub(lit(1), div(lit(0.2), max(length(p()), lit(0.01))))),
    colorScheme: 'plasma',
  },
  {
    name: 'Gravitational Waves',
    category: 'gravity',
    description: 'Ripples in spacetime',
    buildExpr: () => mul(sin(sub(mul(length(p()), lit(20)), mul(time(), lit(5)))), mul(cos(mul(atan2(y(p()), x(p())), lit(2))), exp(neg(mul(length(p()), lit(0.5)))))),
    colorScheme: 'plasma',
  },
];

// ============================================================================
// CATEGORY 10: ADVANCED OSCILLATIONS & CHAOS (10 equations)
// ============================================================================

export const chaosEquations: PhysicsEquation[] = [
  {
    name: 'Double Pendulum',
    category: 'chaos',
    description: 'Chaotic motion phase space',
    buildExpr: () => sin(add(mul(sin(mul(x(p()), lit(3))), lit(2)), mul(cos(mul(y(p()), lit(5))), mul(time(), lit(0.5))))),
    colorScheme: 'plasma',
  },
  {
    name: 'Lorenz Attractor XY',
    category: 'chaos',
    description: 'Strange attractor projection',
    buildExpr: () => sin(mul(add(mul(x(p()), lit(10)), mul(y(p()), lit(28))), add(lit(1), mul(sin(time()), lit(0.1))))),
    colorScheme: 'fire',
  },
  {
    name: 'Duffing Oscillator',
    category: 'chaos',
    description: 'Nonlinear driven oscillator',
    buildExpr: () => add(pow(x(p()), lit(3)), mul(sin(mul(time(), lit(3))), x(p()))),
    colorScheme: 'neon',
  },
  {
    name: 'Van der Pol',
    category: 'chaos',
    description: 'Self-sustained oscillation',
    buildExpr: () => sub(y(p()), mul(sub(pow(x(p()), lit(2)), lit(1)), mul(x(p()), lit(0.5)))),
    colorScheme: 'electric',
  },
  {
    name: 'Coupled Oscillators',
    category: 'chaos',
    description: 'Mode coupling pattern',
    buildExpr: () => add(sin(mul(x(p()), lit(8))), mul(sin(mul(y(p()), lit(8))), cos(mul(time(), lit(2))))),
    colorScheme: 'quantum',
  },
  {
    name: 'Parametric Resonance',
    category: 'chaos',
    description: 'Time-varying parameter',
    buildExpr: () => mul(sin(mul(x(p()), mul(lit(10), add(lit(1), mul(sin(mul(time(), lit(2))), lit(0.3)))))), cos(mul(time(), lit(3)))),
    colorScheme: 'neon',
  },
  {
    name: 'Mathieu Equation',
    category: 'chaos',
    description: 'Stability boundaries',
    buildExpr: () => mul(cos(mul(x(p()), lit(5))), add(lit(1), mul(cos(mul(time(), lit(4))), y(p())))),
    colorScheme: 'plasma',
  },
  {
    name: 'Limit Cycle',
    category: 'chaos',
    description: 'Stable periodic orbit',
    buildExpr: () => abs(sub(length(p()), lit(0.5))),
    colorScheme: 'neon',
  },
  {
    name: 'Bifurcation Diagram',
    category: 'chaos',
    description: 'Period doubling cascade',
    buildExpr: () => fract(mul(pow(mul(x(p()), lit(4)), lit(2)), add(lit(1), y(p())))),
    colorScheme: 'fire',
  },
  {
    name: 'Henon Map',
    category: 'chaos',
    description: 'Discrete chaotic system',
    buildExpr: () => sub(add(lit(1), mul(lit(0.3), y(p()))), mul(lit(1.4), pow(x(p()), lit(2)))),
    colorScheme: 'plasma',
  },
];

// ============================================================================
// COMBINED EXPORT - ALL PHYSICS EQUATIONS
// ============================================================================

export const physicsEquations: PhysicsEquation[] = [
  ...mechanicsEquations,
  ...waveEquations,
  ...emEquations,
  ...thermoEquations,
  ...quantumEquations,
  ...relativityEquations,
  ...fluidEquations,
  ...opticsEquations,
  ...gravityEquations,
  ...chaosEquations,
];

// ============================================================================
// PHYSICS SHADER GENERATOR - Infinite Variation through AST Mutation
// ============================================================================

// Extended color schemes for more variety
const colorSchemes: Record<string, string> = {
  thermal: `mix(vec3<f32>(0.0, 0.0, 0.5), mix(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 0.0), clamp(v * 2.0 - 1.0, 0.0, 1.0)), clamp(v * 2.0, 0.0, 1.0))`,
  electric: `vec3<f32>(0.3 + v * 0.7, 0.5 + v * 0.5, 1.0)`,
  plasma: `vec3<f32>(v, v * 0.3, 1.0 - v * 0.5)`,
  fire: `vec3<f32>(min(v * 2.0, 1.0), v * v, v * v * v)`,
  quantum: `vec3<f32>(0.5 + 0.5 * cos(v * 6.28), 0.5 + 0.5 * cos(v * 6.28 + 2.09), 0.5 + 0.5 * cos(v * 6.28 + 4.18))`,
  magnetic: `vec3<f32>(0.2, 0.4 + v * 0.6, 0.8 + v * 0.2)`,
  ocean: `vec3<f32>(0.0, 0.3 + v * 0.4, 0.5 + v * 0.5)`,
  neon: `vec3<f32>(v, 1.0 - v, 0.5 + 0.5 * sin(v * 6.28))`,
  grayscale: `vec3<f32>(v)`,
  heatmap: `vec3<f32>(clamp(v * 3.0, 0.0, 1.0), clamp(v * 3.0 - 1.0, 0.0, 1.0), clamp(v * 3.0 - 2.0, 0.0, 1.0))`,
  aurora: `vec3<f32>(0.1 + v * 0.2, 0.8 - v * 0.3, 0.3 + v * 0.5)`,
  sunset: `vec3<f32>(1.0 - v * 0.3, 0.3 + v * 0.3, 0.5 * v)`,
  cosmic: `vec3<f32>(0.1 + v * 0.5, 0.0, 0.3 + v * 0.7)`,
  forest: `vec3<f32>(0.1, 0.3 + v * 0.6, 0.1)`,
  lava: `vec3<f32>(1.0, v * 0.5, 0.0) * (0.5 + v * 0.5)`,
  ice: `vec3<f32>(0.7 + v * 0.3, 0.9, 1.0)`,
  acid: `vec3<f32>(0.2 * v, 1.0 - v * 0.3, 0.1)`,
  retro: `vec3<f32>(1.0, 0.4 * v, 0.7 - v * 0.5)`,
  matrix: `vec3<f32>(0.0, v * 0.8 + 0.2, 0.0)`,
  blood: `vec3<f32>(0.5 + v * 0.5, 0.0, 0.05)`,
};

const allColorSchemes = Object.keys(colorSchemes);

/**
 * Generate infinite variety physics shaders using TRUE PROCEDURAL AST generation
 * NO PRESET EQUATIONS - All expressions built from atomic operations
 */
export function generatePhysicsShaderCode(mutationIntensity: number = 0.5): string {
  // PURELY PROCEDURAL - no preset equations
  const complexity = RI(4, 8);

  // Generate expression from atomic building blocks
  let exprAST: PhysicsExprNode = generateTrueProceduralPhysicsExpr(complexity);

  // Optionally apply mutations for more variation
  if (Math.random() > 0.3) {
    exprAST = mutateAST(exprAST, mutationIntensity);
  }

  // Optionally combine with another procedural expression
  if (Math.random() > 0.5) {
    const expr2 = generateTrueProceduralPhysicsExpr(complexity - 1);
    exprAST = combineAST(exprAST, expr2);
  }

  const uid = Math.floor(Math.random() * 1000000);
  const eqName = `Procedural #${uid}`;
  const eqDesc = 'True procedural generation - no presets';
  const colorScheme = pick(allColorSchemes);

  const exprWGSL = astToWGSL(exprAST);
  const colorExpr = colorSchemes[colorScheme] || colorSchemes.plasma;

  // Random visual enhancements
  const useSymmetry = Math.random() > 0.7;
  const useGlow = Math.random() > 0.6;
  const useVignette = Math.random() > 0.5;
  const useWarp = Math.random() > 0.7;

  let symmetryCode = '';
  if (useSymmetry) {
    const symType = RI(0, 3);
    const modVal = RF(0.5, 2).toFixed(3);
    const divVal = RI(2, 8);
    switch (symType) {
      case 0: symmetryCode = '  let p = abs(p_raw);'; break;
      case 1: symmetryCode = '  let p = vec2<f32>(abs(p_raw.x), p_raw.y);'; break;
      case 2: symmetryCode = '  let p = vec2<f32>(p_raw.x, abs(p_raw.y));'; break;
      default:
        // Use ((a) % (b)) instead of mod(a, b) for WGSL
        symmetryCode = `  let angle = atan2(p_raw.y, p_raw.x);\n  let r = length(p_raw);\n  let p = vec2<f32>(r * cos(((angle + 3.14159) % ${modVal}) - 3.14159/${divVal}.0), r * sin(((angle + 3.14159) % ${modVal}) - 3.14159/${divVal}.0));`;
    }
  }

  let warpCode = '';
  if (useWarp) {
    const warpAmt = RF(0.05, 0.3).toFixed(3);
    warpCode = `  let warp = vec2<f32>(sin(p.y * ${RF(3, 10).toFixed(1)} + time), cos(p.x * ${RF(3, 10).toFixed(1)} + time * 0.7)) * ${warpAmt};\n  let p_warped = p + warp;\n`;
  }

  let glowCode = '';
  if (useGlow) {
    glowCode = `  col = col + col * col * ${RF(0.2, 0.5).toFixed(2)}; // Bloom`;
  }

  let vignetteCode = '';
  if (useVignette) {
    vignetteCode = `  col = col * (1.0 - length(p_raw) * ${RF(0.2, 0.5).toFixed(2)}); // Vignette`;
  }

  // Import and use AST-based cursor effect (dynamic, not preset)
  // This is imported at top of file
  const cursorEffect = generateCursorEffectForPhysics();

  const pVar = useWarp ? 'p_warped' : 'p';
  const exprWithP = exprWGSL.replace(/\bp\b/g, pVar);

  // Generate shader with all enhancements
  const shader = `// Physics: ${eqName}
// ${eqDesc}
// Color scheme: ${colorScheme}

@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;
@group(0) @binding(2) var<uniform> mouse : vec2<f32>;
@group(0) @binding(3) var<uniform> scroll : vec2<f32>;

fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), u.x),
               mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

fn fbm(p: vec2<f32>) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var pos = p;
    for (var i = 0; i < 5; i++) {
        v += a * noise(pos);
        pos = pos * 2.0;
        a *= 0.5;
    }
    return v;
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / resolution;
    let p_raw = (uv - 0.5) * 2.0;
${useSymmetry ? symmetryCode : '  let p = p_raw;'}
${warpCode}
    // Generated expression
    let raw = ${exprWithP};
    let v = clamp(fract(raw * 0.5 + 0.5), 0.0, 1.0);

    // Color: ${colorScheme}
    var col = ${colorExpr};

    // AST-Generated Cursor Effect
${cursorEffect}

${glowCode}
${vignetteCode}

    col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(col, 1.0);
}`;

  // CRITICAL: Validate and fix WGSL type errors before returning
  const { fixedCode, fixes } = validateAndFixShader(shader);
  if (fixes.length > 0) {
    console.log(`[Physics Generator] Applied type fixes:`, fixes);
  }
  return fixedCode;
}
