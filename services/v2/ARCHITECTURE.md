# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Public API (index.ts)                     │
├─────────────────────────────────────────────────────────────────┤
│  generateWGSL()  │  mutateWGSL()  │  fuzz()  │  validate()      │
└────────┬─────────┴────────┬───────┴────┬─────┴────────┬─────────┘
         │                  │            │              │
         ▼                  ▼            ▼              ▼
┌─────────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐
│  generator.ts   │  │ mutator.ts  │  │  emitter.ts │  │ parser.ts│
│                 │  │             │  │             │  │          │
│ - ShaderGenerator│  │- ASTMutator │  │- Emitter    │  │- Parser  │
│ - genScalar()   │  │- mutateExpr │  │- emit()     │  │- parse() │
│ - genVec3()     │  │- frozen zones│  │- emitExpr() │  │          │
│ - complexity    │  │             │  │             │  │          │
└────────┬────────┘  └──────┬──────┘  └──────┬──────┘  └────┬─────┘
         │                  │                │              │
         └──────────────────┼────────────────┘              │
                            ▼                               ▼
                   ┌─────────────────┐              ┌──────────────┐
                   │   builder.ts    │              │   lexer.ts   │
                   │                 │              │              │
                   │ - B.lit()       │              │ - Lexer      │
                   │ - B.vec3()      │              │ - tokenize() │
                   │ - B.smoothstep()│              │              │
                   │ - INVARIANTS    │              │              │
                   └────────┬────────┘              └──────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │    types.ts     │
                   │                 │
                   │ - WGSLType      │
                   │ - AST Node types│
                   │ - Expression    │
                   │ - Statement     │
                   └─────────────────┘
```

## Data Flow

### Generation Flow
```
ShaderGenerator
    │
    ├─► generateUniformStruct() ──► B.structDecl() ──► StructDecl AST
    │
    ├─► generateUniformBinding() ─► B.uniform() ────► GlobalVarDecl AST
    │
    └─► generateFragmentMain()
            │
            ├─► generateUVSetup() ──► B.letStmt() ─► LetStmt AST
            │
            └─► generateColorCalculation()
                    │
                    ├─► genScalar(depth) ──┬─► B.lit()
                    │                      ├─► B.ident()
                    │                      ├─► B.binary()
                    │                      └─► B.call()
                    │
                    └─► B.vec4(r, g, b, a) ──► CallExpr AST
                            │
                            ▼
                      Program AST
                            │
                            ▼
                    Emitter.emit()
                            │
                            ▼
                    WGSL Source String
```

### Mutation Flow
```
WGSL Source
    │
    ▼
Parser.parse()
    │
    ▼
Program AST
    │
    ▼
ASTMutator.mutateProgram()
    │
    ├─► Check frozen zones
    │       │
    │       ├─► forLoops: true → skip init/cond/update
    │       ├─► uniforms: true → skip @group/@binding
    │       └─► identifiers: ['uv', 'time', ...] → skip
    │
    ├─► For each eligible node:
    │       │
    │       ├─► random(0,1) < mutationProbability?
    │       │       │
    │       │       ├─► YES: Apply mutation
    │       │       │       ├─► mutateLiteral()
    │       │       │       ├─► mutateOperator()
    │       │       │       ├─► mutateCall()
    │       │       │       └─► etc.
    │       │       │
    │       │       └─► NO: Traverse children
    │       │
    │       └─► Record mutation in log
    │
    ▼
Mutated Program AST
    │
    ▼
Emitter.emit()
    │
    ▼
