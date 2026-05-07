/**
 * WGSL AST Mutator - v2 Clean Implementation
 *
 * Applies mutations to AST nodes while respecting frozen zones.
 * All mutations produce VALID AST by construction.
 *
 * Key principles:
 * - Never mutate frozen zones (for loops, uniforms, attributes)
 * - Use builder functions for all new nodes (invariant enforcement)
 * - Track what was mutated for logging/debugging
 * - Support granular control over mutation scope
 */

import {
    BinaryExpr,
    BinaryOperator,
    BlockStmt,
    CallExpr,
    Declaration,
    Expression,
    FunctionDecl,
    IfStmt,
    LiteralExpr,
    Program,
    Statement,
    UnaryExpr
} from './types';

import { B } from './builder';

// ============================================================================
// MUTATION CONFIGURATION
// ============================================================================

export interface MutatorConfig {
  /** Maximum depth to recurse into expressions */
  maxDepth: number;
  /** Probability of mutating each eligible node */
  mutationProbability: number;
  /** Enable/disable specific mutation types */
  mutations: MutationTypes;
  /** Zones to skip entirely */
  frozenZones: FrozenZoneConfig;
  /** Random seed */
  seed?: number;
}

export interface MutationTypes {
  /** Replace numeric literals with new values */
  literals: boolean;
  /** Replace binary operators */
  operators: boolean;
  /** Replace function calls */
  functions: boolean;
  /** Add/remove unary operators */
  unary: boolean;
  /** Swap operands in binary expressions */
  swapOperands: boolean;
  /** Replace entire sub-expressions */
  subExpressions: boolean;
}

export interface FrozenZoneConfig {
  /** Never touch for-loop structure (init, condition, update) */
  forLoops: boolean;
  /** Never touch uniform declarations */
  uniforms: boolean;
  /** Never touch function signatures */
  signatures: boolean;
  /** Never touch attributes */
  attributes: boolean;
  /** List of specific identifier names to skip */
  identifiers: string[];
}

const DEFAULT_CONFIG: MutatorConfig = {
  maxDepth: 10,
  mutationProbability: 0.3,
  mutations: {
    literals: true,
    operators: true,
    functions: true,
    unary: true,
    swapOperands: true,
    subExpressions: false, // More aggressive, opt-in
  },
  frozenZones: {
    forLoops: true,
    uniforms: true,
    signatures: true,
    attributes: true,
    identifiers: ['uv', 'pos', 'uniforms', 'resolution', 'time', 'mouse', 'frame'],
  },
};

// ============================================================================
// MUTATION TRACKING
// ============================================================================

export interface MutationRecord {
  type: string;
  location: string;
  before: string;
  after: string;
}

// ============================================================================
// SEEDED RANDOM (same as generator)
// ============================================================================

class SeededRandom {
  private state: number;

  constructor(seed?: number) {
    this.state = seed ?? Date.now();
  }

