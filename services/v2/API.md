# API Reference

## High-Level Functions

### `generateWGSL(config?)`

Generate a complete WGSL fragment shader source.

```typescript
function generateWGSL(config?: Partial<GeneratorConfig & EmitterOptions>): string
```

**Parameters:**
- `config.maxDepth` - Maximum expression nesting depth (default: 6)
- `config.minComplexity` - Minimum complexity score to accept (default: 10)
- `config.maxComplexity` - Maximum complexity score (default: 100)
- `config.seed` - Random seed for reproducibility
- `config.effects` - Enable/disable effect categories
- `config.indent` - Indentation string (default: '  ')
- `config.pretty` - Add newlines for readability (default: true)

**Returns:** Valid WGSL shader source code as string

**Example:**
```typescript
const shader = generateWGSL({
  seed: 12345,
  maxDepth: 8,
  effects: {
    uvPatterns: true,
    timeAnimation: true,
    cursorEffect: false,
    noise: true,
    colorTransform: true,
    fractals: false,
  }
});
```

---

### `mutateWGSL(source, config?)`

Parse, mutate, and re-emit a shader.

```typescript
function mutateWGSL(
  source: string,
  config?: Partial<MutatorConfig & EmitterOptions>
): string
```

**Parameters:**
- `source` - WGSL source code to mutate
- `config.maxDepth` - Maximum recursion depth (default: 10)
- `config.mutationProbability` - Per-node mutation chance (default: 0.3)
- `config.mutations` - Enable/disable mutation types
- `config.frozenZones` - Protect certain AST regions
- `config.seed` - Random seed

**Returns:** Mutated WGSL source code

**Example:**
```typescript
const mutated = mutateWGSL(originalShader, {
  mutationProbability: 0.5,
  mutations: {
    literals: true,
    operators: true,
    functions: true,
    unary: false,
    swapOperands: false,
    subExpressions: false,
  },
  frozenZones: {
    forLoops: true,
    uniforms: true,
    signatures: true,
    attributes: true,
    identifiers: ['uv', 'time', 'mouse'],
  }
});
```

---

### `fuzz(options?)`

Full fuzzing pipeline - generate, then apply multiple mutation rounds.

```typescript
function fuzz(options?: {
  generatorConfig?: Partial<GeneratorConfig>;
  mutatorConfig?: Partial<MutatorConfig>;
  emitterConfig?: Partial<EmitterOptions>;
  rounds?: number;
}): { source: string; program: Program; mutations: MutationRecord[] }
```

**Parameters:**
- `generatorConfig` - Configuration for shader generation
- `mutatorConfig` - Configuration for mutations
- `emitterConfig` - Configuration for code emission
- `rounds` - Number of mutation rounds to apply (default: 1)

**Returns:**
- `source` - Final WGSL source code
- `program` - Final AST
- `mutations` - Log of all mutations applied

**Example:**
```typescript
const { source, mutations } = fuzz({
  generatorConfig: { seed: 42, minComplexity: 15 },
  mutatorConfig: { mutationProbability: 0.4 },
  rounds: 3,
});

console.log(`Applied ${mutations.length} mutations`);
console.log(source);
```

---

### `validate(source)`

Check if a shader can be parsed (basic syntax validation).

```typescript
function validate(source: string): { valid: boolean; error?: string }
```

**Example:**
```typescript
const result = validate(shaderCode);
if (!result.valid) {
  console.error('Parse error:', result.error);
}
```

---

## Parser

### `parse(source)`

Parse WGSL source into an AST.

```typescript
function parse(source: string): Program
```

**Throws:** `ParseError` if source cannot be parsed

**Example:**
```typescript
try {
  const ast = parse(shaderSource);
  console.log(`Parsed ${ast.declarations.length} declarations`);
} catch (e) {
  if (e instanceof ParseError) {
    console.error(`Parse error at line ${e.token?.line}: ${e.message}`);
  }
}
```

### `Parser` class

Lower-level parser with more control.

```typescript
class Parser {
  constructor(source: string)
  parse(): Program
  parseExpression(): Expression
}
```

---

## Emitter

### `emit(program, options?)`

Convert AST to WGSL source code.

```typescript
function emit(program: Program, options?: Partial<EmitterOptions>): string
```

**Options:**
- `indent` - Indentation string (default: `'  '`)
- `pretty` - Include newlines (default: `true`)

### `emitExpr(expr, options?)`

Emit a single expression.

```typescript
function emitExpr(expr: Expression, options?: Partial<EmitterOptions>): string
```

### `emitStmt(stmt, options?)`

Emit a single statement.

```typescript
function emitStmt(stmt: Statement, options?: Partial<EmitterOptions>): string
```

