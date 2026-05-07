/**
 * WGSL AST PARSER
 *
 * A proper Abstract Syntax Tree parser for WGSL that builds a tree representation
 * of the shader code. This enables:
 * - Structural understanding of the code
 * - Safe mutations that respect syntax
 * - Context-aware transformations
 * - Type-aware operations
 */

import { Token, TokenType, WGSLLexer } from './wgslParser';

// ============================================================================
// AST NODE TYPES
// ============================================================================

export interface SourceLocation {
  start: number;
  end: number;
  line: number;
  column: number;
}

// Base node type
export interface ASTNode {
  type: string;
  loc: SourceLocation;
}

// ============================================================================
// TOP-LEVEL DECLARATIONS
// ============================================================================

export interface Program extends ASTNode {
  type: 'Program';
  declarations: Declaration[];
}

export type Declaration =
  | FunctionDecl
  | StructDecl
  | VarDecl
  | ConstDecl
  | TypeAlias
  | OverrideDecl;

export interface Attribute extends ASTNode {
  type: 'Attribute';
  name: string;
  args: Expression[];
}

export interface FunctionDecl extends ASTNode {
  type: 'FunctionDecl';
  name: string;
  attributes: Attribute[];
  params: Parameter[];
  returnType: TypeExpr | null;
  returnAttributes: Attribute[];
  body: BlockStatement;
}

export interface Parameter extends ASTNode {
  type: 'Parameter';
  name: string;
  attributes: Attribute[];
  paramType: TypeExpr;
}

export interface StructDecl extends ASTNode {
  type: 'StructDecl';
  name: string;
  members: StructMember[];
}

export interface StructMember extends ASTNode {
  type: 'StructMember';
  name: string;
  attributes: Attribute[];
  memberType: TypeExpr;
}

export interface VarDecl extends ASTNode {
  type: 'VarDecl';
  attributes: Attribute[];
  name: string;
  addressSpace: string | null;  // uniform, storage, private, etc.
  accessMode: string | null;    // read, write, read_write
  varType: TypeExpr | null;
  initializer: Expression | null;
}

export interface ConstDecl extends ASTNode {
  type: 'ConstDecl';
  name: string;
  constType: TypeExpr | null;
  initializer: Expression;
}

export interface OverrideDecl extends ASTNode {
  type: 'OverrideDecl';
  attributes: Attribute[];
  name: string;
  overrideType: TypeExpr | null;
  initializer: Expression | null;
}

export interface TypeAlias extends ASTNode {
  type: 'TypeAlias';
  name: string;
  aliasType: TypeExpr;
}

// ============================================================================
// TYPE EXPRESSIONS
// ============================================================================

export type TypeExpr =
  | NamedType
  | GenericType
  | ArrayType
  | PointerType;

export interface NamedType extends ASTNode {
  type: 'NamedType';
  name: string;
}

export interface GenericType extends ASTNode {
  type: 'GenericType';
  name: string;
  args: TypeExpr[];
}

export interface ArrayType extends ASTNode {
  type: 'ArrayType';
  elementType: TypeExpr;
  size: Expression | null;  // null for runtime-sized arrays
}

export interface PointerType extends ASTNode {
  type: 'PointerType';
  addressSpace: string;
  pointeeType: TypeExpr;
  accessMode: string | null;
}

// ============================================================================
// STATEMENTS
// ============================================================================

export type Statement =
  | BlockStatement
  | LetStatement
  | VarStatement
  | AssignmentStatement
  | CompoundAssignmentStatement
  | IncrementStatement
  | DecrementStatement
  | IfStatement
  | ForStatement
  | WhileStatement
  | LoopStatement
  | SwitchStatement
  | BreakStatement
  | ContinueStatement
  | ReturnStatement
  | DiscardStatement
  | ExpressionStatement;

export interface BlockStatement extends ASTNode {
  type: 'BlockStatement';
  statements: Statement[];
}

export interface LetStatement extends ASTNode {
  type: 'LetStatement';
  name: string;
  letType: TypeExpr | null;
  initializer: Expression;
}

export interface VarStatement extends ASTNode {
  type: 'VarStatement';
  name: string;
  varType: TypeExpr | null;
  initializer: Expression | null;
}

export interface AssignmentStatement extends ASTNode {
  type: 'AssignmentStatement';
  target: Expression;
  value: Expression;
}

export interface CompoundAssignmentStatement extends ASTNode {
  type: 'CompoundAssignmentStatement';
  operator: string;  // +=, -=, *=, /=, %=, etc.
  target: Expression;
  value: Expression;
}

export interface IncrementStatement extends ASTNode {
  type: 'IncrementStatement';
  operand: Expression;
}

export interface DecrementStatement extends ASTNode {
  type: 'DecrementStatement';
  operand: Expression;
}

export interface IfStatement extends ASTNode {
  type: 'IfStatement';
  condition: Expression;
  consequent: BlockStatement;
  alternate: BlockStatement | IfStatement | null;
}