  next(): number {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return (this.state >>> 0) / 0xffffffff;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

// ============================================================================
// MUTATOR CLASS
// ============================================================================

export class ASTMutator {
  private config: MutatorConfig;
  private rng: SeededRandom;
  private mutations: MutationRecord[];
  private currentPath: string[];

  constructor(config: Partial<MutatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new SeededRandom(config.seed);
    this.mutations = [];
    this.currentPath = [];
  }

  // ---- Public API ----

  /**
   * Mutate a program, returning a new mutated copy
   */
  mutateProgram(program: Program): Program {
    this.mutations = [];
    this.currentPath = ['Program'];

    const newDeclarations = program.declarations.map((decl, i) => {
      this.currentPath.push(`decl[${i}]`);
      const result = this.mutateDeclaration(decl);
      this.currentPath.pop();
      return result;
    });

    return {
      kind: 'Program',
      declarations: newDeclarations,
    };
  }

  /**
   * Mutate just an expression (for targeted mutations)
   */
  mutateExpression(expr: Expression, depth: number = 0): Expression {
    return this.mutateExpr(expr, depth);
  }

  /**
   * Get record of all mutations applied
   */
  getMutations(): MutationRecord[] {
    return [...this.mutations];
  }

  /**
   * Reset mutation tracking
   */
  reset(): void {
    this.mutations = [];
    this.currentPath = [];
  }

  /**
   * Reseed the random generator
   */
  reseed(seed?: number): void {
    this.rng = new SeededRandom(seed);
  }

  // ---- Declaration Mutation ----

  private mutateDeclaration(decl: Declaration): Declaration {
    switch (decl.kind) {
      case 'FunctionDecl':
        return this.mutateFunction(decl);
      case 'GlobalVarDecl':
        // Frozen: uniforms
        if (this.config.frozenZones.uniforms && decl.addressSpace === 'uniform') {
          return decl;
        }
        return decl;
      case 'ConstDecl':
        return {
          ...decl,
          initializer: this.mutateExpr(decl.initializer, 0),
        };
      default:
        return decl;
    }
  }

  private mutateFunction(fn: FunctionDecl): FunctionDecl {
    // Don't mutate signatures if frozen
    if (this.config.frozenZones.signatures) {
      return {
        ...fn,
        body: this.mutateBlock(fn.body),
      };
    }

    return {
      ...fn,
      body: this.mutateBlock(fn.body),
    };
  }

  // ---- Statement Mutation ----

  private mutateBlock(block: BlockStmt): BlockStmt {
    return {
      kind: 'BlockStmt',
      statements: block.statements.map((stmt, i) => {
        this.currentPath.push(`stmt[${i}]`);
        const result = this.mutateStatement(stmt);
        this.currentPath.pop();
        return result;
      }),
    };
  }

  private mutateStatement(stmt: Statement): Statement {
    switch (stmt.kind) {
      case 'BlockStmt':
        return this.mutateBlock(stmt);

      case 'LetStmt':
        return {
          ...stmt,
          initializer: this.mutateExpr(stmt.initializer, 0),
        };

      case 'VarStmt':
        if (stmt.initializer) {
          return {
            ...stmt,
            initializer: this.mutateExpr(stmt.initializer, 0),
          };
        }
        return stmt;

      case 'AssignStmt':
        return {
          ...stmt,
          value: this.mutateExpr(stmt.value, 0),
        };

      case 'ForStmt':
        // Frozen zone check
        if (this.config.frozenZones.forLoops) {
          // Only mutate the body, not init/condition/update
          return {
            ...stmt,
            body: this.mutateBlock(stmt.body),
          };
        }
        return {
          ...stmt,
          init: stmt.init ? this.mutateStatement(stmt.init) : undefined,
          condition: stmt.condition ? this.mutateExpr(stmt.condition, 0) : undefined,
          update: stmt.update ? this.mutateStatement(stmt.update) : undefined,
          body: this.mutateBlock(stmt.body),
        };

      case 'WhileStmt':
        return {
          ...stmt,
          condition: this.mutateExpr(stmt.condition, 0),
          body: this.mutateBlock(stmt.body),
        };

      case 'IfStmt':
        return {
          ...stmt,
          condition: this.mutateExpr(stmt.condition, 0),
          consequent: this.mutateBlock(stmt.consequent),
          alternate: stmt.alternate
            ? stmt.alternate.kind === 'IfStmt'
              ? this.mutateStatement(stmt.alternate) as IfStmt
              : this.mutateBlock(stmt.alternate)
            : undefined,
        };

      case 'ReturnStmt':
        return {
          ...stmt,
          value: stmt.value ? this.mutateExpr(stmt.value, 0) : undefined,
        };

      case 'ExprStmt':
        return {
          ...stmt,
          expression: this.mutateExpr(stmt.expression, 0),
        };

      default:
        return stmt;
    }
  }

  // ---- Expression Mutation ----

  private mutateExpr(expr: Expression, depth: number): Expression {
    // Check depth limit
    if (depth > this.config.maxDepth) {
      return expr;
    }

    // Random chance to skip mutation
    if (!this.rng.chance(this.config.mutationProbability)) {
      return this.traverseExpr(expr, depth);
    }

    switch (expr.kind) {
      case 'LiteralExpr':
        if (this.config.mutations.literals) {
          return this.mutateLiteral(expr);
        }
        return expr;

      case 'IdentifierExpr':
        // Check if frozen
        if (this.config.frozenZones.identifiers.includes(expr.name)) {
          return expr;
        }
        return expr;

      case 'BinaryExpr':
        return this.mutateBinary(expr, depth);

      case 'UnaryExpr':
        return this.mutateUnary(expr, depth);

      case 'CallExpr':
        return this.mutateCall(expr, depth);

      case 'MemberExpr':
        return {
          ...expr,
          object: this.mutateExpr(expr.object, depth + 1),
        };

      case 'IndexExpr':
        return {
          ...expr,
          object: this.mutateExpr(expr.object, depth + 1),
          index: this.mutateExpr(expr.index, depth + 1),
        };

      case 'ParenExpr':
        return {
          ...expr,
          expression: this.mutateExpr(expr.expression, depth + 1),
        };

      default:
        return expr;
    }
  }

  private traverseExpr(expr: Expression, depth: number): Expression {
    // Traverse without mutation at this level
    switch (expr.kind) {
      case 'BinaryExpr':
        return {
          ...expr,
          left: this.mutateExpr(expr.left, depth + 1),
          right: this.mutateExpr(expr.right, depth + 1),
        };
      case 'UnaryExpr':
        return {
          ...expr,
          operand: this.mutateExpr(expr.operand, depth + 1),
        };
      case 'CallExpr':
        return {
          ...expr,
          args: expr.args.map(a => this.mutateExpr(a, depth + 1)),
        };
      case 'MemberExpr':
        return {
          ...expr,
          object: this.mutateExpr(expr.object, depth + 1),
        };
      case 'IndexExpr':
        return {
          ...expr,
          object: this.mutateExpr(expr.object, depth + 1),
          index: this.mutateExpr(expr.index, depth + 1),
        };
      case 'ParenExpr':
        return {
          ...expr,
          expression: this.mutateExpr(expr.expression, depth + 1),
        };
      default:
        return expr;
    }
  }

  // ---- Specific Mutations ----

  private mutateLiteral(expr: LiteralExpr): Expression {
    const oldValue = expr.raw;
    let newExpr: Expression;

    // Determine literal type and mutate accordingly
    if (expr.raw.includes('.') || expr.raw.endsWith('f')) {
      // Float
      const current = parseFloat(expr.raw);
      const mutation = this.rng.pick(['nudge', 'scale', 'replace', 'special']);

      switch (mutation) {
        case 'nudge':
          newExpr = B.lit(current + this.rng.range(-0.2, 0.2));
          break;
        case 'scale':
          newExpr = B.lit(current * this.rng.range(0.5, 2.0));
          break;
        case 'replace':
          newExpr = B.lit(this.rng.range(0, 1));
          break;
        case 'special':
          // Special values that often produce interesting results
          newExpr = B.lit(this.rng.pick([0, 0.5, 1, Math.PI, Math.E, 0.618]));
          break;
        default:
          newExpr = expr;
      }
    } else if (expr.raw.endsWith('u')) {
      // Unsigned int
      const current = parseInt(expr.raw);
      newExpr = B.lit(Math.max(0, current + Math.floor(this.rng.range(-2, 3))));
    } else {
      // Int
      const current = parseInt(expr.raw);
      newExpr = B.lit(current + Math.floor(this.rng.range(-2, 3)));
    }

    this.recordMutation('literal', oldValue, (newExpr as LiteralExpr).raw);
    return newExpr;
  }

  private mutateBinary(expr: BinaryExpr, depth: number): Expression {
    // Decide what to mutate
    const mutation = this.rng.pick([
      'operator',
      'swapOperands',
      'leftChild',
      'rightChild',
      'both',
    ]);

    switch (mutation) {
      case 'operator':
        if (this.config.mutations.operators) {
          return this.mutateOperator(expr);
        }
        break;

      case 'swapOperands':
        if (this.config.mutations.swapOperands) {
          this.recordMutation('swapOperands', 'a op b', 'b op a');
          return {
            ...expr,
            left: this.mutateExpr(expr.right, depth + 1),
            right: this.mutateExpr(expr.left, depth + 1),
          };
        }
        break;

      case 'leftChild':
        return {
          ...expr,
          left: this.mutateExpr(expr.left, depth + 1),
          right: this.traverseExpr(expr.right, depth + 1),
        };

      case 'rightChild':
        return {
          ...expr,
          left: this.traverseExpr(expr.left, depth + 1),
          right: this.mutateExpr(expr.right, depth + 1),
        };

      case 'both':
        return {
          ...expr,
          left: this.mutateExpr(expr.left, depth + 1),
          right: this.mutateExpr(expr.right, depth + 1),
        };
    }

    return this.traverseExpr(expr, depth);
  }

  private mutateOperator(expr: BinaryExpr): Expression {
    const oldOp = expr.operator;

    // Group operators by category for sensible swaps
    const arithmeticOps = ['+', '-', '*'];
    const comparisonOps = ['<', '>', '<=', '>=', '==', '!='];
    const logicalOps = ['&&', '||'];

    let newOp: string;

    if (arithmeticOps.includes(oldOp)) {
      newOp = this.rng.pick(arithmeticOps);
    } else if (comparisonOps.includes(oldOp)) {
      newOp = this.rng.pick(comparisonOps);
    } else if (logicalOps.includes(oldOp)) {
      newOp = this.rng.pick(logicalOps);
    } else {
      newOp = oldOp;
    }

    if (newOp !== oldOp) {
      this.recordMutation('operator', oldOp, newOp);
    }

    // Handle division specially (use safe division)
    if (newOp === '/' || (oldOp === '/' && this.rng.chance(0.5))) {
      return B.safeDiv(expr.left, expr.right);
    }

    return {
      ...expr,
      operator: newOp as BinaryOperator,
    };
  }

  private mutateUnary(expr: UnaryExpr, depth: number): Expression {
    if (this.config.mutations.unary && this.rng.chance(0.3)) {
      // Chance to remove unary operator
      this.recordMutation('unary', expr.operator, 'removed');
      return this.mutateExpr(expr.operand, depth + 1);
    }

    return {
      ...expr,
      operand: this.mutateExpr(expr.operand, depth + 1),
    };
  }

  private mutateCall(expr: CallExpr, depth: number): Expression {
    if (this.config.mutations.functions && this.rng.chance(0.4)) {
      return this.mutateCallFunction(expr, depth);
    }

    // Just mutate arguments
    return {
      ...expr,
      args: expr.args.map(a => this.mutateExpr(a, depth + 1)),
    };
  }

  private mutateCallFunction(expr: CallExpr, depth: number): Expression {
    const oldFunc = expr.callee;

    // Group functions by signature for valid swaps
    const unaryMathFuncs = ['sin', 'cos', 'tan', 'abs', 'fract', 'floor', 'ceil', 'sqrt', 'exp', 'log', 'saturate'];
    const binaryMathFuncs = ['min', 'max', 'pow', 'atan2', 'step'];
    const ternaryMathFuncs = ['mix', 'clamp', 'smoothstep'];

    let newFunc = oldFunc;
    let newArgs = expr.args;

    if (unaryMathFuncs.includes(oldFunc)) {
      newFunc = this.rng.pick(unaryMathFuncs);
      // Handle special cases
      if (newFunc === 'sqrt' || newFunc === 'log') {
        // Ensure positive input
        newArgs = [B.call('abs', this.mutateExpr(expr.args[0], depth + 1))];
      } else {
        newArgs = expr.args.map(a => this.mutateExpr(a, depth + 1));
      }
    } else if (binaryMathFuncs.includes(oldFunc) && expr.args.length === 2) {
      newFunc = this.rng.pick(binaryMathFuncs);
      // Handle pow specially
      if (newFunc === 'pow') {
        newArgs = [
          B.call('abs', this.mutateExpr(expr.args[0], depth + 1)),
          this.mutateExpr(expr.args[1], depth + 1),
        ];
      } else {
        newArgs = expr.args.map(a => this.mutateExpr(a, depth + 1));
      }
    } else if (ternaryMathFuncs.includes(oldFunc) && expr.args.length === 3) {
      newFunc = this.rng.pick(ternaryMathFuncs);
      // Use invariant-safe versions
      if (newFunc === 'smoothstep') {
        return B.smoothstep(
          this.mutateExpr(expr.args[0], depth + 1),
          this.mutateExpr(expr.args[1], depth + 1),
          this.mutateExpr(expr.args[2], depth + 1)
        );
      } else if (newFunc === 'clamp') {
        return B.clamp(
          this.mutateExpr(expr.args[0], depth + 1),
          this.mutateExpr(expr.args[1], depth + 1),
          this.mutateExpr(expr.args[2], depth + 1)
        );
      }
      newArgs = expr.args.map(a => this.mutateExpr(a, depth + 1));
    }

    if (newFunc !== oldFunc) {
      this.recordMutation('function', oldFunc, newFunc);
    }

    return B.call(newFunc, ...newArgs);
  }

  // ---- Mutation Recording ----

  private recordMutation(type: string, before: string, after: string): void {
    this.mutations.push({
      type,
      location: this.currentPath.join('.'),
      before,
      after,
    });
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Mutate a program with default settings
 */
export function mutate(program: Program, config?: Partial<MutatorConfig>): Program {
  return new ASTMutator(config).mutateProgram(program);
}

/**
 * Mutate with tracking - returns both result and mutation log
 */
export function mutateWithLog(
  program: Program,
  config?: Partial<MutatorConfig>
): { result: Program; mutations: MutationRecord[] } {
  const mutator = new ASTMutator(config);
  const result = mutator.mutateProgram(program);
  return {
    result,
    mutations: mutator.getMutations(),
  };
}

/**
 * Apply multiple rounds of mutation
 */
export function mutateRounds(
  program: Program,
  rounds: number,
  config?: Partial<MutatorConfig>
): Program {
  let result = program;
  const mutator = new ASTMutator(config);

  for (let i = 0; i < rounds; i++) {
    result = mutator.mutateProgram(result);
    mutator.reseed();
  }

  return result;
}
