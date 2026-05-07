// =============================================================================
// SHARED AST TYPES AND UTILITIES
// =============================================================================
// Shared between physicsEquations and cursorEffectAST to avoid circular imports
// =============================================================================

// ============================================================================
// AST Node Types for Physics Expressions
// ============================================================================

export type PhysicsExprNode =
  | { type: 'var'; name: string }
  | { type: 'component'; expr: PhysicsExprNode; comp: 'x' | 'y' }
  | { type: 'literal'; value: number }
  | { type: 'binary'; op: '+' | '-' | '*' | '/' | '%'; left: PhysicsExprNode; right: PhysicsExprNode }
  | { type: 'call'; fn: string; args: PhysicsExprNode[] }
  | { type: 'vec2'; x: PhysicsExprNode; y: PhysicsExprNode }
  | { type: 'vec3'; x: PhysicsExprNode; y: PhysicsExprNode; z: PhysicsExprNode }
  | { type: 'vec4'; x: PhysicsExprNode; y: PhysicsExprNode; z: PhysicsExprNode; w: PhysicsExprNode }
  | { type: 'ternary'; cond: PhysicsExprNode; then: PhysicsExprNode; else: PhysicsExprNode }
  | { type: 'unary'; op: '-' | '!'; expr: PhysicsExprNode }
  | { type: 'compare'; op: '<' | '>' | '<=' | '>=' | '==' | '!='; left: PhysicsExprNode; right: PhysicsExprNode };

// ============================================================================
// AST Builder Helpers
// ============================================================================