---

## Builder (B namespace)

The `B` namespace provides type-safe AST construction.

### Literals

```typescript
B.lit(1.0)        // f32 literal (alias for B.f32)
B.f32(1.0)        // f32 literal: "1.0"
B.i32(42)         // i32 literal: "42i"
B.u32(42)         // u32 literal: "42u"
B.bool(true)      // bool literal: "true"
```

### Identifiers

```typescript
B.ident('x')      // Generic identifier
B.time()          // Pre-typed: uniforms.time
B.uv()            // Pre-typed: uv (vec2<f32>)
B.mouse()         // Pre-typed: uniforms.mouse
B.resolution()    // Pre-typed: uniforms.resolution
```

### Vectors

```typescript
B.vec2(x, y)           // vec2f(x, y)
B.vec3(x, y, z)        // vec3f(x, y, z)
B.vec4(x, y, z, w)     // vec4f(x, y, z, w)

// Splat form
B.vec3(B.lit(0.5))     // vec3f(0.5) - all components same
```

### Member Access

```typescript
B.member(expr, 'x')    // expr.x
B.x(expr)              // expr.x
B.y(expr)              // expr.y
B.z(expr)              // expr.z
B.w(expr)              // expr.w
B.xy(expr)             // expr.xy
B.xyz(expr)            // expr.xyz
B.rgb(expr)            // expr.rgb
```

### Binary Operations

```typescript
B.add(a, b)      // a + b
B.sub(a, b)      // a - b
B.mul(a, b)      // a * b
B.div(a, b)      // Safe: a / (abs(b) + 0.001)
B.divRaw(a, b)   // Unsafe: a / b (only if you know b ≠ 0)
B.mod(a, b)      // a % b

B.eq(a, b)       // a == b
B.neq(a, b)      // a != b
B.lt(a, b)       // a < b
B.gt(a, b)       // a > b
B.lte(a, b)      // a <= b
B.gte(a, b)      // a >= b

B.and(a, b)      // a && b
B.or(a, b)       // a || b

// Generic binary
B.binary(a, '+', b)
```

### Unary Operations

```typescript
B.neg(x)         // -x
B.not(x)         // !x
B.unary('-', x)  // -x
```

### Function Calls

```typescript
B.call('sin', x)              // sin(x)
B.call('mix', a, b, t)        // mix(a, b, t)

// Type-tracked common functions
B.sin(x)         // sin(x)
B.cos(x)         // cos(x)
B.tan(x)         // tan(x)
B.abs(x)         // abs(x)
B.fract(x)       // fract(x)
B.floor(x)       // floor(x)
B.ceil(x)        // ceil(x)
B.saturate(x)    // saturate(x)
B.exp(x)         // exp(x)
B.min(a, b)      // min(a, b)
B.max(a, b)      // max(a, b)
B.step(e, x)     // step(e, x)
B.mix(a, b, t)   // mix(a, b, t)
B.length(v)      // length(v)
B.normalize(v)   // normalize(v)
B.dot(a, b)      // dot(a, b)
B.cross(a, b)    // cross(a, b)
```

### Safe Functions (Invariant-Enforcing)

```typescript
B.sqrt(x)        // sqrt(abs(x)) - never NaN
B.log(x)         // log(max(x, 0.001)) - never NaN
B.safeDiv(a, b)  // a / (abs(b) + 0.001) - never Inf
B.safePow(b, e)  // pow(abs(b), e) - never NaN

// smoothstep with auto-swap if low >= high
B.smoothstep(low, high, x)

// clamp with guaranteed min < max
B.clamp(x, min, max)
```

### Statements

```typescript
B.letStmt('x', expr)           // let x = expr;
B.varStmt('x', expr)           // var x = expr;
B.varStmt('x', null, type)     // var x: type;
B.assign(target, value)        // target = value;
B.returnStmt(expr)             // return expr;
B.returnStmt()                 // return;
B.ifStmt(cond, then, else?)    // if (cond) { then } else { else }
B.forStmt(init, cond, update, body)
B.block([stmt1, stmt2, ...])   // { stmt1; stmt2; ... }
B.exprStmt(expr)               // expr;
B.increment(expr)              // expr++;
```

### Types

```typescript
B.namedType('f32')             // f32
B.namedType('vec3f')           // vec3f
B.genericType('array', [type]) // array<type>
```

### Declarations

```typescript
B.param('x', type, attrs?)     // x: type
B.attr('binding', B.lit(0))    // @binding(0)
B.binding(0)                   // @binding(0)
B.group(0)                     // @group(0)
B.location(0)                  // @location(0)
B.fragment()                   // @fragment
B.vertex()                     // @vertex
B.builtin('position')          // @builtin(position)

B.fn(name, params, returnType, body, attrs?, returnAttrs?)
B.uniform(name, type, group, binding)
B.structMember(name, type, attrs?)
B.structDecl(name, members)
B.program(declarations)
```

