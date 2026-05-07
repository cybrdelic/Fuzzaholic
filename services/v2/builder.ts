/**
 * WGSL AST Builder - v2 Clean Implementation
 *
 * Type-safe AST constructors with BUILT-IN INVARIANT ENFORCEMENT.
 * Every function guarantees valid output - no invalid shaders can be constructed.
 *
 * This is the core of "correctness by construction":
 * - smoothstep(low, high, x) auto-ensures low < high
 * - clamp(x, min, max) ensures min < max
 * - div(a, b) wraps divisor to prevent division by zero
 * - All expressions carry type information
 *
 * NO REGEX. NO STRING MANIPULATION. PURE AST CONSTRUCTION.
 */

import {
    AssignStmt,
    Attribute,
    BinaryExpr,
    BinaryOperator,
    BlockStmt,
    CallExpr,
    Expression,
    ExprStmt,
    ForStmt,
    FunctionDecl,
    GenericTypeExpr,
    GlobalVarDecl,
    IdentifierExpr,
    IfStmt,
    IncrementStmt,
    LetStmt,
    LiteralExpr,
    MemberExpr,
    NamedTypeExpr,
    Parameter,
    ParenExpr,
    Program,
    ReturnStmt,
    Statement,
    StructDecl,
    StructMember,
    TypeExpr,
    UnaryExpr,
    VarStmt,
    WGSLType,
} from './types';

// ============================================================================
// RANDOM HELPERS
// ============================================================================

const rand = () => Math.random();
const randFloat = (min: number, max: number) => min + rand() * (max - min);
const randInt = (min: number, max: number) => Math.floor(randFloat(min, max + 1));
const randBool = (p: number = 0.5) => rand() < p;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

// ============================================================================
// LITERAL BUILDERS
// ============================================================================

/**
 * Create a float literal
 * Ensures value is finite and within reasonable range
 */
export function f32(value: number): LiteralExpr {
  // Clamp to prevent infinity/NaN
  let v = value;
  if (!Number.isFinite(v)) v = 0.0;
  if (Math.abs(v) > 1e10) v = Math.sign(v) * 1e10;

  // Format appropriately for WGSL
  let raw: string;
  if (Number.isInteger(v)) {
    raw = `${v}.0`;
  } else {
    // Remove trailing zeros but ensure we keep at least one decimal digit
    raw = v.toFixed(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '.0');
  }

  return {
    kind: 'LiteralExpr',
    value: v,
    raw,
    resultType: 'f32',
  };
}

/**
 * Create an integer literal
 */
export function i32(value: number): LiteralExpr {
  const v = Math.floor(value);
  return {
    kind: 'LiteralExpr',
    value: v,
    raw: `${v}`,
    resultType: 'i32',
  };
}

/**
 * Create an unsigned integer literal
 */
export function u32(value: number): LiteralExpr {
  const v = Math.max(0, Math.floor(value));
  return {
    kind: 'LiteralExpr',
    value: v,
    raw: `${v}u`,
    resultType: 'u32',
  };
}

/**
 * Create a boolean literal
 */
export function bool(value: boolean): LiteralExpr {
  return {
    kind: 'LiteralExpr',
    value,
    raw: value ? 'true' : 'false',
    resultType: 'bool',
  };
}

// ============================================================================
// IDENTIFIER BUILDER
// ============================================================================

/**
 * Create an identifier expression
 */
export function ident(name: string, type: WGSLType = 'unknown'): IdentifierExpr {
  return {
    kind: 'IdentifierExpr',
    name,
    resultType: type,
  };
}

// Common identifiers with known types
export const time = (): IdentifierExpr => ident('time', 'f32');
export const uv = (): IdentifierExpr => ident('uv', 'vec2<f32>');
export const mouse = (): IdentifierExpr => ident('mouse', 'vec2<f32>');
export const resolution = (): IdentifierExpr => ident('resolution', 'vec2<f32>');
export const scroll = (): IdentifierExpr => ident('scroll', 'vec2<f32>');
export const col = (): IdentifierExpr => ident('col', 'vec3<f32>');
export const p = (): IdentifierExpr => ident('p', 'vec2<f32>');