export interface ForStatement extends ASTNode {
  type: 'ForStatement';
  init: Statement | null;
  condition: Expression | null;
  update: Statement | null;
  body: BlockStatement;
}

export interface WhileStatement extends ASTNode {
  type: 'WhileStatement';
  condition: Expression;
  body: BlockStatement;
}

export interface LoopStatement extends ASTNode {
  type: 'LoopStatement';
  body: BlockStatement;
  continuing: BlockStatement | null;
}

export interface SwitchStatement extends ASTNode {
  type: 'SwitchStatement';
  selector: Expression;
  cases: SwitchCase[];
}

export interface SwitchCase extends ASTNode {
  type: 'SwitchCase';
  selectors: Expression[];  // empty for default
  isDefault: boolean;
  body: BlockStatement;
}

export interface BreakStatement extends ASTNode {
  type: 'BreakStatement';
}

export interface ContinueStatement extends ASTNode {
  type: 'ContinueStatement';
}

export interface ReturnStatement extends ASTNode {
  type: 'ReturnStatement';
  value: Expression | null;
}

export interface DiscardStatement extends ASTNode {
  type: 'DiscardStatement';
}

export interface ExpressionStatement extends ASTNode {
  type: 'ExpressionStatement';
  expression: Expression;
}

// ============================================================================
// EXPRESSIONS
// ============================================================================

export type Expression =
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | MemberExpression
  | IndexExpression
  | Literal
  | Identifier
  | ParenExpression;

export interface BinaryExpression extends ASTNode {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression extends ASTNode {
  type: 'UnaryExpression';
  operator: string;
  operand: Expression;
  prefix: boolean;
}

export interface CallExpression extends ASTNode {
  type: 'CallExpression';
  callee: string;
  args: Expression[];
}

export interface MemberExpression extends ASTNode {
  type: 'MemberExpression';
  object: Expression;
  property: string;
}

export interface IndexExpression extends ASTNode {
  type: 'IndexExpression';
  object: Expression;
  index: Expression;
}

export interface Literal extends ASTNode {
  type: 'Literal';
  value: number | boolean;
  raw: string;
  literalType: 'int' | 'uint' | 'float' | 'bool';
}

export interface Identifier extends ASTNode {
  type: 'Identifier';
  name: string;
}

export interface ParenExpression extends ASTNode {
  type: 'ParenExpression';
  expression: Expression;
}

// ============================================================================
// PARSER
// ============================================================================

export class WGSLASTParser {
  private tokens: Token[] = [];
  private pos: number = 0;
  private source: string;

  constructor(source: string) {
    this.source = source;
    const lexer = new WGSLLexer(source);
    this.tokens = lexer.tokenize();
  }

  // ---- Token Navigation ----

  private current(): Token | null {
    return this.tokens[this.pos] || null;
  }