export const AST = {
  // Variables
  p: (): PhysicsExprNode => ({ type: 'var', name: 'p' }),
  time: (): PhysicsExprNode => ({ type: 'var', name: 'time' }),
  mouse: (): PhysicsExprNode => ({ type: 'var', name: 'mouse' }),
  resolution: (): PhysicsExprNode => ({ type: 'var', name: 'resolution' }),
  uv: (): PhysicsExprNode => ({ type: 'var', name: 'uv' }),

  // Components
  x: (expr: PhysicsExprNode): PhysicsExprNode => ({ type: 'component', expr, comp: 'x' }),
  y: (expr: PhysicsExprNode): PhysicsExprNode => ({ type: 'component', expr, comp: 'y' }),

  // Literal
  lit: (value: number): PhysicsExprNode => ({ type: 'literal', value }),

  // Binary operations
  add: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'binary', op: '+', left, right }),
  sub: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'binary', op: '-', left, right }),
  mul: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'binary', op: '*', left, right }),
  div: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'binary', op: '/', left, right }),
  mod: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'binary', op: '%', left, right }),

  // Function calls
  call: (fn: string, ...args: PhysicsExprNode[]): PhysicsExprNode => ({ type: 'call', fn, args }),

  // Common math functions
  sin: (x: PhysicsExprNode): PhysicsExprNode => AST.call('sin', x),
  cos: (x: PhysicsExprNode): PhysicsExprNode => AST.call('cos', x),
  tan: (x: PhysicsExprNode): PhysicsExprNode => AST.call('tan', x),
  abs: (x: PhysicsExprNode): PhysicsExprNode => AST.call('abs', x),
  sqrt: (x: PhysicsExprNode): PhysicsExprNode => AST.call('sqrt', x),
  pow: (x: PhysicsExprNode, y: PhysicsExprNode): PhysicsExprNode => AST.call('pow', x, y),
  exp: (x: PhysicsExprNode): PhysicsExprNode => AST.call('exp', x),
  log: (x: PhysicsExprNode): PhysicsExprNode => AST.call('log', x),
  floor: (x: PhysicsExprNode): PhysicsExprNode => AST.call('floor', x),
  ceil: (x: PhysicsExprNode): PhysicsExprNode => AST.call('ceil', x),
  fract: (x: PhysicsExprNode): PhysicsExprNode => AST.call('fract', x),
  min: (x: PhysicsExprNode, y: PhysicsExprNode): PhysicsExprNode => AST.call('min', x, y),
  max: (x: PhysicsExprNode, y: PhysicsExprNode): PhysicsExprNode => AST.call('max', x, y),
  clamp: (x: PhysicsExprNode, lo: PhysicsExprNode, hi: PhysicsExprNode): PhysicsExprNode => AST.call('clamp', x, lo, hi),
  mix: (a: PhysicsExprNode, b: PhysicsExprNode, t: PhysicsExprNode): PhysicsExprNode => AST.call('mix', a, b, t),
  step: (edge: PhysicsExprNode, x: PhysicsExprNode): PhysicsExprNode => AST.call('step', edge, x),
  smoothstep: (e0: PhysicsExprNode, e1: PhysicsExprNode, x: PhysicsExprNode): PhysicsExprNode => AST.call('smoothstep', e0, e1, x),
  length: (x: PhysicsExprNode): PhysicsExprNode => AST.call('length', x),
  distance: (a: PhysicsExprNode, b: PhysicsExprNode): PhysicsExprNode => AST.call('distance', a, b),
  dot: (a: PhysicsExprNode, b: PhysicsExprNode): PhysicsExprNode => AST.call('dot', a, b),
  normalize: (x: PhysicsExprNode): PhysicsExprNode => AST.call('normalize', x),
  atan2: (y: PhysicsExprNode, x: PhysicsExprNode): PhysicsExprNode => AST.call('atan2', y, x),
  asin: (x: PhysicsExprNode): PhysicsExprNode => AST.call('asin', x),
  acos: (x: PhysicsExprNode): PhysicsExprNode => AST.call('acos', x),
  sinh: (x: PhysicsExprNode): PhysicsExprNode => AST.call('sinh', x),
  cosh: (x: PhysicsExprNode): PhysicsExprNode => AST.call('cosh', x),
  tanh: (x: PhysicsExprNode): PhysicsExprNode => AST.call('tanh', x),
  sign: (x: PhysicsExprNode): PhysicsExprNode => AST.call('sign', x),

  // Vector constructors
  vec2: (x: PhysicsExprNode, y: PhysicsExprNode): PhysicsExprNode => ({ type: 'vec2', x, y }),
  vec3: (x: PhysicsExprNode, y: PhysicsExprNode, z: PhysicsExprNode): PhysicsExprNode => ({ type: 'vec3', x, y, z }),
  vec4: (x: PhysicsExprNode, y: PhysicsExprNode, z: PhysicsExprNode, w: PhysicsExprNode): PhysicsExprNode => ({ type: 'vec4', x, y, z, w }),

  // Comparison
  lt: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'compare', op: '<', left, right }),
  gt: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'compare', op: '>', left, right }),
  lte: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'compare', op: '<=', left, right }),
  gte: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'compare', op: '>=', left, right }),
  eq: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'compare', op: '==', left, right }),
  neq: (left: PhysicsExprNode, right: PhysicsExprNode): PhysicsExprNode => ({ type: 'compare', op: '!=', left, right }),

  // Ternary
  ternary: (cond: PhysicsExprNode, then: PhysicsExprNode, els: PhysicsExprNode): PhysicsExprNode =>
    ({ type: 'ternary', cond, then, else: els }),

  // Unary
  neg: (expr: PhysicsExprNode): PhysicsExprNode => ({ type: 'unary', op: '-', expr }),
  not: (expr: PhysicsExprNode): PhysicsExprNode => ({ type: 'unary', op: '!', expr }),
};

// ============================================================================
// AST to WGSL Code Generation
// ============================================================================

// Helper to ensure scalar output from potentially vector expression
function ensureScalar(code: string, node: PhysicsExprNode): string {
  // If it's a vec2 access like p, mouse, etc., take .x component to get scalar
  if (node.type === 'var' && ['p', 'mouse', 'uv', 'resolution'].includes(node.name)) {
    return `${code}.x`;
  }
  // If it's a vec2 constructor, take x component
  if (node.type === 'vec2') {
    return `(${code}).x`;
  }
  return code;
}

