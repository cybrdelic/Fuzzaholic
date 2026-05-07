/**
 * WGSL AST Emitter - v2 Clean Implementation
 *
 * Converts AST back to valid WGSL source code.
 * Pure structural traversal - no string manipulation hacks.
 *
 * Since we build AST with invariants enforced, emitted code is ALWAYS valid.
 */

import {
    AssignStmt,
    Attribute,
    BinaryExpr,
    BlockStmt,
    CallExpr,
    CompoundAssignStmt,
    ConstDecl,
    Declaration,
    Expression,
    ForStmt,
    FunctionDecl,
    GlobalVarDecl,
    IfStmt,
    IndexExpr,
    LetStmt,
    LiteralExpr,
    LoopStmt,
    MemberExpr,
    Parameter,
    Program,
    ReturnStmt,
    Statement,
    StructDecl,
    SwitchStmt,
    TypeAlias,
    TypeExpr,
    UnaryExpr,
    VarStmt,
    WhileStmt
} from './types';

// ============================================================================
// EMITTER OPTIONS
// ============================================================================

export interface EmitterOptions {
  /** Indentation string (default: '  ') */
  indent: string;
  /** Add newlines for readability (default: true) */
  pretty: boolean;
}

const DEFAULT_OPTIONS: EmitterOptions = {
  indent: '  ',
  pretty: true,
};

// ============================================================================
// EMITTER CLASS
// ============================================================================

export class Emitter {
  private options: EmitterOptions;
  private indentLevel: number = 0;