  private peek(offset: number = 0): Token | null {
    return this.tokens[this.pos + offset] || null;
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private skipWS(): void {
    while (!this.isAtEnd()) {
      const t = this.current();
      if (t && (t.type === 'whitespace' || t.type === 'comment')) {
        this.advance();
      } else {
        break;
      }
    }
  }

  private currentNonWS(): Token | null {
    this.skipWS();
    return this.current();
  }

  private check(type: TokenType, value?: string): boolean {
    const t = this.currentNonWS();
    if (!t) return false;
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }

  private match(type: TokenType, value?: string): Token | null {
    if (this.check(type, value)) {
      return this.advance();
    }
    return null;
  }

  private expect(type: TokenType, value?: string): Token {
    this.skipWS();
    const t = this.current();
    if (!t) {
      throw new Error(`Unexpected end of input, expected ${type}${value ? ` '${value}'` : ''}`);
    }
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${type}${value ? ` '${value}'` : ''}, got ${t.type} '${t.value}' at line ${t.line}`);
    }
    return this.advance();
  }

  private makeLoc(start: Token, end?: Token): SourceLocation {
    const endToken = end || start;
    return {
      start: start.start,
      end: endToken.end,
      line: start.line,
      column: start.column
    };
  }

  // ---- Parsing ----

  parse(): Program {
    const declarations: Declaration[] = [];

    while (!this.isAtEnd()) {
      this.skipWS();
      if (this.isAtEnd()) break;

      try {
        const decl = this.parseDeclaration();
        if (decl) declarations.push(decl);
      } catch (e) {
        // Skip to next declaration on error (silent - quality analysis handles this)
        this.skipToNextDeclaration();
      }
    }

    return {
      type: 'Program',
      declarations,
      loc: declarations.length > 0
        ? { ...declarations[0].loc, end: declarations[declarations.length - 1].loc.end }
        : { start: 0, end: 0, line: 1, column: 1 }
    };
  }

  private skipToNextDeclaration(): void {
    while (!this.isAtEnd()) {
      const t = this.current();
      if (!t) break;

      // Look for declaration keywords
      if (t.type === 'ident' && ['fn', 'struct', 'var', 'let', 'const', 'type', 'override'].includes(t.value)) {
        break;
      }
      if (t.type === 'at') {
        break;
      }
      this.advance();
    }
  }

  private parseDeclaration(): Declaration | null {
    // Collect attributes
    const attributes: Attribute[] = [];
    while (this.check('at')) {
      attributes.push(this.parseAttribute());
    }

    const t = this.currentNonWS();
    if (!t || t.type !== 'ident') return null;

    switch (t.value) {
      case 'fn':
        return this.parseFunctionDecl(attributes);
      case 'struct':
        return this.parseStructDecl();
      case 'var':
        return this.parseGlobalVarDecl(attributes);
      case 'let':
      case 'const':
        return this.parseConstDecl();
      case 'type':
        return this.parseTypeAlias();
      case 'override':
        return this.parseOverrideDecl(attributes);
      default:
        // Unknown, skip token
        this.advance();
        return null;
    }
  }

  private parseAttribute(): Attribute {
    const at = this.expect('at');
    const name = this.expect('ident');
    const args: Expression[] = [];

    if (this.check('lparen')) {
      this.advance();
      if (!this.check('rparen')) {
        args.push(this.parseExpression());
        while (this.match('comma')) {
          args.push(this.parseExpression());
        }
      }
      const rparen = this.expect('rparen');
      return {
        type: 'Attribute',
        name: name.value,
        args,
        loc: this.makeLoc(at, rparen)
      };
    }

    return {
      type: 'Attribute',
      name: name.value,
      args,
      loc: this.makeLoc(at, name)
    };
  }

  private parseFunctionDecl(attributes: Attribute[]): FunctionDecl {
    const fn = this.expect('ident', 'fn');
    const name = this.expect('ident');

    // Parameters
    this.expect('lparen');
    const params: Parameter[] = [];
    if (!this.check('rparen')) {
      params.push(this.parseParameter());
      while (this.match('comma')) {
        params.push(this.parseParameter());
      }
    }
    this.expect('rparen');

    // Return type
    let returnType: TypeExpr | null = null;
    const returnAttributes: Attribute[] = [];
    if (this.check('arrow')) {
      this.advance();
      // Return attributes
      while (this.check('at')) {
        returnAttributes.push(this.parseAttribute());
      }
      returnType = this.parseType();
    }

    // Body
    const body = this.parseBlock();

    return {
      type: 'FunctionDecl',
      name: name.value,
      attributes,
      params,
      returnType,
      returnAttributes,
      body,
      loc: this.makeLoc(attributes[0] ? this.tokens[0] : fn, this.tokens[this.pos - 1])
    };
  }

  private parseParameter(): Parameter {
    const attributes: Attribute[] = [];
    while (this.check('at')) {
      attributes.push(this.parseAttribute());
    }

    const name = this.expect('ident');
    this.expect('colon');
    const paramType = this.parseType();

    return {
      type: 'Parameter',
      name: name.value,
      attributes,
      paramType,
      loc: this.makeLoc(attributes[0] ? this.tokens[0] : name)
    };
  }

  private parseStructDecl(): StructDecl {
    const struct = this.expect('ident', 'struct');
    const name = this.expect('ident');
    this.expect('lbrace');

    const members: StructMember[] = [];
    while (!this.check('rbrace') && !this.isAtEnd()) {
      members.push(this.parseStructMember());
      // Optional comma/semicolon between members
      this.match('comma');
    }

    const rbrace = this.expect('rbrace');

    return {
      type: 'StructDecl',
      name: name.value,
      members,
      loc: this.makeLoc(struct, rbrace)
    };
  }

  private parseStructMember(): StructMember {
    const attributes: Attribute[] = [];
    while (this.check('at')) {
      attributes.push(this.parseAttribute());
    }

    const name = this.expect('ident');
    this.expect('colon');
    const memberType = this.parseType();

    return {
      type: 'StructMember',
      name: name.value,
      attributes,
      memberType,
      loc: this.makeLoc(attributes[0] ? this.tokens[0] : name)
    };
  }

  private parseGlobalVarDecl(attributes: Attribute[]): VarDecl {
    const varTok = this.expect('ident', 'var');

    let addressSpace: string | null = null;
    let accessMode: string | null = null;

    // <address_space, access_mode>
    if (this.check('langle')) {
      this.advance();
      const first = this.expect('ident');
      addressSpace = first.value;
      if (this.match('comma')) {
        const second = this.expect('ident');
        accessMode = second.value;
      }
      this.expect('rangle');
    }

    const name = this.expect('ident');

    let varType: TypeExpr | null = null;
    if (this.check('colon')) {
      this.advance();
      varType = this.parseType();
    }

    let initializer: Expression | null = null;
    if (this.check('assignment', '=')) {
      this.advance();
      initializer = this.parseExpression();
    }

    const semi = this.expect('semicolon');

    return {
      type: 'VarDecl',
      attributes,
      name: name.value,
      addressSpace,
      accessMode,
      varType,
      initializer,
      loc: this.makeLoc(attributes[0] ? this.tokens[0] : varTok, semi)
    };
  }

  private parseConstDecl(): ConstDecl {
    const constTok = this.advance(); // 'const' or 'let'
    const name = this.expect('ident');

    let constType: TypeExpr | null = null;
    if (this.check('colon')) {
      this.advance();
      constType = this.parseType();
    }

    this.expect('assignment', '=');
    const initializer = this.parseExpression();
    const semi = this.expect('semicolon');

    return {
      type: 'ConstDecl',
      name: name.value,
      constType,
      initializer,
      loc: this.makeLoc(constTok, semi)
    };
  }

  private parseTypeAlias(): TypeAlias {
    const typeTok = this.expect('ident', 'type');
    const name = this.expect('ident');
    this.expect('assignment', '=');
    const aliasType = this.parseType();
    const semi = this.expect('semicolon');

    return {
      type: 'TypeAlias',
      name: name.value,
      aliasType,
      loc: this.makeLoc(typeTok, semi)
    };
  }

  private parseOverrideDecl(attributes: Attribute[]): OverrideDecl {
    const override = this.expect('ident', 'override');
    const name = this.expect('ident');

    let overrideType: TypeExpr | null = null;
    if (this.check('colon')) {
      this.advance();
      overrideType = this.parseType();
    }

    let initializer: Expression | null = null;
    if (this.check('assignment', '=')) {
      this.advance();
      initializer = this.parseExpression();
    }

    const semi = this.expect('semicolon');

    return {
      type: 'OverrideDecl',
      attributes,
      name: name.value,
      overrideType,
      initializer,
      loc: this.makeLoc(override, semi)
    };
  }

  // ---- Types ----

  private parseType(): TypeExpr {
    const name = this.expect('ident');

    // Check for array type
    if (name.value === 'array') {
      this.expect('langle');
      const elementType = this.parseType();
      let size: Expression | null = null;
      if (this.match('comma')) {
        size = this.parseExpression();
      }
      const rangle = this.expect('rangle');
      return {
        type: 'ArrayType',
        elementType,
        size,
        loc: this.makeLoc(name, rangle)
      };
    }

    // Check for pointer type
    if (name.value === 'ptr') {
      this.expect('langle');
      const addressSpace = this.expect('ident').value;
      this.expect('comma');
      const pointeeType = this.parseType();
      let accessMode: string | null = null;
      if (this.match('comma')) {
        accessMode = this.expect('ident').value;
      }
      const rangle = this.expect('rangle');
      return {
        type: 'PointerType',
        addressSpace,
        pointeeType,
        accessMode,
        loc: this.makeLoc(name, rangle)
      };
    }

    // Check for generic type
    if (this.check('langle')) {
      this.advance();
      const args: TypeExpr[] = [this.parseType()];
      while (this.match('comma')) {
        args.push(this.parseType());
      }
      const rangle = this.expect('rangle');
      return {
        type: 'GenericType',
        name: name.value,
        args,
        loc: this.makeLoc(name, rangle)
      };
    }

    // Simple named type
    return {
      type: 'NamedType',
      name: name.value,
      loc: this.makeLoc(name)
    };
  }

  // ---- Statements ----

  private parseBlock(): BlockStatement {
    const lbrace = this.expect('lbrace');
    const statements: Statement[] = [];

    while (!this.check('rbrace') && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }

    const rbrace = this.expect('rbrace');

    return {
      type: 'BlockStatement',
      statements,
      loc: this.makeLoc(lbrace, rbrace)
    };
  }

  private parseStatement(): Statement | null {
    this.skipWS();
    const t = this.currentNonWS();
    if (!t) return null;

    // Keywords
    if (t.type === 'ident') {
      switch (t.value) {
        case 'let':
          return this.parseLetStatement();
        case 'var':
          return this.parseVarStatement();
        case 'if':
          return this.parseIfStatement();
        case 'for':
          return this.parseForStatement();
        case 'while':
          return this.parseWhileStatement();
        case 'loop':
          return this.parseLoopStatement();
        case 'switch':
          return this.parseSwitchStatement();
        case 'break':
          return this.parseBreakStatement();
        case 'continue':
          return this.parseContinueStatement();
        case 'return':
          return this.parseReturnStatement();
        case 'discard':
          return this.parseDiscardStatement();
      }
    }

    // Block
    if (t.type === 'lbrace') {
      return this.parseBlock();
    }

    // Expression statement (or assignment)
    return this.parseExpressionStatement();
  }

  private parseLetStatement(): LetStatement {
    const letTok = this.expect('ident', 'let');
    const name = this.expect('ident');

    let letType: TypeExpr | null = null;
    if (this.check('colon')) {
      this.advance();
      letType = this.parseType();
    }

    this.expect('assignment', '=');
    const initializer = this.parseExpression();
    const semi = this.expect('semicolon');

    return {
      type: 'LetStatement',
      name: name.value,
      letType,
      initializer,
      loc: this.makeLoc(letTok, semi)
    };
  }

  private parseVarStatement(): VarStatement {
    const varTok = this.expect('ident', 'var');
    const name = this.expect('ident');

    let varType: TypeExpr | null = null;
    if (this.check('colon')) {
      this.advance();
      varType = this.parseType();
    }

    let initializer: Expression | null = null;
    if (this.check('assignment', '=')) {
      this.advance();
      initializer = this.parseExpression();
    }

    const semi = this.expect('semicolon');

    return {
      type: 'VarStatement',
      name: name.value,
      varType,
      initializer,
      loc: this.makeLoc(varTok, semi)
    };
  }

  private parseIfStatement(): IfStatement {
    const ifTok = this.expect('ident', 'if');

    // Condition can be in parens or not
    let condition: Expression;
    if (this.check('lparen')) {
      this.advance();
      condition = this.parseExpression();
      this.expect('rparen');
    } else {
      condition = this.parseExpression();
    }

    const consequent = this.parseBlock();

    let alternate: BlockStatement | IfStatement | null = null;
    if (this.check('ident', 'else')) {
      this.advance();
      if (this.check('ident', 'if')) {
        alternate = this.parseIfStatement();
      } else {
        alternate = this.parseBlock();
      }
    }

    return {
      type: 'IfStatement',
      condition,
      consequent,
      alternate,
      loc: this.makeLoc(ifTok)
    };
  }

  private parseForStatement(): ForStatement {
    const forTok = this.expect('ident', 'for');
    this.expect('lparen');

    let init: Statement | null = null;
    if (!this.check('semicolon')) {
      init = this.parseForInit();
    }
    this.expect('semicolon');

    let condition: Expression | null = null;
    if (!this.check('semicolon')) {
      condition = this.parseExpression();
    }
    this.expect('semicolon');

    let update: Statement | null = null;
    if (!this.check('rparen')) {
      update = this.parseForUpdate();
    }
    this.expect('rparen');

    const body = this.parseBlock();

    return {
      type: 'ForStatement',
      init,
      condition,
      update,
      body,
      loc: this.makeLoc(forTok)
    };
  }

  private parseForInit(): Statement {
    const t = this.currentNonWS();
    if (t && t.type === 'ident' && (t.value === 'let' || t.value === 'var')) {
      if (t.value === 'let') {
        return this.parseLetStatementNoSemi();
      } else {
        return this.parseVarStatementNoSemi();
      }
    }
    return this.parseExpressionStatementNoSemi();
  }

  private parseForUpdate(): Statement {
    return this.parseExpressionStatementNoSemi();
  }

  private parseLetStatementNoSemi(): LetStatement {
    const letTok = this.expect('ident', 'let');
    const name = this.expect('ident');

    let letType: TypeExpr | null = null;
    if (this.check('colon')) {
      this.advance();
      letType = this.parseType();
    }

    this.expect('assignment', '=');
    const initializer = this.parseExpression();

    return {
      type: 'LetStatement',
      name: name.value,
      letType,
      initializer,
      loc: this.makeLoc(letTok)
    };
  }

  private parseVarStatementNoSemi(): VarStatement {
    const varTok = this.expect('ident', 'var');
    const name = this.expect('ident');

    let varType: TypeExpr | null = null;
    if (this.check('colon')) {
      this.advance();
      varType = this.parseType();
    }

    let initializer: Expression | null = null;
    if (this.check('assignment', '=')) {
      this.advance();
      initializer = this.parseExpression();
    }

    return {
      type: 'VarStatement',
      name: name.value,
      varType,
      initializer,
      loc: this.makeLoc(varTok)
    };
  }

  private parseExpressionStatementNoSemi(): Statement {
    const expr = this.parseExpression();

    // Check for increment/decrement
    if (this.check('increment')) {
      const op = this.advance();
      if (op.value === '++') {
        return { type: 'IncrementStatement', operand: expr, loc: this.makeLoc(this.tokens[this.pos - 1]) };
      } else {
        return { type: 'DecrementStatement', operand: expr, loc: this.makeLoc(this.tokens[this.pos - 1]) };
      }
    }

    // Check for assignment
    if (this.check('assignment')) {
      const op = this.advance();
      if (op.value === '=') {
        const value = this.parseExpression();
        return { type: 'AssignmentStatement', target: expr, value, loc: this.makeLoc(this.tokens[this.pos - 1]) };
      } else {
        const value = this.parseExpression();
        return { type: 'CompoundAssignmentStatement', operator: op.value, target: expr, value, loc: this.makeLoc(this.tokens[this.pos - 1]) };
      }
    }

    return { type: 'ExpressionStatement', expression: expr, loc: expr.loc };
  }

  private parseWhileStatement(): WhileStatement {
    const whileTok = this.expect('ident', 'while');
    const condition = this.parseExpression();
    const body = this.parseBlock();

    return {
      type: 'WhileStatement',
      condition,
      body,
      loc: this.makeLoc(whileTok)
    };
  }

  private parseLoopStatement(): LoopStatement {
    const loopTok = this.expect('ident', 'loop');
    const body = this.parseBlock();

    let continuing: BlockStatement | null = null;
    if (this.check('ident', 'continuing')) {
      this.advance();
      continuing = this.parseBlock();
    }

    return {
      type: 'LoopStatement',
      body,
      continuing,
      loc: this.makeLoc(loopTok)
    };
  }

  private parseSwitchStatement(): SwitchStatement {
    const switchTok = this.expect('ident', 'switch');
    const selector = this.parseExpression();
    this.expect('lbrace');

    const cases: SwitchCase[] = [];
    while (!this.check('rbrace') && !this.isAtEnd()) {
      cases.push(this.parseSwitchCase());
    }

    this.expect('rbrace');

    return {
      type: 'SwitchStatement',
      selector,
      cases,
      loc: this.makeLoc(switchTok)
    };
  }

  private parseSwitchCase(): SwitchCase {
    const caseTok = this.expect('ident'); // 'case' or 'default'
    const isDefault = caseTok.value === 'default';

    const selectors: Expression[] = [];
    if (!isDefault) {
      selectors.push(this.parseExpression());
      while (this.match('comma')) {
        selectors.push(this.parseExpression());
      }
    }

    this.expect('colon');
    const body = this.parseBlock();

    return {
      type: 'SwitchCase',
      selectors,
      isDefault,
      body,
      loc: this.makeLoc(caseTok)
    };
  }

  private parseBreakStatement(): BreakStatement {
    const breakTok = this.expect('ident', 'break');
    const semi = this.expect('semicolon');
    return { type: 'BreakStatement', loc: this.makeLoc(breakTok, semi) };
  }

  private parseContinueStatement(): ContinueStatement {
    const continueTok = this.expect('ident', 'continue');
    const semi = this.expect('semicolon');
    return { type: 'ContinueStatement', loc: this.makeLoc(continueTok, semi) };
  }

  private parseReturnStatement(): ReturnStatement {
    const returnTok = this.expect('ident', 'return');

    let value: Expression | null = null;
    if (!this.check('semicolon')) {
      value = this.parseExpression();
    }

    const semi = this.expect('semicolon');
    return { type: 'ReturnStatement', value, loc: this.makeLoc(returnTok, semi) };
  }

  private parseDiscardStatement(): DiscardStatement {
    const discardTok = this.expect('ident', 'discard');
    const semi = this.expect('semicolon');
    return { type: 'DiscardStatement', loc: this.makeLoc(discardTok, semi) };
  }

  private parseExpressionStatement(): Statement {
    const expr = this.parseExpression();

    // Check for increment/decrement
    if (this.check('increment')) {
      const op = this.advance();
      this.expect('semicolon');
      if (op.value === '++') {
        return { type: 'IncrementStatement', operand: expr, loc: this.makeLoc(this.tokens[this.pos - 1]) };
      } else {
        return { type: 'DecrementStatement', operand: expr, loc: this.makeLoc(this.tokens[this.pos - 1]) };
      }
    }

    // Check for assignment
    if (this.check('assignment')) {
      const op = this.advance();
      if (op.value === '=') {
        const value = this.parseExpression();
        this.expect('semicolon');
        return { type: 'AssignmentStatement', target: expr, value, loc: this.makeLoc(this.tokens[this.pos - 1]) };
      } else {
        const value = this.parseExpression();
        this.expect('semicolon');
        return { type: 'CompoundAssignmentStatement', operator: op.value, target: expr, value, loc: this.makeLoc(this.tokens[this.pos - 1]) };
      }
    }

    this.expect('semicolon');
    return { type: 'ExpressionStatement', expression: expr, loc: expr.loc };
  }

  // ---- Expressions ----
  // Using precedence climbing

  private parseExpression(): Expression {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): Expression {
    let left = this.parseLogicalAnd();

    while (this.check('logical', '||')) {
      const op = this.advance();
      const right = this.parseLogicalAnd();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseLogicalAnd(): Expression {
    let left = this.parseBitwiseOr();

    while (this.check('logical', '&&')) {
      const op = this.advance();
      const right = this.parseBitwiseOr();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseBitwiseOr(): Expression {
    let left = this.parseBitwiseXor();

    while (this.check('bitwise', '|')) {
      const op = this.advance();
      const right = this.parseBitwiseXor();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseBitwiseXor(): Expression {
    let left = this.parseBitwiseAnd();

    while (this.check('bitwise', '^')) {
      const op = this.advance();
      const right = this.parseBitwiseAnd();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseBitwiseAnd(): Expression {
    let left = this.parseEquality();

    while (this.check('bitwise', '&')) {
      const op = this.advance();
      const right = this.parseEquality();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseEquality(): Expression {
    let left = this.parseRelational();

    while (this.check('comparison', '==') || this.check('comparison', '!=')) {
      const op = this.advance();
      const right = this.parseRelational();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseRelational(): Expression {
    let left = this.parseShift();

    while (
      this.check('comparison', '<=') ||
      this.check('comparison', '>=') ||
      this.check('langle') ||
      this.check('rangle')
    ) {
      const op = this.advance();
      const right = this.parseShift();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseShift(): Expression {
    let left = this.parseAdditive();

    while (this.check('bitwise', '<<') || this.check('bitwise', '>>')) {
      const op = this.advance();
      const right = this.parseAdditive();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseAdditive(): Expression {
    let left = this.parseMultiplicative();

    while (this.check('operator', '+') || this.check('operator', '-')) {
      const op = this.advance();
      const right = this.parseMultiplicative();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseMultiplicative(): Expression {
    let left = this.parseUnary();

    while (
      this.check('operator', '*') ||
      this.check('operator', '/') ||
      this.check('operator', '%')
    ) {
      const op = this.advance();
      const right = this.parseUnary();
      left = {
        type: 'BinaryExpression',
        operator: op.value,
        left,
        right,
        loc: this.makeLoc(this.tokens[left.loc.start], this.tokens[this.pos - 1])
      };
    }

    return left;
  }

  private parseUnary(): Expression {
    if (
      this.check('operator', '-') ||
      this.check('operator', '+') ||
      this.check('logical', '!') ||
      this.check('bitwise', '~')
    ) {
      const op = this.advance();
      const operand = this.parseUnary();
      return {
        type: 'UnaryExpression',
        operator: op.value,
        operand,
        prefix: true,
        loc: this.makeLoc(op, this.tokens[this.pos - 1])
      };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.check('dot')) {
        this.advance();
        const prop = this.expect('ident');
        expr = {
          type: 'MemberExpression',
          object: expr,
          property: prop.value,
          loc: this.makeLoc(this.tokens[expr.loc.start], prop)
        };
      } else if (this.check('lbracket')) {
        this.advance();
        const index = this.parseExpression();
        const rbracket = this.expect('rbracket');
        expr = {
          type: 'IndexExpression',
          object: expr,
          index,
          loc: this.makeLoc(this.tokens[expr.loc.start], rbracket)
        };
      } else if (this.check('lparen') && expr.type === 'Identifier') {
        // Function call
        this.advance();
        const args: Expression[] = [];
        if (!this.check('rparen')) {
          args.push(this.parseExpression());
          while (this.match('comma')) {
            args.push(this.parseExpression());
          }
        }
        const rparen = this.expect('rparen');
        expr = {
          type: 'CallExpression',
          callee: (expr as Identifier).name,
          args,
          loc: this.makeLoc(this.tokens[expr.loc.start], rparen)
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): Expression {
    this.skipWS();
    const t = this.current();
    if (!t) throw new Error('Unexpected end of input');

    // Number literal
    if (t.type === 'number') {
      this.advance();
      return this.parseNumberLiteral(t);
    }

    // Boolean literal
    if (t.type === 'ident' && (t.value === 'true' || t.value === 'false')) {
      this.advance();
      return {
        type: 'Literal',
        value: t.value === 'true',
        raw: t.value,
        literalType: 'bool',
        loc: this.makeLoc(t)
      };
    }

    // Identifier
    if (t.type === 'ident') {
      this.advance();
      return {
        type: 'Identifier',
        name: t.value,
        loc: this.makeLoc(t)
      };
    }

    // Parenthesized expression
    if (t.type === 'lparen') {
      this.advance();
      const expr = this.parseExpression();
      const rparen = this.expect('rparen');
      return {
        type: 'ParenExpression',
        expression: expr,
        loc: this.makeLoc(t, rparen)
      };
    }

    throw new Error(`Unexpected token ${t.type} '${t.value}' at line ${t.line}`);
  }

  private parseNumberLiteral(t: Token): Literal {
    const raw = t.value;
    let value: number;
    let literalType: 'int' | 'uint' | 'float';

    const lower = raw.toLowerCase();

    if (lower.startsWith('0x')) {
      value = parseInt(raw, 16);
      literalType = lower.endsWith('u') ? 'uint' : 'int';
    } else if (lower.includes('.') || lower.includes('e')) {
      value = parseFloat(raw);
      literalType = 'float';
    } else if (lower.endsWith('u')) {
      value = parseInt(raw);
      literalType = 'uint';
    } else if (lower.endsWith('i')) {
      value = parseInt(raw);
      literalType = 'int';
    } else if (lower.endsWith('f') || lower.endsWith('h')) {
      value = parseFloat(raw);
      literalType = 'float';
    } else {
      value = parseFloat(raw);
      literalType = Number.isInteger(value) ? 'int' : 'float';
    }

    return {
      type: 'Literal',
      value,
      raw,
      literalType,
      loc: this.makeLoc(t)
    };
  }
}

// ============================================================================
// AST UTILITIES
// ============================================================================

/**
 * Walk the AST and call visitor functions for each node
 */
export function walkAST(
  node: ASTNode,
  visitors: {
    enter?: (node: ASTNode, parent: ASTNode | null) => void;
    leave?: (node: ASTNode, parent: ASTNode | null) => void;
  },
  parent: ASTNode | null = null
): void {
  visitors.enter?.(node, parent);

  // Visit children based on node type
  switch (node.type) {
    case 'Program':
      for (const decl of (node as Program).declarations) {
        walkAST(decl, visitors, node);
      }
      break;
    case 'FunctionDecl': {
      const fn = node as FunctionDecl;
      for (const attr of fn.attributes) walkAST(attr, visitors, node);
      for (const param of fn.params) walkAST(param, visitors, node);
      if (fn.returnType) walkAST(fn.returnType, visitors, node);
      walkAST(fn.body, visitors, node);
      break;
    }
    case 'BlockStatement':
      for (const stmt of (node as BlockStatement).statements) {
        walkAST(stmt, visitors, node);
      }
      break;
    case 'BinaryExpression': {
      const bin = node as BinaryExpression;
      walkAST(bin.left, visitors, node);
      walkAST(bin.right, visitors, node);
      break;
    }
    case 'UnaryExpression':
      walkAST((node as UnaryExpression).operand, visitors, node);
      break;
    case 'CallExpression':
      for (const arg of (node as CallExpression).args) {
        walkAST(arg, visitors, node);
      }
      break;
    case 'MemberExpression':
      walkAST((node as MemberExpression).object, visitors, node);
      break;
    case 'IndexExpression': {
      const idx = node as IndexExpression;
      walkAST(idx.object, visitors, node);
      walkAST(idx.index, visitors, node);
      break;
    }
    case 'ParenExpression':
      walkAST((node as ParenExpression).expression, visitors, node);
      break;
    case 'LetStatement':
      walkAST((node as LetStatement).initializer, visitors, node);
      break;
    case 'VarStatement':
      if ((node as VarStatement).initializer) {
        walkAST((node as VarStatement).initializer!, visitors, node);
      }
      break;
    case 'AssignmentStatement': {
      const assign = node as AssignmentStatement;
      walkAST(assign.target, visitors, node);
      walkAST(assign.value, visitors, node);
      break;
    }
    case 'ReturnStatement':
      if ((node as ReturnStatement).value) {
        walkAST((node as ReturnStatement).value!, visitors, node);
      }
      break;
    case 'IfStatement': {
      const ifStmt = node as IfStatement;
      walkAST(ifStmt.condition, visitors, node);
      walkAST(ifStmt.consequent, visitors, node);
      if (ifStmt.alternate) walkAST(ifStmt.alternate, visitors, node);
      break;
    }
    case 'ForStatement': {
      const forStmt = node as ForStatement;
      if (forStmt.init) walkAST(forStmt.init, visitors, node);
      if (forStmt.condition) walkAST(forStmt.condition, visitors, node);
      if (forStmt.update) walkAST(forStmt.update, visitors, node);
      walkAST(forStmt.body, visitors, node);
      break;
    }
    case 'WhileStatement': {
      const whileStmt = node as WhileStatement;
      walkAST(whileStmt.condition, visitors, node);
      walkAST(whileStmt.body, visitors, node);
      break;
    }
    case 'Attribute':
      for (const arg of (node as Attribute).args) {
        walkAST(arg, visitors, node);
      }
      break;
    // Leaf nodes - no children to visit
    case 'Literal':
    case 'Identifier':
    case 'NamedType':
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'DiscardStatement':
      break;
  }

  visitors.leave?.(node, parent);
}

/**
 * Find all nodes of a specific type
 */
export function findNodes<T extends ASTNode>(ast: Program, type: string): T[] {
  const nodes: T[] = [];
  walkAST(ast, {
    enter(node) {
      if (node.type === type) {
        nodes.push(node as T);
      }
    }
  });
  return nodes;
}

/**
 * Find all literal nodes in function bodies (safe to mutate)
 */
export function findMutableLiterals(ast: Program): Literal[] {
  const literals: Literal[] = [];

  // Only look inside function bodies
  const functions = findNodes<FunctionDecl>(ast, 'FunctionDecl');

  for (const fn of functions) {
    walkAST(fn.body, {
      enter(node, parent) {
        if (node.type === 'Literal') {
          // Skip literals inside attributes
          if (parent?.type === 'Attribute') return;

          literals.push(node as Literal);
        }
      }
    });
  }

  return literals;
}

/**
 * Find all binary operators in function bodies (safe to mutate)
 */
export function findMutableOperators(ast: Program): BinaryExpression[] {
  const operators: BinaryExpression[] = [];

  const functions = findNodes<FunctionDecl>(ast, 'FunctionDecl');

  for (const fn of functions) {
    walkAST(fn.body, {
      enter(node) {
        if (node.type === 'BinaryExpression') {
          const bin = node as BinaryExpression;
          // Only arithmetic operators
          if (['+', '-', '*', '/'].includes(bin.operator)) {
            operators.push(bin);
          }
        }
      }
    });
  }

  return operators;
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

export function parseWGSLToAST(source: string): Program {
  const parser = new WGSLASTParser(source);
  return parser.parse();
}