// Check if node returns a vector type
function isVectorType(node: PhysicsExprNode): boolean {
  if (node.type === 'var' && ['p', 'mouse', 'uv', 'resolution'].includes(node.name)) return true;
  if (node.type === 'vec2' || node.type === 'vec3' || node.type === 'vec4') return true;
  // Some functions return vectors
  if (node.type === 'call') {
    const vecFns = ['normalize', 'reflect', 'refract'];
    if (vecFns.includes(node.fn)) return true;
  }
  return false;
}

export function astToWGSL(node: PhysicsExprNode): string {
  switch (node.type) {
    case 'var':
      return node.name;
    case 'component':
      return `${astToWGSL(node.expr)}.${node.comp}`;
    case 'literal':
      return Number.isInteger(node.value) ? `${node.value}.0` : node.value.toString();
    case 'binary': {
      const left = astToWGSL(node.left);
      const right = astToWGSL(node.right);
      // Modulo operator (%) has issues in WGSL with type mismatches
      // Use: (a - b * floor(a / b)) which works for all types
      if (node.op === '%') {
        return `(${left} - ${right} * floor(${left} / ${right}))`;
      }
      return `(${left} ${node.op} ${right})`;
    }
    case 'call': {
      const args = node.args.map(astToWGSL);
      const fn = node.fn;

      // Special handling for type-sensitive functions
      if (fn === 'mix' && node.args.length === 3) {
        // mix requires all same type - if first two differ, use scalar versions
        const a = node.args[0], b = node.args[1], t = node.args[2];
        const aIsVec = isVectorType(a);
        const bIsVec = isVectorType(b);
        if (aIsVec !== bIsVec) {
          // Type mismatch - convert both to scalar
          return `mix(${ensureScalar(args[0], a)}, ${ensureScalar(args[1], b)}, ${args[2]})`;
        }
      }

      if (fn === 'clamp' && node.args.length === 3) {
        // clamp requires matching types
        const x = node.args[0];
        const xIsVec = isVectorType(x);
        if (xIsVec) {
          // If x is vector, lo/hi must also be vectors
          return `clamp(${args[0]}, vec2<f32>(${args[1]}), vec2<f32>(${args[2]}))`;
        }
      }

      // log needs protection against <= 0 values
      if (fn === 'log' && node.args.length === 1) {
        return `log(abs(${args[0]}) + 0.0001)`;
      }
      if (fn === 'log2' && node.args.length === 1) {
        return `log2(abs(${args[0]}) + 0.0001)`;
      }

      // sqrt needs protection against negative values
      if (fn === 'sqrt' && node.args.length === 1) {
        return `sqrt(abs(${args[0]}))`;
      }

      // pow needs abs on base for non-integer exponents
      if (fn === 'pow' && node.args.length === 2) {
        return `pow(abs(${args[0]}), ${args[1]})`;
      }

      return `${fn}(${args.join(', ')})`;
    }
    case 'vec2':
      return `vec2<f32>(${astToWGSL(node.x)}, ${astToWGSL(node.y)})`;
    case 'vec3':
      return `vec3<f32>(${astToWGSL(node.x)}, ${astToWGSL(node.y)}, ${astToWGSL(node.z)})`;
    case 'vec4':
      return `vec4<f32>(${astToWGSL(node.x)}, ${astToWGSL(node.y)}, ${astToWGSL(node.z)}, ${astToWGSL(node.w)})`;
    case 'ternary':
      return `select(${astToWGSL(node.else)}, ${astToWGSL(node.then)}, ${astToWGSL(node.cond)})`;
    case 'unary':
      return `(${node.op}${astToWGSL(node.expr)})`;
    case 'compare':
      return `(${astToWGSL(node.left)} ${node.op} ${astToWGSL(node.right)})`;
    default:
      return '0.0';
  }
}