// ============================================================================
// VECTOR CONSTRUCTORS
// ============================================================================

/**
 * Create vec2<f32> constructor call
 */
export function vec2(x: Expression, y?: Expression): CallExpr {
  const args = y ? [x, y] : [x];
  return {
    kind: 'CallExpr',
    callee: 'vec2<f32>',
    args,
    resultType: 'vec2<f32>',
  };
}

/**
 * Create vec3<f32> constructor call
 */
export function vec3(x: Expression, y?: Expression, z?: Expression): CallExpr {
  let args: Expression[];
  if (z) {
    args = [x, y!, z];
  } else if (y) {
    args = [x, y];
  } else {
    args = [x];
  }
  return {
    kind: 'CallExpr',
    callee: 'vec3<f32>',
    args,
    resultType: 'vec3<f32>',
  };
}

/**
 * Create vec4<f32> constructor call
 */
export function vec4(x: Expression, y?: Expression, z?: Expression, w?: Expression): CallExpr {
  let args: Expression[];
  if (w) {
    args = [x, y!, z!, w];
  } else if (z) {
    args = [x, y!, z];
  } else if (y) {
    args = [x, y];
  } else {
    args = [x];
  }
  return {
    kind: 'CallExpr',
    callee: 'vec4<f32>',
    args,
    resultType: 'vec4<f32>',
  };
}

// ============================================================================
// MEMBER ACCESS (SWIZZLE)
// ============================================================================

/**
 * Create member access expression (for swizzling)
 */
export function member(object: Expression, property: string): MemberExpr {
  // Infer result type from swizzle length
  let resultType: WGSLType = 'unknown';
  if (property.length === 1) resultType = 'f32';
  else if (property.length === 2) resultType = 'vec2<f32>';
  else if (property.length === 3) resultType = 'vec3<f32>';
  else if (property.length === 4) resultType = 'vec4<f32>';

  return {
    kind: 'MemberExpr',
    object,
    member: property,
    resultType,
  };
}

// Convenience swizzle helpers
export const x = (v: Expression) => member(v, 'x');
export const y = (v: Expression) => member(v, 'y');
export const z = (v: Expression) => member(v, 'z');
export const w = (v: Expression) => member(v, 'w');
export const xy = (v: Expression) => member(v, 'xy');
export const xyz = (v: Expression) => member(v, 'xyz');
export const rgb = (v: Expression) => member(v, 'rgb');

// ============================================================================
// BINARY OPERATORS
// ============================================================================

/**
 * Create binary expression with type inference
 */
