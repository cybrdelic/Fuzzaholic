/**
 * WGSL AST Fuzzer v2 - Public API
 *
 * Clean, regex-free implementation with correctness by construction.
 *
 * @example
 * ```typescript
 * import { generateShader, emit, mutate } from './services/v2';
 *
 * // Generate a new shader
 * const program = generateShader({ seed: 12345 });
 *
 * // Convert to WGSL source
 * const source = emit(program);
 *
 * // Mutate the shader
 * const mutated = mutate(program, { mutationProbability: 0.5 });
 * const mutatedSource = emit(mutated);
 * ```
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
    ArrayTypeExpr, AssignStmt,
    // AST Node Types
    ASTNode, Attribute, BinaryExpr, BlockStmt, BreakStmt, CallExpr, CompoundAssignStmt, ConstDecl, ContinueStmt, Declaration, DecrementStmt, DiscardStmt, Expression, ExprStmt, ForStmt, FunctionDecl, GenericTypeExpr, GlobalVarDecl, IdentifierExpr, IfStmt, IncrementStmt, IndexExpr, LetStmt, LiteralExpr, LoopStmt, MemberExpr, NamedTypeExpr, Parameter, ParenExpr, Program, ReturnStmt,
    // Source location
    SourceLocation, Statement, StructDecl, StructMember, SwitchCase, SwitchStmt, TypeAlias, TypeExpr, UnaryExpr, VarStmt, WhileStmt
} from './types';

// Re-export type as type (it's a type alias not an enum)
export type { WGSLType } from './types';

// Re-export type helper functions
export { getVectorDimension, getVectorScalarType, isMatrixType, isScalarType, isVectorType } from './types';

// ============================================================================
// LEXER
// ============================================================================

export { BUILTIN_TYPES, isBuiltinType, isKeyword, KEYWORDS, Lexer, tokenize, tokenizeClean } from './lexer';
export type { Token } from './lexer';

// ============================================================================
// PARSER
// ============================================================================

export { parse, ParseError, Parser } from './parser';

// ============================================================================
// BUILDER
// ============================================================================

export { B } from './builder';
export type { TypedExpr } from './builder';
// Also export individual functions for direct use
export { add, assign, attr, block, bool, call, clamp, compute, div, f32, fn, forStmt, genericType, getComplexity, i32, ident, ifStmt, isComplex, letStmt, member, mod, mul, namedType, neg, not, param, pow, program, returnStmt, smoothstep, storageTexture, sub, u32, uniform, varStmt, vec2, vec3, vec4 } from './builder';

// ============================================================================
// EMITTER
// ============================================================================

export { emit, emitExpr, emitStmt, Emitter } from './emitter';
export type { EmitterOptions } from './emitter';

// ============================================================================
// GENERATOR
// ============================================================================

export { generateColor, generateComputeShader, generateShader, generateVertexFragmentShader, ShaderGenerator } from './generator';
export type { EffectCategories, ExpressionWeights, GeneratorConfig, GeneratorIntent } from './generator';

// ============================================================================
// MUTATOR
// ============================================================================

export { ASTMutator, mutate, mutateRounds, mutateWithLog } from './mutator';
export type { FrozenZoneConfig, MutationRecord, MutationTypes, MutatorConfig } from './mutator';

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

import { emit, EmitterOptions } from './emitter';
import { generateShader, GeneratorConfig } from './generator';
import { mutate, mutateWithLog, MutationRecord, MutatorConfig } from './mutator';
import { parse } from './parser';
import { Program } from './types';

/**
 * Generate a complete WGSL shader source
 */
export function generateWGSL(config?: Partial<GeneratorConfig & EmitterOptions>): string {
  const program = generateShader(config);
  return emit(program, config);
}

/**
 * Parse, mutate, and re-emit a shader
 */
export function mutateWGSL(
  source: string,
  config?: Partial<MutatorConfig & EmitterOptions>
): string {
  const program = parse(source);
  const mutated = mutate(program, config);
  return emit(mutated, config);
}

/**
 * Full fuzzing pipeline - generate and mutate
 */
export function fuzz(options?: {
  generatorConfig?: Partial<GeneratorConfig>;
  mutatorConfig?: Partial<MutatorConfig>;
  emitterConfig?: Partial<EmitterOptions>;
  rounds?: number;
}): { source: string; program: Program; mutations: MutationRecord[] } {
  const { generatorConfig, mutatorConfig, emitterConfig, rounds = 1 } = options ?? {};

  // Generate base
  let program = generateShader(generatorConfig);
  const allMutations: MutationRecord[] = [];

  // Apply mutation rounds
  for (let i = 0; i < rounds; i++) {
    const { result, mutations } = mutateWithLog(program, mutatorConfig);
    program = result;
    allMutations.push(...mutations);
  }

  // Emit final source
  const source = emit(program, emitterConfig);

  return { source, program, mutations: allMutations };
}

/**
 * Validate a shader can be parsed (basic syntax check)
 */
export function validate(source: string): { valid: boolean; error?: string } {
  try {
    parse(source);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}
