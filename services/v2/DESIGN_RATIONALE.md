# Design Rationale

## Why a Complete Rewrite?

The v1 fuzzer worked... mostly. But it had fundamental architectural problems
that became increasingly painful to fix:

### The Regex Sanitization Trap

V1's approach:
1. Generate shader as string
2. Run regex passes to "fix" known issues
3. Hope nothing slipped through

This created a whack-a-mole situation:

```typescript
// V1: "Fix" smoothstep argument order
source = source.replace(/smoothstep\(([^,]+),\s*([^,]+),/g, (match, a, b) => {
  // Parse a and b as numbers... but what if they're expressions?
  // What if they're exp(0.0) = 1.0?
  // What about smoothstep(time * 0.5, 0.2, ...)?
});
```

Every fix introduced new edge cases. The regex couldn't understand:
- Expression evaluation (`exp(0.0)` = 1.0, so `smoothstep(exp(0.0), 0.5, x)` is invalid)
- Variable references (`smoothstep(a, b, x)` where a > b due to earlier assignment)
- Nested calls (`smoothstep(max(a, 0.5), min(b, 0.3), x)`)

### The For-Loop Corruption Bug

A particularly nasty bug in v1: mutation would sometimes corrupt for-loop structure:

```wgsl
// Before mutation
for (var i = 0; i < 10; i++) { ... }

// After mutation (oops, mutated the condition!)
for (var i = 0; i < sin(10); i++) { ... }

// Or worse - mutated the iterator variable name
for (var j = 0; j < 10; i++) { ... }  // Uses wrong variable!
```

Regex sanitization couldn't prevent this because it couldn't understand
the relationship between loop parts.

### The Type Blindness Problem

V1 generated expressions without knowing their types:

```typescript
// V1 might generate
"sin(" + genExpr() + ")"  // What if genExpr() returns a vec3?

// Or
"vec3(" + genExpr() + ")"  // But genExpr() is already a vec3!
```

This led to runtime shader compilation errors that regex couldn't catch.

## Core Design Principles

### Principle 1: No Invalid Construction

Instead of "generate then sanitize", we "construct only valid".

```typescript
// V1: Generate string, hope for the best
const expr = `smoothstep(${genExpr()}, ${genExpr()}, ${genExpr()})`;

// V2: Construct AST with enforced invariants
const expr = B.smoothstep(
  genExpr(),  // Will be wrapped in min/max
  genExpr(),  // Will be wrapped in min/max
  genExpr()
);
```

The key insight: **it's easier to not create bugs than to find and fix them**.

### Principle 2: Types Flow Through

Every expression knows its type. This prevents nonsensical constructions:

```typescript
// V2: Type is tracked
const scalar = B.f32(1.0);       // { resultType: 'f32' }
const vec = B.vec3(scalar, scalar, scalar);  // { resultType: 'vec3<f32>' }
const length = B.length(vec);   // { resultType: 'f32' }

// Generator can make type-aware decisions
function genScalarOrVec(depth: number): Expression {
  if (needScalar()) {
    return genScalar(depth);  // Returns f32
  } else {
    return genVec3(depth);    // Returns vec3<f32>
  }
}
```

### Principle 3: Frozen Zones

Some AST regions must never be mutated:

**For Loops**: The relationship between init, condition, and update is delicate.
Mutating one without the others breaks the loop semantics.

**Uniforms**: The `@group` and `@binding` attributes must match the pipeline
layout. Changing them produces a shader that "compiles" but won't run.

**Reserved Identifiers**: Variables like `uv`, `time`, `uniforms` are referenced
by name elsewhere. Renaming them breaks those references.

```typescript
// V2 Mutator respects frozen zones
if (this.config.frozenZones.forLoops) {
  // Only mutate the body, not the loop structure
  return {
    ...stmt,
    body: this.mutateBlock(stmt.body),  // ← This is allowed
    // init, condition, update untouched
  };
}
```

### Principle 4: Anti-Convergence by Design

V1's anti-convergence was an afterthought:
1. Generate shader
2. Check if "too simple"
3. If so, throw away and retry

This was wasteful and produced bias toward complex shaders (since simple
ones got rejected).

V2 embeds anti-convergence in generation:

```typescript
// Track complexity during generation
this.metrics.operationDiversity.add('sin');  // Score +3
this.metrics.uniformsUsed.add('time');       // Score +5, +15 for animation

// At the end, compute score
const score = computeComplexityScore(this.metrics);

// If too simple, adjust weights and regenerate
if (score < minComplexity) {
  this.config.weights.call += 5;   // Encourage more function calls
  this.config.weights.binary += 5; // Encourage more operations
  // Retry generation with new weights
}
```