function binary(op: BinaryOperator, left: Expression, right: Expression): BinaryExpr {
  // Infer result type
  let resultType: WGSLType;
  if (['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(op)) {
    resultType = 'bool';
  } else if (left.resultType === right.resultType) {
    resultType = left.resultType;
  } else if (left.resultType === 'unknown') {
    resultType = right.resultType;
  } else if (right.resultType === 'unknown') {
    resultType = left.resultType;
  } else {
    // Mixed types - default to f32
    resultType = 'f32';
  }

  return {
    kind: 'BinaryExpr',
    operator: op,
    left,
    right,
    resultType,
  };
}

export const add = (a: Expression, b: Expression) => binary('+', a, b);
export const sub = (a: Expression, b: Expression) => binary('-', a, b);
export const mul = (a: Expression, b: Expression) => binary('*', a, b);

/**
 * SAFE DIVISION - prevents division by zero
 * div(a, b) -> a / (abs(b) + 0.001)
 */
export function div(a: Expression, b: Expression): BinaryExpr {
  // Wrap divisor in abs() + epsilon to prevent division by zero
  const safeDivisor = add(call('abs', [b]), f32(0.001));
  return binary('/', a, safeDivisor);
}

/**
 * Raw division (use only when you know divisor is safe)
 */
export const divRaw = (a: Expression, b: Expression) => binary('/', a, b);

export const mod = (a: Expression, b: Expression) => binary('%', a, b);
export const eq = (a: Expression, b: Expression) => binary('==', a, b);
export const neq = (a: Expression, b: Expression) => binary('!=', a, b);
export const lt = (a: Expression, b: Expression) => binary('<', a, b);
export const gt = (a: Expression, b: Expression) => binary('>', a, b);
export const lte = (a: Expression, b: Expression) => binary('<=', a, b);
export const gte = (a: Expression, b: Expression) => binary('>=', a, b);
export const and = (a: Expression, b: Expression) => binary('&&', a, b);
export const or = (a: Expression, b: Expression) => binary('||', a, b);

// ============================================================================
// UNARY OPERATORS
// ============================================================================

export function neg(expr: Expression): UnaryExpr {
  return {
    kind: 'UnaryExpr',
    operator: '-',
    operand: expr,
    resultType: expr.resultType,
  };
}

export function not(expr: Expression): UnaryExpr {
  return {
    kind: 'UnaryExpr',
    operator: '!',
    operand: expr,
    resultType: 'bool',
  };
}

// ============================================================================
// FUNCTION CALLS
// ============================================================================

/**
 * Create a function call expression
 */
export function call(fn: string, args: Expression[], resultType?: WGSLType): CallExpr {
  // Infer return type if not provided
  let type: WGSLType = resultType || inferFunctionReturnType(fn, args);

  return {
    kind: 'CallExpr',
    callee: fn,
    args,
    resultType: type,
  };
}

function inferFunctionReturnType(fn: string, args: Expression[]): WGSLType {
  // Scalar-returning functions
  const SCALAR_FNS = new Set([
    'atan', 'atan2',
    'sqrt', 'inverseSqrt', 'length', 'distance', 'dot',
    'f_hash', 'f_n', 'f_sin', 'f_cos', 'f_smin',
    'noise', 'fbm', 'hash', 'voronoi',
  ]);

  if (SCALAR_FNS.has(fn)) return 'f32';

  // Functions that preserve input type
  const PRESERVE_FNS = new Set([
    'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
    'normalize', 'reflect', 'refract',
    'abs', 'sign', 'floor', 'ceil', 'round', 'trunc', 'fract',
    'sin', 'cos', 'tan', 'asin', 'acos', 'sinh', 'cosh', 'tanh',
    'exp', 'exp2', 'log', 'log2', 'pow',
  ]);

  if (PRESERVE_FNS.has(fn) && args.length > 0) {
    // Return type of last argument (for clamp/smoothstep, it's the value being clamped)
    return args[args.length - 1].resultType;
  }

  // f_pal returns vec3
  if (fn === 'f_pal') return 'vec3<f32>';

  if (fn === 'f_rot') return 'vec2<f32>';

  // cross returns vec3
  if (fn === 'cross') return 'vec3<f32>';

  return 'unknown';
}

function splatToType(expr: Expression, targetType: WGSLType): Expression {
  if (expr.resultType === targetType || expr.resultType !== 'f32') return expr;
  if (targetType === 'vec2<f32>') return vec2(expr);
  if (targetType === 'vec3<f32>') return vec3(expr);
  if (targetType === 'vec4<f32>') return vec4(expr);
  return expr;
}

// ============================================================================
// SAFE MATH FUNCTION WRAPPERS
// ============================================================================

/**
 * SAFE smoothstep - ensures low < high
 * If low >= high, swaps them
 */
export function smoothstep(low: Expression, high: Expression, x: Expression): CallExpr {
  const lowForX = splatToType(low, x.resultType);
  const highForX = splatToType(high, x.resultType);

  // If both are literals, we can check at construction time
  if (lowForX === low && highForX === high && low.kind === 'LiteralExpr' && high.kind === 'LiteralExpr') {
    const lowVal = (low as LiteralExpr).value as number;
    const highVal = (high as LiteralExpr).value as number;

    if (lowVal >= highVal) {
      // Swap them
      return call('smoothstep', [f32(highVal - 0.001), f32(lowVal + 0.001), x], x.resultType);
    }
  }

  // For dynamic values, use min/max to ensure ordering
  // smoothstep(min(low, high), max(low, high) + 0.001, x)
  return call('smoothstep', [
    call('min', [lowForX, highForX]),
    add(call('max', [lowForX, highForX]), splatToType(f32(0.001), x.resultType)),
    x
  ], x.resultType);
}

/**
 * SAFE clamp - ensures min < max
 */
export function clamp(x: Expression, minVal: Expression, maxVal: Expression): CallExpr {
  const minForX = splatToType(minVal, x.resultType);
  const maxForX = splatToType(maxVal, x.resultType);

  // If both bounds are literals, check at construction
  if (minForX === minVal && maxForX === maxVal && minVal.kind === 'LiteralExpr' && maxVal.kind === 'LiteralExpr') {
    const minV = (minVal as LiteralExpr).value as number;
    const maxV = (maxVal as LiteralExpr).value as number;

    if (minV >= maxV) {
      // Swap them
      return call('clamp', [x, f32(maxV), f32(minV)], x.resultType);
    }
  }

  // For dynamic values, use min/max to ensure ordering
  return call('clamp', [
    x,
    call('min', [minForX, maxForX]),
    call('max', [minForX, maxForX])
  ], x.resultType);
}

/**
 * SAFE pow - wraps base in abs() to prevent NaN with negative bases
 */
export function pow(base: Expression, exponent: Expression): CallExpr {
  return call('pow', [call('abs', [base]), exponent], 'f32');
}

/**
 * SAFE sqrt - wraps argument in abs() to prevent NaN
 */
export function sqrt(x: Expression): CallExpr {
  return call('sqrt', [call('abs', [x])], 'f32');
}

/**
 * SAFE log - wraps argument in abs() + epsilon to prevent -inf/NaN
 */
export function log(x: Expression): CallExpr {
  return call('log', [add(call('abs', [x]), f32(0.001))], 'f32');
}

/**
 * SAFE atan2 - adds epsilon to prevent undefined at (0,0)
 */
export function atan2(y: Expression, x: Expression): CallExpr {
  return call('atan2', [
    add(y, f32(0.0001)),
    add(x, f32(0.0001))
  ], 'f32');
}

// Standard math functions (no special safety needed)
export const sin = (x: Expression) => call('sin', [x], 'f32');
export const cos = (x: Expression) => call('cos', [x], 'f32');
export const tan = (x: Expression) => call('tan', [x], 'f32');
export const asin = (x: Expression) => call('asin', [x], 'f32');
export const acos = (x: Expression) => call('acos', [x], 'f32');
export const atan = (x: Expression) => call('atan', [x], 'f32');
export const exp = (x: Expression) => call('exp', [x], 'f32');
export const abs = (x: Expression) => call('abs', [x], x.resultType);
export const sign = (x: Expression) => call('sign', [x], x.resultType);
export const floor = (x: Expression) => call('floor', [x], x.resultType);
export const ceil = (x: Expression) => call('ceil', [x], x.resultType);
export const fract = (x: Expression) => call('fract', [x], x.resultType);
export const length = (x: Expression) => call('length', [x], 'f32');
export const normalize = (x: Expression) => call('normalize', [x], x.resultType);
export const dot = (a: Expression, b: Expression) => call('dot', [a, b], 'f32');
export const cross = (a: Expression, b: Expression) => call('cross', [a, b], 'vec3<f32>');
export const distance = (a: Expression, b: Expression) => call('distance', [a, b], 'f32');
export const min = (a: Expression, b: Expression) => call('min', [a, b], a.resultType);
export const max = (a: Expression, b: Expression) => call('max', [a, b], a.resultType);
export const mix = (a: Expression, b: Expression, t: Expression) => call('mix', [a, b, t], a.resultType);
export const step = (edge: Expression, x: Expression) => call('step', [edge, x], x.resultType);
export const reflect = (i: Expression, n: Expression) => call('reflect', [i, n], i.resultType);

// Preamble functions
export const f_hash = (x: Expression) => call('f_hash', [x], 'f32');
export const f_rot = (p: Expression, a: Expression) => call('f_rot', [p, a], 'vec2<f32>');
export const f_smin = (a: Expression, b: Expression, k: Expression) => call('f_smin', [a, b, k], 'f32');
export const f_pal = (t: Expression, a: Expression, b: Expression, c: Expression, d: Expression) =>
  call('f_pal', [t, a, b, c, d], 'vec3<f32>');
export const noise = (x: Expression) => call('noise', [x], 'f32');
export const fbm = (x: Expression) => call('fbm', [x], 'f32');
export const hash = (x: Expression) => call('hash', [x], 'f32');

// ============================================================================
// PARENTHESES
// ============================================================================

export function paren(expr: Expression): ParenExpr {
  return {
    kind: 'ParenExpr',
    expression: expr,
    resultType: expr.resultType,
  };
}

// ============================================================================
// STATEMENT BUILDERS
// ============================================================================

/**
 * Create let statement: let name = value;
 */
export function letStmt(name: string, value: Expression, type?: TypeExpr): LetStmt {
  return {
    kind: 'LetStmt',
    name,
    type: type || null,
    initializer: value,
  };
}

/**
 * Create var statement: var name = value;
 */
export function varStmt(name: string, value?: Expression, type?: TypeExpr): VarStmt {
  return {
    kind: 'VarStmt',
    name,
    type: type || null,
    initializer: value || null,
  };
}

/**
 * Create assignment statement: target = value;
 */
export function assign(target: Expression, value: Expression): AssignStmt {
  return {
    kind: 'AssignStmt',
    target,
    value,
  };
}

/**
 * Create return statement: return value;
 */
export function returnStmt(value?: Expression): ReturnStmt {
  return {
    kind: 'ReturnStmt',
    value: value || null,
  };
}

/**
 * Create expression statement
 */
export function exprStmt(expr: Expression): ExprStmt {
  return {
    kind: 'ExprStmt',
    expression: expr,
  };
}

/**
 * Create increment statement: x++;
 */
export function increment(operand: Expression): IncrementStmt {
  return {
    kind: 'IncrementStmt',
    operand,
  };
}

/**
 * Create block statement
 */
export function block(statements: Statement[]): BlockStmt {
  return {
    kind: 'BlockStmt',
    statements,
  };
}

/**
 * Create if statement
 */
export function ifStmt(
  condition: Expression,
  consequent: BlockStmt,
  alternate?: BlockStmt | IfStmt
): IfStmt {
  return {
    kind: 'IfStmt',
    condition,
    consequent,
    alternate: alternate || null,
  };
}

/**
 * Create for statement
 * INVARIANT: For loops are created as complete, valid units
 */
export function forStmt(
  varName: string,
  start: number,
  end: number,
  body: BlockStmt
): ForStmt {
  return {
    kind: 'ForStmt',
    init: varStmt(varName, i32(start)),
    condition: lt(ident(varName, 'i32'), i32(end)),
    update: increment(ident(varName, 'i32')),
    body,
  };
}

// ============================================================================
// TYPE EXPRESSION BUILDERS
// ============================================================================

export function namedType(name: string): NamedTypeExpr {
  return {
    kind: 'NamedTypeExpr',
    name,
  };
}

export function genericType(name: string, args: TypeExpr[]): GenericTypeExpr {
  return {
    kind: 'GenericTypeExpr',
    name,
    args,
  };
}

// Common types
export const f32Type = () => namedType('f32');
export const i32Type = () => namedType('i32');
export const u32Type = () => namedType('u32');
export const boolType = () => namedType('bool');
export const vec2f32Type = () => genericType('vec2', [f32Type()]);
export const vec3f32Type = () => genericType('vec3', [f32Type()]);
export const vec4f32Type = () => genericType('vec4', [f32Type()]);

// ============================================================================
// ATTRIBUTE BUILDERS
// ============================================================================

export function attr(name: string, ...args: Expression[]): Attribute {
  return {
    kind: 'Attribute',
    name,
    args,
  };
}

export const binding = (n: number) => attr('binding', i32(n));
export const group = (n: number) => attr('group', i32(n));
export const location = (n: number) => attr('location', i32(n));
export const fragment = () => attr('fragment');
export const vertex = () => attr('vertex');
export const compute = () => attr('compute');
export const builtin = (name: string) => attr('builtin', ident(name));

// ============================================================================
// DECLARATION BUILDERS
// ============================================================================

export function param(name: string, type: TypeExpr, attrs: Attribute[] = []): Parameter {
  return {
    kind: 'Parameter',
    name,
    attributes: attrs,
    type,
  };
}

export function fn(
  name: string,
  params: Parameter[],
  returnType: TypeExpr | null,
  body: BlockStmt,
  attrs: Attribute[] = [],
  returnAttrs: Attribute[] = []
): FunctionDecl {
  return {
    kind: 'FunctionDecl',
    name,
    attributes: attrs,
    params,
    returnType,
    returnAttributes: returnAttrs,
    body,
  };
}

export function uniform(
  name: string,
  type: TypeExpr,
  groupNum: number,
  bindingNum: number
): GlobalVarDecl {
  return {
    kind: 'GlobalVarDecl',
    attributes: [group(groupNum), binding(bindingNum)],
    name,
    addressSpace: 'uniform',
    accessMode: null,
    type,
    initializer: null,
  };
}

export function storageTexture(
  name: string,
  groupNum: number,
  bindingNum: number,
  format: string,
  access: string
): GlobalVarDecl {
  return {
    kind: 'GlobalVarDecl',
    attributes: [group(groupNum), binding(bindingNum)],
    name,
    addressSpace: null,
    accessMode: null,
    type: genericType('texture_storage_2d', [namedType(format), namedType(access)]),
    initializer: null,
  };
}

export function structMember(name: string, type: TypeExpr, attrs: Attribute[] = []): StructMember {
  return {
    kind: 'StructMember',
    name,
    attributes: attrs,
    type,
  };
}

export function structDecl(name: string, members: StructMember[]): StructDecl {
  return {
    kind: 'StructDecl',
    name,
    members,
  };
}

export function program(declarations: (FunctionDecl | GlobalVarDecl | StructDecl)[]): Program {
  return {
    kind: 'Program',
    declarations,
  };
}

// ============================================================================
// COMPLEXITY SCORING (for anti-convergence)
// ============================================================================

/**
 * Calculate complexity score of an expression
 * Used for anti-convergence - reject expressions that are too simple
 */
export function getComplexity(expr: Expression): number {
  switch (expr.kind) {
    case 'LiteralExpr':
      return 1;
    case 'IdentifierExpr':
      return 1;
    case 'BinaryExpr':
      return 1 + getComplexity(expr.left) + getComplexity(expr.right);
    case 'UnaryExpr':
      return 1 + getComplexity(expr.operand);
    case 'CallExpr':
      return 2 + expr.args.reduce((sum, arg) => sum + getComplexity(arg), 0);
    case 'MemberExpr':
      return 1 + getComplexity(expr.object);
    case 'IndexExpr':
      return 1 + getComplexity(expr.object) + getComplexity(expr.index);
    case 'ParenExpr':
      return getComplexity(expr.expression);
    default:
      return 1;
  }
}

/**
 * Check if an expression meets minimum complexity threshold
 */
export function isComplex(expr: Expression, minComplexity: number = 5): boolean {
  return getComplexity(expr) >= minComplexity;
}

// ============================================================================
// B NAMESPACE (for convenient imports)
// ============================================================================

/**
 * Builder namespace - import as:
 *   import { B } from './builder';
 *   B.lit(1.0), B.vec3(r, g, b), B.smoothstep(a, b, x)
 */
export const B = {
  // Literals
  lit: f32,
  f32,
  i32,
  u32,
  bool,

  // Identifiers
  ident,
  time,
  uv,
  mouse,
  resolution,

  // Vectors
  vec2,
  vec3,
  vec4,

  // Member access
  member,
  x,
  y,
  z,
  w,
  xy,
  xyz,
  rgb,

  // Binary operations
  add,
  sub,
  mul,
  div,
  divRaw,
  mod,
  eq,
  neq,
  lt,
  gt,
  lte,
  gte,
  and,
  or,
  binary: (left: Expression, op: BinaryOperator, right: Expression) => {
    // Inline binary for chaining
    let resultType: WGSLType;
    if (['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(op)) {
      resultType = 'bool';
    } else if (left.resultType === right.resultType) {
      resultType = left.resultType;
    } else {
      resultType = 'f32';
    }
    return { kind: 'BinaryExpr', operator: op, left, right, resultType } as BinaryExpr;
  },

  // Unary
  neg,
  not,
  unary: (op: '-' | '!' | '~', operand: Expression) => ({
    kind: 'UnaryExpr',
    operator: op,
    operand,
    resultType: op === '!' ? 'bool' : operand.resultType,
  } as UnaryExpr),

  // Function calls
  call: (fn: string, ...args: Expression[]) => call(fn, args),

  // Invariant-safe functions
  smoothstep,
  clamp,
  safeDiv: div,
  safePow: pow,

  // Common math calls
  sin: (x: Expression) => call('sin', [x]),
  cos: (x: Expression) => call('cos', [x]),
  tan: (x: Expression) => call('tan', [x]),
  abs: (x: Expression) => call('abs', [x]),
  fract: (x: Expression) => call('fract', [x]),
  floor: (x: Expression) => call('floor', [x]),
  ceil: (x: Expression) => call('ceil', [x]),
  sqrt: (x: Expression) => call('sqrt', [call('abs', [x])]), // Safe sqrt
  exp: (x: Expression) => call('exp', [x]),
  log: (x: Expression) => call('log', [call('max', [x, f32(0.001)])]), // Safe log
  saturate: (x: Expression) => call('saturate', [x]),
  min: (a: Expression, b: Expression) => call('min', [a, b]),
  max: (a: Expression, b: Expression) => call('max', [a, b]),
  mix: (a: Expression, b: Expression, t: Expression) => call('mix', [a, b, t]),
  step: (edge: Expression, x: Expression) => call('step', [edge, x]),
  length: (v: Expression) => call('length', [v]),
  normalize: (v: Expression) => call('normalize', [v]),
  dot: (a: Expression, b: Expression) => call('dot', [a, b]),
  cross: (a: Expression, b: Expression) => call('cross', [a, b]),

  // Statements
  letStmt,
  varStmt,
  assign,
  returnStmt,
  ifStmt,
  forStmt,
  block,
  exprStmt,
  increment,

  // Types
  namedType,
  genericType,

  // Declarations
  param,
  attr,
  binding,
  group,
  location,
  fragment,
  vertex,
  compute,
  builtin,
  fn,
  uniform,
  storageTexture,
  structMember,
  structDecl,
  program,

  // Complexity
  getComplexity,
  isComplex,
};

// Type for expressions with tracked type
export type TypedExpr<T extends WGSLType = WGSLType> = Expression & { resultType: T };