Mutated WGSL Source
```

## Module Responsibilities

### `types.ts`
**Purpose**: Define the AST structure

- `WGSLType`: Union type of all WGSL scalar/vector/matrix types
- `Expression`: Union of all expression node types
- `Statement`: Union of all statement node types
- `Declaration`: Union of all top-level declaration types
- Helper functions: `isScalarType()`, `isVectorType()`, etc.

**Key Design**: Every expression node has a `resultType: WGSLType` field
for type tracking through the tree.

### `lexer.ts`
**Purpose**: Convert source string to tokens

- Character-by-character scanning (NO REGEX)
- Handles: identifiers, numbers (float, hex, suffixed), operators, brackets
- Preserves source locations for error reporting

**Key Design**: Pure lexical analysis, no semantic interpretation.
Every token knows its line/column position.

### `parser.ts`
**Purpose**: Build AST from token stream

- Recursive descent parsing
- Precedence climbing for binary expressions
- Error recovery: skip to next declaration on failure

**Key Design**: Parser produces AST that may have semantic errors
(type mismatches) but is syntactically valid. Validation is separate.

### `builder.ts`
**Purpose**: Type-safe AST node construction with invariant enforcement

**THE CORE OF THE SYSTEM**

```typescript
// Invariant: smoothstep(a, b, x) requires a < b
export function smoothstep(low: Expr, high: Expr, x: Expr): CallExpr {
  // If we can determine low >= high at build time, swap them
  if (isLiteral(low) && isLiteral(high) && getValue(low) >= getValue(high)) {
    [low, high] = [high, low];
  }
  // Even if we can't determine, wrap in min/max for safety
  return call('smoothstep', [
    call('min', [low, high]),
    call('max', [low, high]),
    x
  ]);
}
```

**Key Functions**:
- `B.lit(n)`: Create numeric literal with type
- `B.vec3(x, y, z)`: Create vec3 constructor call
- `B.smoothstep(a, b, x)`: Safe smoothstep with auto-swap
- `B.safeDiv(a, b)`: Division with zero-protection
- `B.safePow(base, exp)`: Power with negative base protection

### `emitter.ts`
**Purpose**: Convert AST back to WGSL source code

- Visitor pattern traversal
- Handles operator precedence (adds parens when needed)
- Configurable formatting (pretty vs minified)

**Key Design**: Pure structural traversal. If the AST is valid,
the emitted code is valid. No "fixing" happens here.

### `generator.ts`
**Purpose**: Procedural shader generation

- `ShaderGenerator` class with seeded RNG
- Type-directed generation: `genScalar()`, `genVec3()`, `genVec4()`
- Complexity scoring and anti-convergence
- Configurable effect categories

**Key Design**: Generator uses builder exclusively. Never constructs
raw AST nodes. This ensures all invariants are enforced.

### `mutator.ts`
**Purpose**: AST-based shader mutation

- `ASTMutator` class with configurable mutation types
- Frozen zone support (protect critical structures)
- Mutation logging for debugging
- Multiple mutation strategies per node type

**Key Design**: Mutations are applied through builder functions
where possible. Direct AST manipulation is typed to ensure validity.

## Invariant Enforcement Points

```
┌────────────────────────────────────────────────────────────────┐
│                        Generation Time                          │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ShaderGenerator.genScalar()                                    │
│       │                                                          │
│       ├─► genScalarCall() ─┬─► 'sqrt' → B.sqrt() [wraps abs()]  │
│       │                    ├─► 'log'  → B.log()  [wraps max()]  │
│       │                    ├─► 'pow'  → B.safePow() [abs base]  │
│       │                    └─► 'smoothstep' → B.smoothstep()    │
│       │                                                          │
│       └─► genScalarBinary() ──► B.safeDiv() for division        │
│                                                                  │
├────────────────────────────────────────────────────────────────┤
│                         Mutation Time                            │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ASTMutator.mutateCall()                                        │
│       │                                                          │
│       └─► mutateCallFunction()                                  │
│               │                                                  │
│               ├─► Swapping to 'sqrt' → wrap in abs()            │
│               ├─► Swapping to 'pow'  → wrap base in abs()       │
│               └─► 'smoothstep'/'clamp' → use B.smoothstep/clamp │
│                                                                  │
│  ASTMutator.mutateOperator()                                    │
│       │                                                          │
│       └─► Changing to '/' → use B.safeDiv()                     │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

## Error Handling Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                         Parse Errors                             │
├─────────────────────────────────────────────────────────────────┤
│  Parser throws ParseError with:                                  │
│  - Message describing the issue                                  │
│  - Token that caused the error                                   │
│  - Source location (line, column)                                │
│                                                                  │
│  Recovery: skipToNextDeclaration() allows partial parsing        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       Generation Errors                          │
├─────────────────────────────────────────────────────────────────┤
│  NONE - by design.                                               │
│                                                                  │
│  Generator only uses builder functions.                          │
│  Builder functions enforce invariants.                           │
│  Therefore: generation cannot produce invalid AST.               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        Mutation Errors                           │
├─────────────────────────────────────────────────────────────────┤
│  NONE - by design.                                               │
│                                                                  │
│  Mutator only modifies existing valid AST.                       │
│  Modifications use builder functions.                            │
│  Operator changes are typed (BinaryOperator union).              │
│  Therefore: mutation cannot produce invalid AST.                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        Emission Errors                           │
├─────────────────────────────────────────────────────────────────┤
│  NONE - by design.                                               │
│                                                                  │
│  Emitter is a pure visitor over the AST.                         │
│  Every AST node type has a corresponding emit function.          │
│  Therefore: emission cannot fail.                                │
└─────────────────────────────────────────────────────────────────┘
```

## Extension Points

### Adding New Safe Functions

1. Add type signature to `types.ts` if needed
2. Add invariant-enforcing function to `builder.ts`
3. Add to `B` namespace export
4. Update generator's `genScalarCall()` to use it
5. Update mutator's `mutateCallFunction()` to use it

### Adding New Mutation Types

1. Add to `MutationTypes` interface in `mutator.ts`
2. Add mutation logic in appropriate `mutate*()` method
3. Update configuration defaults if needed

### Adding New Effect Categories

1. Add to `EffectCategories` interface in `generator.ts`
2. Add generation logic in `generateColorCalculation()` or similar
3. Update complexity scoring if the effect adds visual interest
