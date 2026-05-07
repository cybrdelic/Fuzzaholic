# WGSL AST Fuzzer v2

**Clean, regex-free WGSL shader fuzzer with correctness by construction.**

## Philosophy

This is a complete rewrite of the shader fuzzer, designed with one core principle:
**If it compiles in the builder, it compiles in the shader.**

### No Regex, No Post-Validation

Unlike v1 which used regex-based sanitization to "fix" broken shaders after the fact,
v2 builds shaders that are valid from the start. We don't generate strings and hope
they parse - we construct Abstract Syntax Trees (ASTs) that are then emitted as code.

### Correctness by Construction

The builder module enforces invariants at the point of node creation:

```typescript
// smoothstep requires low < high - builder auto-swaps if needed
B.smoothstep(high, low, x)  // Automatically becomes smoothstep(low, high, x)

// Division by zero is impossible - divisor is wrapped in abs(x) + epsilon
B.safeDiv(a, b)  // Emits: a / (abs(b) + 0.001)

// sqrt of negative is undefined - builder wraps in abs()
B.sqrt(x)  // Emits: sqrt(abs(x))
```

### Anti-Convergence Embedded in Generation

Complexity scoring happens DURING generation, not after. If a generated shader
would be "too simple" (just a gradient, solid color), the generator rejects it
internally and tries again with adjusted weights.

## Quick Start

```typescript
import { generateWGSL, mutateWGSL, fuzz } from './services/v2';

// Generate a random shader
const shader1 = generateWGSL({ seed: 12345 });

// Mutate an existing shader
const shader2 = mutateWGSL(existingCode, { mutationProbability: 0.3 });

// Full fuzzing pipeline with multiple mutation rounds
const { source, mutations } = fuzz({
  generatorConfig: { maxDepth: 6, minComplexity: 10 },
  mutatorConfig: { mutationProbability: 0.5 },
  rounds: 3,
});
```

## Module Structure

```
services/v2/
├── types.ts      # AST node type definitions
├── lexer.ts      # Tokenizer for parsing existing WGSL
├── parser.ts     # Recursive descent parser
├── builder.ts    # Type-safe AST constructors (the core!)
├── emitter.ts    # AST → WGSL code generation
├── generator.ts  # Procedural shader generation
├── mutator.ts    # AST-based mutations with frozen zones
└── index.ts      # Public API
```

## Key Features

### 1. Type-Safe Builder (`builder.ts`)

Every expression carries its WGSL type. The builder tracks types through:
- Literal creation: `B.f32(1.0)` → `{ resultType: 'f32' }`
- Vector construction: `B.vec3(r, g, b)` → `{ resultType: 'vec3<f32>' }`
- Binary operations: `B.add(vec3, vec3)` → `{ resultType: 'vec3<f32>' }`
- Function calls: `B.sin(x)` → `{ resultType: 'f32' }`

### 2. Invariant-Safe Functions

Critical WGSL functions have safe wrappers:

| Function | Issue | Safe Version |
|----------|-------|--------------|
| `smoothstep(a, b, x)` | Undefined if a >= b | Auto-swaps if needed |
| `clamp(x, min, max)` | Undefined if min > max | Ensures ordering |
| `x / y` | Undefined if y = 0 | `x / (abs(y) + 0.001)` |
| `pow(x, y)` | Undefined if x < 0 | `pow(abs(x), y)` |
| `sqrt(x)` | Undefined if x < 0 | `sqrt(abs(x))` |
| `log(x)` | Undefined if x <= 0 | `log(max(x, 0.001))` |

### 3. Frozen Zones (`mutator.ts`)

Certain AST regions are protected from mutation:

- **For-loop structure**: Init, condition, update are frozen (breaks control flow)
- **Uniform declarations**: Binding/group attributes must match pipeline layout
- **Function signatures**: Return types and parameters must stay consistent
- **Reserved identifiers**: `uv`, `time`, `mouse`, `uniforms` etc.

### 4. Complexity Scoring (`generator.ts`)

Every generated shader is scored:

```typescript
score = nodeCount * 0.5
      + maxDepth * 2
      + operationDiversity * 3
      + uniformsUsed * 5
      + (hasTimeAnimation ? 15 : 0)
      + (hasSpatialVariation ? 10 : 0)
```

Shaders below `minComplexity` threshold are rejected and regenerated.

## Configuration

### Generator Config

```typescript
interface GeneratorConfig {
  maxDepth: number;        // Max expression nesting (default: 6)
  minComplexity: number;   // Reject simpler shaders (default: 10)
  maxComplexity: number;   // Reject overly complex (default: 100)
  seed?: number;           // For reproducibility
  effects: {
    uvPatterns: boolean;   // Sine waves, gradients
    timeAnimation: boolean;// Time-based movement
    cursorEffect: boolean; // Mouse interaction
    noise: boolean;        // Noise functions
    fractals: boolean;     // Expensive, opt-in
  };
}
```

### Mutator Config

```typescript
interface MutatorConfig {
  maxDepth: number;           // Max recursion depth (default: 10)
  mutationProbability: number; // Per-node mutation chance (default: 0.3)
  mutations: {
    literals: boolean;        // Mutate numeric values
    operators: boolean;       // Swap +/-/*
    functions: boolean;       // Swap sin/cos/abs
    unary: boolean;           // Add/remove negation
    swapOperands: boolean;    // a+b → b+a
    subExpressions: boolean;  // Replace whole subtrees (aggressive)
  };
  frozenZones: {
    forLoops: boolean;
    uniforms: boolean;
    signatures: boolean;
    attributes: boolean;
    identifiers: string[];    // Specific names to protect
  };
}
```

## Why This Matters

The v1 fuzzer would generate shaders like:
```wgsl
// Before sanitization (broken)
smoothstep(1.0, 0.0, x)    // a > b = undefined
pow(-2.0, 0.5)             // negative^fractional = undefined
1.0 / (time * 0.0)         // division by zero

// After regex sanitization (sometimes still broken)
smoothstep(0.0, 1.0, x)    // Fixed... but what about exp(0.0)?
pow(abs(-2.0), 0.5)        // Fixed
1.0 / max(time * 0.0, 0.001) // Fixed... until mutation breaks it
```

The v2 fuzzer generates:
```wgsl
// Built with invariants enforced
smoothstep(min(a, b), max(a, b), x)   // ALWAYS valid
pow(abs(base), exp)                    // ALWAYS valid
a / (abs(divisor) + 0.001)            // ALWAYS valid
```

**The difference: v2 cannot generate invalid shaders. It's not about catching
errors - it's about making errors impossible.**

## Files

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - System design and module relationships
- [`DESIGN_RATIONALE.md`](./DESIGN_RATIONALE.md) - Why we made these choices
- [`API.md`](./API.md) - Complete API reference