  constructor(options: Partial<EmitterOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Emit a complete program
   */
  emit(program: Program): string {
    return program.declarations
      .map(decl => this.emitDeclaration(decl))
      .join(this.options.pretty ? '\n\n' : '\n');
  }

  // ---- Helpers ----

  private getIndent(): string {
    return this.options.indent.repeat(this.indentLevel);
  }

  private nl(): string {
    return this.options.pretty ? '\n' : ' ';
  }

  // ---- Declarations ----

  private emitDeclaration(decl: Declaration): string {
    switch (decl.kind) {
      case 'FunctionDecl':
        return this.emitFunction(decl);
      case 'GlobalVarDecl':
        return this.emitGlobalVar(decl);
      case 'ConstDecl':
        return this.emitConst(decl);
      case 'StructDecl':
        return this.emitStruct(decl);
      case 'TypeAlias':
        return this.emitTypeAlias(decl);
      default:
        return '';
    }
  }

  private emitFunction(fn: FunctionDecl): string {
    let result = '';

    // Attributes
    for (const attr of fn.attributes) {
      result += this.emitAttribute(attr) + this.nl();
    }

    // Function signature
    result += `fn ${fn.name}(`;
    result += fn.params.map(p => this.emitParameter(p)).join(', ');
    result += ')';

    // Return type
    if (fn.returnType) {
      result += ' -> ';
      for (const attr of fn.returnAttributes) {
        result += this.emitAttribute(attr) + ' ';
      }
      result += this.emitType(fn.returnType);
    }

    result += ' ';
    result += this.emitBlock(fn.body);

    return result;
  }

  private emitParameter(param: Parameter): string {
    let result = '';
    for (const attr of param.attributes) {
      result += this.emitAttribute(attr) + ' ';
    }
    result += `${param.name}: ${this.emitType(param.type)}`;
    return result;
  }

  private emitAttribute(attr: Attribute): string {
    if (attr.args.length === 0) {
      return `@${attr.name}`;
    }
    const args = attr.args.map(a => this.emitExpression(a)).join(', ');
    return `@${attr.name}(${args})`;
  }

  private emitGlobalVar(v: GlobalVarDecl): string {
    let result = '';

    // Attributes
    for (const attr of v.attributes) {
      result += this.emitAttribute(attr) + ' ';
    }

    result += 'var';

    // Address space
    if (v.addressSpace) {
      result += `<${v.addressSpace}`;
      if (v.accessMode) {
        result += `, ${v.accessMode}`;
      }
      result += '>';
    }

    result += ` ${v.name}`;

    if (v.type) {
      result += `: ${this.emitType(v.type)}`;
    }

    if (v.initializer) {
      result += ` = ${this.emitExpression(v.initializer)}`;
    }

    result += ';';
    return result;
  }

  private emitConst(c: ConstDecl): string {
    let result = `const ${c.name}`;
    if (c.type) {
      result += `: ${this.emitType(c.type)}`;
    }
    result += ` = ${this.emitExpression(c.initializer)};`;
    return result;
  }

  private emitStruct(s: StructDecl): string {
    let result = `struct ${s.name} {${this.nl()}`;
    this.indentLevel++;

    for (const member of s.members) {
      result += this.getIndent();
      for (const attr of member.attributes) {
        result += this.emitAttribute(attr) + ' ';
      }
      result += `${member.name}: ${this.emitType(member.type)},${this.nl()}`;
    }

    this.indentLevel--;
    result += '}';
    return result;
  }

  private emitTypeAlias(t: TypeAlias): string {
    return `type ${t.name} = ${this.emitType(t.type)};`;
  }

  // ---- Types ----

  private emitType(type: TypeExpr): string {
    switch (type.kind) {
      case 'NamedTypeExpr':
        return type.name;
      case 'GenericTypeExpr':
        const args = type.args.map(a => this.emitType(a)).join(', ');
        return `${type.name}<${args}>`;
      case 'ArrayTypeExpr':
        if (type.size) {
          return `array<${this.emitType(type.element)}, ${this.emitExpression(type.size)}>`;
        }
        return `array<${this.emitType(type.element)}>`;
      default:
        return 'unknown';
    }
  }

  // ---- Statements ----

  private emitStatement(stmt: Statement): string {
    switch (stmt.kind) {
      case 'BlockStmt':
        return this.emitBlock(stmt);
      case 'LetStmt':
        return this.emitLet(stmt);
      case 'VarStmt':
        return this.emitVar(stmt);
      case 'AssignStmt':
        return this.emitAssign(stmt);
      case 'CompoundAssignStmt':
        return this.emitCompoundAssign(stmt);
      case 'IncrementStmt':
        return `${this.emitExpression(stmt.operand)}++;`;
      case 'DecrementStmt':
        return `${this.emitExpression(stmt.operand)}--;`;
      case 'IfStmt':
        return this.emitIf(stmt);
      case 'ForStmt':
        return this.emitFor(stmt);
      case 'WhileStmt':
        return this.emitWhile(stmt);
      case 'LoopStmt':
        return this.emitLoop(stmt);
      case 'SwitchStmt':
        return this.emitSwitch(stmt);
      case 'BreakStmt':
        return 'break;';
      case 'ContinueStmt':
        return 'continue;';
      case 'ReturnStmt':
        return this.emitReturn(stmt);
      case 'DiscardStmt':
        return 'discard;';
      case 'ExprStmt':
        return `${this.emitExpression(stmt.expression)};`;
      default:
        return '';
    }
  }

  private emitBlock(block: BlockStmt): string {
    let result = '{' + this.nl();
    this.indentLevel++;

    for (const stmt of block.statements) {
      result += this.getIndent() + this.emitStatement(stmt) + this.nl();
    }

    this.indentLevel--;
    result += this.getIndent() + '}';
    return result;
  }

  private emitLet(stmt: LetStmt): string {
    let result = `let ${stmt.name}`;
    if (stmt.type) {
      result += `: ${this.emitType(stmt.type)}`;
    }
    result += ` = ${this.emitExpression(stmt.initializer)};`;
    return result;
  }

  private emitVar(stmt: VarStmt): string {
    let result = `var ${stmt.name}`;
    if (stmt.type) {
      result += `: ${this.emitType(stmt.type)}`;
    }
    if (stmt.initializer) {
      result += ` = ${this.emitExpression(stmt.initializer)}`;
    }
    result += ';';
    return result;
  }

  private emitAssign(stmt: AssignStmt): string {
    return `${this.emitExpression(stmt.target)} = ${this.emitExpression(stmt.value)};`;
  }

  private emitCompoundAssign(stmt: CompoundAssignStmt): string {
    return `${this.emitExpression(stmt.target)} ${stmt.operator} ${this.emitExpression(stmt.value)};`;
  }

  private emitIf(stmt: IfStmt): string {
    let result = `if (${this.emitExpression(stmt.condition)}) `;
    result += this.emitBlock(stmt.consequent);

    if (stmt.alternate) {
      result += ' else ';
      if (stmt.alternate.kind === 'IfStmt') {
        result += this.emitIf(stmt.alternate);
      } else {
        result += this.emitBlock(stmt.alternate);
      }
    }

    return result;
  }

  private emitFor(stmt: ForStmt): string {
    let result = 'for (';

    if (stmt.init) {
      result += this.emitForInit(stmt.init);
    }
    result += '; ';

    if (stmt.condition) {
      result += this.emitExpression(stmt.condition);
    }
    result += '; ';

    if (stmt.update) {
      result += this.emitForUpdate(stmt.update);
    }

    result += ') ';
    result += this.emitBlock(stmt.body);
    return result;
  }

  private emitForInit(stmt: Statement): string {
    switch (stmt.kind) {
      case 'LetStmt':
        let result = `let ${stmt.name}`;
        if (stmt.type) {
          result += `: ${this.emitType(stmt.type)}`;
        }
        result += ` = ${this.emitExpression(stmt.initializer)}`;
        return result;
      case 'VarStmt':
        let vresult = `var ${stmt.name}`;
        if (stmt.type) {
          vresult += `: ${this.emitType(stmt.type)}`;
        }
        if (stmt.initializer) {
          vresult += ` = ${this.emitExpression(stmt.initializer)}`;
        }
        return vresult;
      case 'AssignStmt':
        return `${this.emitExpression(stmt.target)} = ${this.emitExpression(stmt.value)}`;
      default:
        return '';
    }
  }

  private emitForUpdate(stmt: Statement): string {
    switch (stmt.kind) {
      case 'IncrementStmt':
        return `${this.emitExpression(stmt.operand)}++`;
      case 'DecrementStmt':
        return `${this.emitExpression(stmt.operand)}--`;
      case 'AssignStmt':
        return `${this.emitExpression(stmt.target)} = ${this.emitExpression(stmt.value)}`;
      case 'CompoundAssignStmt':
        return `${this.emitExpression(stmt.target)} ${stmt.operator} ${this.emitExpression(stmt.value)}`;
      default:
        return '';
    }
  }

  private emitWhile(stmt: WhileStmt): string {
    return `while (${this.emitExpression(stmt.condition)}) ${this.emitBlock(stmt.body)}`;
  }

  private emitLoop(stmt: LoopStmt): string {
    let result = `loop ${this.emitBlock(stmt.body)}`;
    if (stmt.continuing) {
      result += ` continuing ${this.emitBlock(stmt.continuing)}`;
    }
    return result;
  }

  private emitSwitch(stmt: SwitchStmt): string {
    let result = `switch (${this.emitExpression(stmt.selector)}) {${this.nl()}`;
    this.indentLevel++;

    for (const c of stmt.cases) {
      result += this.getIndent();
      if (c.isDefault) {
        result += 'default';
      } else {
        result += 'case ' + c.selectors.map(s => this.emitExpression(s)).join(', ');
      }
      result += ': ' + this.emitBlock(c.body) + this.nl();
    }

    this.indentLevel--;
    result += this.getIndent() + '}';
    return result;
  }

  private emitReturn(stmt: ReturnStmt): string {
    if (stmt.value) {
      return `return ${this.emitExpression(stmt.value)};`;
    }
    return 'return;';
  }

  // ---- Expressions ----

  private emitExpression(expr: Expression): string {
    switch (expr.kind) {
      case 'BinaryExpr':
        return this.emitBinary(expr);
      case 'UnaryExpr':
        return this.emitUnary(expr);
      case 'CallExpr':
        return this.emitCall(expr);
      case 'MemberExpr':
        return this.emitMember(expr);
      case 'IndexExpr':
        return this.emitIndex(expr);
      case 'LiteralExpr':
        return this.emitLiteral(expr);
      case 'IdentifierExpr':
        return expr.name;
      case 'ParenExpr':
        return `(${this.emitExpression(expr.expression)})`;
      default:
        return '';
    }
  }

  private emitBinary(expr: BinaryExpr): string {
    const left = this.emitExpressionWithParens(expr.left, expr);
    const right = this.emitExpressionWithParens(expr.right, expr);
    return `${left} ${expr.operator} ${right}`;
  }

  private emitExpressionWithParens(child: Expression, parent: BinaryExpr): string {
    // Add parentheses if needed for correct precedence
    if (child.kind === 'BinaryExpr') {
      const childPrec = this.getPrecedence(child.operator);
      const parentPrec = this.getPrecedence(parent.operator);
      if (childPrec < parentPrec) {
        return `(${this.emitExpression(child)})`;
      }
    }
    return this.emitExpression(child);
  }

  private getPrecedence(op: string): number {
    switch (op) {
      case '||': return 1;
      case '&&': return 2;
      case '|': return 3;
      case '^': return 4;
      case '&': return 5;
      case '==': case '!=': return 6;
      case '<': case '>': case '<=': case '>=': return 7;
      case '<<': case '>>': return 8;
      case '+': case '-': return 9;
      case '*': case '/': case '%': return 10;
      default: return 0;
    }
  }

  private emitUnary(expr: UnaryExpr): string {
    return `${expr.operator}${this.emitExpression(expr.operand)}`;
  }

  private emitCall(expr: CallExpr): string {
    const args = expr.args.map(a => this.emitExpression(a)).join(', ');
    return `${expr.callee}(${args})`;
  }

  private emitMember(expr: MemberExpr): string {
    const object = expr.object.kind === 'BinaryExpr'
      ? `(${this.emitExpression(expr.object)})`
      : this.emitExpression(expr.object);
    return `${object}.${expr.member}`;
  }

  private emitIndex(expr: IndexExpr): string {
    return `${this.emitExpression(expr.object)}[${this.emitExpression(expr.index)}]`;
  }

  private emitLiteral(expr: LiteralExpr): string {
    // Use the raw representation to preserve formatting
    return expr.raw;
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Emit an AST Program to WGSL source code
 */
export function emit(program: Program, options?: Partial<EmitterOptions>): string {
  return new Emitter(options).emit(program);
}

/**
 * Emit a single expression to WGSL
 */
export function emitExpr(expr: Expression, options?: Partial<EmitterOptions>): string {
  const emitter = new Emitter(options);
  return (emitter as any).emitExpression(expr);
}

/**
 * Emit a single statement to WGSL
 */
export function emitStmt(stmt: Statement, options?: Partial<EmitterOptions>): string {
  const emitter = new Emitter(options);
  return (emitter as any).emitStatement(stmt);
}