## Why AST Over Strings?

### Strings Are Ambiguous

```typescript
// Is this valid?
const shader = "fn foo() -> vec4f { return vec4f(1.0); }";

// What about this?
const shader = "fn foo() -> vec4f { return vec4f(1.0); }; extra stuff";

// Or this?
const shader = "fn foo() -> vec4f { return vec4f(1.0 /* unclosed comment }";
```

Strings don't know their own structure. You need to parse to validate.

### ASTs Are Unambiguous

```typescript
const ast: Program = {
  kind: 'Program',
  declarations: [{
    kind: 'FunctionDecl',
    name: 'foo',
    returnType: { kind: 'NamedTypeExpr', name: 'vec4f' },
    body: {
      kind: 'BlockStmt',
      statements: [{
        kind: 'ReturnStmt',
        value: {
          kind: 'CallExpr',
          callee: 'vec4f',
          args: [{ kind: 'LiteralExpr', raw: '1.0' }]
        }
      }]
    }
  }]
};
```

The structure IS the validation. If you can construct it, it's valid.

### Mutations Are Precise

```typescript
// String mutation: Find "sin" and replace with "cos"... but
"asin(x)"  // Becomes "acos(x)" - wrong!
"assignment(x)"  // Becomes "assignmentco..." - broken!

// AST mutation: Find CallExpr with callee="sin", change to "cos"
if (node.kind === 'CallExpr' && node.callee === 'sin') {
  return { ...node, callee: 'cos' };  // Only changes function name
}
```

## The Builder Pattern

The `B` namespace provides fluent, type-safe construction:

```typescript
// Fluent expression building
const color = B.vec4(
  B.mul(B.sin(B.mul(B.member(B.ident('uv'), 'x'), B.lit(10.0))), B.lit(0.5)),
  B.mul(B.cos(B.member(B.ident('uv'), 'y')), B.lit(0.5)),
  B.fract(B.ident('time')),
  B.lit(1.0)
);
```

Every function in `B` either:
1. Creates a valid AST node directly, or
2. Wraps inputs to ensure validity

There's no way to construct invalid AST through `B`.

## Complexity Scoring Philosophy

A shader is "interesting" if it:

1. **Has depth**: Nested expressions create visual complexity
2. **Has diversity**: Using many different operations (not just `+`)
3. **Uses time**: Animation is more engaging than static
4. **Uses space**: UV-based variation is more engaging than solid color

The scoring function:

```typescript
score = nodeCount * 0.5          // Base complexity
      + maxDepthReached * 2      // Reward nesting
      + operationDiversity * 3   // Reward variety
      + uniformsUsed * 5         // Reward interactivity
      + (hasTimeVariation ? 15)  // Big bonus for animation
      + (hasSpatialVariation ? 10) // Bonus for UV patterns
```

This ensures we don't generate:
- Solid color shaders (score ~5)
- Simple gradients (score ~12)
- Static noise (score ~20)

While encouraging:
- Animated patterns (score ~35+)
- Interactive effects (score ~40+)
- Complex procedural art (score ~60+)

## Trade-offs

### Parse Time

V2 requires parsing existing shaders to mutate them. V1 could mutate strings
directly (badly). This adds ~1-5ms per shader.

**Acceptable because**: Correctness matters more than microseconds. A broken
shader wastes the user's time far more than parsing overhead.

### Code Size

The v2 module is larger than v1's regex collection. More types, more functions,
more structure.

**Acceptable because**: The code is maintainable. Adding a new invariant is
a single function in `builder.ts`, not a regex hunt through sanitization passes.

### Learning Curve

Developers need to understand AST structure to work with v2.

**Acceptable because**: The alternative (regex soup) was unmaintainable.
AST manipulation is a well-understood technique with clear patterns.

## Future Directions

### Type Inference Enhancement

Currently, type tracking is best-effort. Could be made more rigorous:

```typescript
// Future: Full type system
type TypedExpr<T extends WGSLType> = Expression & { resultType: T };

function sin(x: TypedExpr<'f32'>): TypedExpr<'f32'>;
function sin(x: TypedExpr<'vec2<f32>'>): TypedExpr<'vec2<f32>'>;
// etc.
```

### Semantic Analysis

Parser currently only does syntax. Could add:
- Variable scope tracking
- Type checking
- Dead code detection

### GPU Validation

Could integrate with WebGPU to validate shaders actually compile:

```typescript
async function validateOnGPU(source: string): Promise<boolean> {
  try {
    const module = device.createShaderModule({ code: source });
    const info = await module.getCompilationInfo();
    return info.messages.length === 0;
  } catch {
    return false;
  }
}
```

But the goal is to make this unnecessary - shaders should compile by construction.