### Complexity

```typescript
B.getComplexity(expr)          // Returns complexity score
B.isComplex(expr, min?)        // Returns true if score >= min
```

---

## Generator

### `ShaderGenerator` class

```typescript
class ShaderGenerator {
  constructor(config?: Partial<GeneratorConfig>)

  generateProgram(): Program
  generateColorExpression(depth?: number): Expression
  getMetrics(): ComplexityMetrics & { score: number }
  reseed(seed?: number): void
}
```

### Configuration

```typescript
interface GeneratorConfig {
  maxDepth: number;      // default: 6
  minComplexity: number; // default: 10
  maxComplexity: number; // default: 100
  seed?: number;
  weights: ExpressionWeights;
  effects: EffectCategories;
}

interface ExpressionWeights {
  literal: number;    // default: 10
  identifier: number; // default: 20
  binary: number;     // default: 30
  unary: number;      // default: 10
  call: number;       // default: 25
  swizzle: number;    // default: 5
  ternary: number;    // default: 5
}

interface EffectCategories {
  uvPatterns: boolean;     // default: true
  timeAnimation: boolean;  // default: true
  cursorEffect: boolean;   // default: true
  noise: boolean;          // default: true
  colorTransform: boolean; // default: true
  fractals: boolean;       // default: false
}
```

---

## Mutator

### `ASTMutator` class

```typescript
class ASTMutator {
  constructor(config?: Partial<MutatorConfig>)

  mutateProgram(program: Program): Program
  mutateExpression(expr: Expression, depth?: number): Expression
  getMutations(): MutationRecord[]
  reset(): void
  reseed(seed?: number): void
}
```

### Configuration

```typescript
interface MutatorConfig {
  maxDepth: number;              // default: 10
  mutationProbability: number;   // default: 0.3
  seed?: number;
  mutations: MutationTypes;
  frozenZones: FrozenZoneConfig;
}

interface MutationTypes {
  literals: boolean;        // default: true
  operators: boolean;       // default: true
  functions: boolean;       // default: true
  unary: boolean;          // default: true
  swapOperands: boolean;   // default: true
  subExpressions: boolean; // default: false
}

interface FrozenZoneConfig {
  forLoops: boolean;       // default: true
  uniforms: boolean;       // default: true
  signatures: boolean;     // default: true
  attributes: boolean;     // default: true
  identifiers: string[];   // default: ['uv', 'pos', 'uniforms', ...]
}
```

### `MutationRecord`

```typescript
interface MutationRecord {
  type: string;      // 'literal', 'operator', 'function', etc.
  location: string;  // Path in AST: 'Program.decl[0].stmt[1]'
  before: string;    // Original value
  after: string;     // New value
}
```

### Convenience Functions

```typescript
// Simple mutation
const mutated = mutate(program, config?);

// Mutation with logging
const { result, mutations } = mutateWithLog(program, config?);

// Multiple rounds
const final = mutateRounds(program, 5, config?);
```

---

## Types

### Core AST Types

```typescript
type WGSLType =
  | 'f32' | 'i32' | 'u32' | 'bool'
  | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>'
  | 'vec2<i32>' | 'vec3<i32>' | 'vec4<i32>'
  | 'vec2<u32>' | 'vec3<u32>' | 'vec4<u32>'
  | 'mat2x2<f32>' | 'mat3x3<f32>' | 'mat4x4<f32>'
  | 'sampler' | 'texture_2d<f32>'
  | 'void' | 'unknown';

type Expression =
  | BinaryExpr | UnaryExpr | CallExpr
  | MemberExpr | IndexExpr | ParenExpr
  | LiteralExpr | IdentifierExpr;

type Statement =
  | BlockStmt | LetStmt | VarStmt
  | AssignStmt | CompoundAssignStmt
  | IfStmt | ForStmt | WhileStmt | LoopStmt | SwitchStmt
  | BreakStmt | ContinueStmt | ReturnStmt | DiscardStmt
  | IncrementStmt | DecrementStmt | ExprStmt;

type Declaration =
  | FunctionDecl | GlobalVarDecl | ConstDecl
  | StructDecl | TypeAlias;
```

### Type Helpers

```typescript
isScalarType(t: WGSLType): boolean
isVectorType(t: WGSLType): boolean
isMatrixType(t: WGSLType): boolean
getVectorScalarType(t: WGSLType): WGSLType
getVectorDimension(t: WGSLType): number
```
