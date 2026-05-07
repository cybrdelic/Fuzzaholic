/**
 * WGSL Parser - v2 Clean Implementation
 *
 * Recursive descent parser that builds AST from tokens.
 * Focused on fragment shader parsing with error recovery.
 *
 * NO REGEX. Pure token-based parsing.
 */

import { Lexer, Token, TokenType } from './lexer';
import {
    Attribute,
    BinaryOperator,
    BlockStmt,
    BreakStmt,
    CompoundAssignStmt,
    ConstDecl,
    ContinueStmt,
    Declaration,
    DiscardStmt,
    Expression,
    ForStmt,
    FunctionDecl,
    GlobalVarDecl,
    IdentifierExpr,
    IfStmt,
    LetStmt,
    LiteralExpr,
    LoopStmt,
    Parameter,
    Program,
    ReturnStmt,
    Statement,
    StructDecl,
    StructMember,
    SwitchCase,
    SwitchStmt,
    TypeAlias,
    TypeExpr,
    UnaryExpr,
    VarStmt,
    WGSLType,
    WhileStmt
} from './types';

// ============================================================================
// PARSER ERRORS
// ============================================================================

export class ParseError extends Error {
  constructor(
    message: string,
    public token: Token,
    public expected?: string
  ) {
    super(`Parse error at line ${token.line}, column ${token.column}: ${message}`);
    this.name = 'ParseError';
  }
}

// ============================================================================
// PARSER CLASS
// ============================================================================

export class Parser {
  private tokens: Token[] = [];
  private pos: number = 0;
  private errors: ParseError[] = [];

  constructor(private source: string) { }

  /**
   * Parse the source and return AST
   */
  parse(): Program {
    const lexer = new Lexer(this.source);
    this.tokens = lexer.tokenizeClean();
    this.pos = 0;
    this.errors = [];

    const declarations: Declaration[] = [];

    while (!this.isAtEnd()) {
      try {
        const decl = this.parseDeclaration();
        if (decl) {
          declarations.push(decl);
        }
      } catch (e) {
        if (e instanceof ParseError) {
          this.errors.push(e);
          this.synchronize();
        } else {
          throw e;
        }
      }
    }

    return {
      kind: 'Program',
      declarations,
    };
  }

  /**
   * Get any parse errors encountered
   */
  getErrors(): ParseError[] {
    return this.errors;
  }

  // ---- Token Navigation ----

  private current(): Token {
    return this.tokens[this.pos] || this.tokens[this.tokens.length - 1];
  }

  private peek(offset: number = 0): Token {
    const idx = this.pos + offset;
    return this.tokens[idx] || this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const token = this.current();
    if (!this.isAtEnd()) {
      this.pos++;
    }
    return token;
  }

  private isAtEnd(): boolean {
    return this.current().type === 'eof';
  }

  private check(type: TokenType, value?: string): boolean {
    const token = this.current();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private match(type: TokenType, value?: string): Token | null {
    if (this.check(type, value)) {
      return this.advance();
    }
    return null;
  }

  private expect(type: TokenType, value?: string): Token {
    if (this.check(type, value)) {
      return this.advance();
    }
    const expected = value ? `'${value}'` : type;
    throw new ParseError(
      `Expected ${expected}, got '${this.current().value}'`,
      this.current(),
      expected
    );
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      // Stop at declaration boundaries
      if (this.check('ident', 'fn') ||
        this.check('ident', 'struct') ||
        this.check('ident', 'var') ||
        this.check('ident', 'let') ||
        this.check('ident', 'const') ||
        this.check('ident', 'type') ||
        this.check('at')) {
        return;
      }
      this.advance();
    }
  }

  // ---- Declaration Parsing ----

  private parseDeclaration(): Declaration | null {
    // Collect attributes
    const attributes: Attribute[] = [];
    while (this.check('at')) {
      attributes.push(this.parseAttribute());
    }

    const token = this.current();
    if (token.type !== 'ident') {
      this.advance();
      return null;
    }

    switch (token.value) {
      case 'fn':
        return this.parseFunctionDecl(attributes);
      case 'var':
        return this.parseGlobalVarDecl(attributes);
      case 'let':
      case 'const':
        return this.parseConstDecl();
      case 'struct':
        return this.parseStructDecl();
      case 'type':
        return this.parseTypeAlias();
      default:
        this.advance();
        return null;
    }
  }

  private parseAttribute(): Attribute {
    this.expect('at');
    const nameToken = this.expect('ident');
    const args: Expression[] = [];

    if (this.match('lparen')) {
      if (!this.check('rparen')) {
        args.push(this.parseExpression());
        while (this.match('comma')) {
          args.push(this.parseExpression());
        }
      }
      this.expect('rparen');
    }

    return {
      kind: 'Attribute',
      name: nameToken.value,
      args,
    };
  }

  private parseFunctionDecl(attributes: Attribute[]): FunctionDecl {
    this.expect('ident', 'fn');
    const nameToken = this.expect('ident');

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
    if (this.match('arrow')) {
      while (this.check('at')) {
        returnAttributes.push(this.parseAttribute());
      }
      returnType = this.parseType();
    }

    // Body
    const body = this.parseBlock();

    return {
      kind: 'FunctionDecl',
      name: nameToken.value,
      attributes,
      params,
      returnType,
      returnAttributes,
      body,
    };
  }

  private parseParameter(): Parameter {
    const attributes: Attribute[] = [];
    while (this.check('at')) {
      attributes.push(this.parseAttribute());
    }

    const nameToken = this.expect('ident');
    this.expect('colon');
    const type = this.parseType();

    return {
      kind: 'Parameter',
      name: nameToken.value,
      attributes,
      type,
    };
  }

  private parseGlobalVarDecl(attributes: Attribute[]): GlobalVarDecl {
    this.expect('ident', 'var');

    let addressSpace: string | null = null;
    let accessMode: string | null = null;

    // <address_space, access_mode>
    if (this.match('langle')) {
      const first = this.expect('ident');
      addressSpace = first.value;
      if (this.match('comma')) {
        const second = this.expect('ident');
        accessMode = second.value;
      }
      this.expect('rangle');
    }

    const nameToken = this.expect('ident');

    let type: TypeExpr | null = null;
    if (this.match('colon')) {
      type = this.parseType();
    }

    let initializer: Expression | null = null;
    if (this.match('assignment', '=')) {
      initializer = this.parseExpression();
    }

    this.expect('semicolon');

    return {
      kind: 'GlobalVarDecl',
      attributes,
      name: nameToken.value,
      addressSpace,
      accessMode,
      type,
      initializer,
    };
  }

  private parseConstDecl(): ConstDecl {
    this.advance(); // 'const' or 'let'
    const nameToken = this.expect('ident');

    let type: TypeExpr | null = null;
    if (this.match('colon')) {
      type = this.parseType();
    }

    this.expect('assignment', '=');
    const initializer = this.parseExpression();
    this.expect('semicolon');

    return {
      kind: 'ConstDecl',
      name: nameToken.value,
      type,
      initializer,
    };
  }

  private parseStructDecl(): StructDecl {
    this.expect('ident', 'struct');
    const nameToken = this.expect('ident');
    this.expect('lbrace');

    const members: StructMember[] = [];
    while (!this.check('rbrace') && !this.isAtEnd()) {
      members.push(this.parseStructMember());
      this.match('comma'); // Optional trailing comma
    }

    this.expect('rbrace');

    return {
      kind: 'StructDecl',
      name: nameToken.value,
      members,
    };
  }

  private parseStructMember(): StructMember {
    const attributes: Attribute[] = [];
    while (this.check('at')) {
      attributes.push(this.parseAttribute());
    }

    const nameToken = this.expect('ident');
    this.expect('colon');
    const type = this.parseType();

    return {
      kind: 'StructMember',
      name: nameToken.value,
      attributes,
      type,
    };
  }

  private parseTypeAlias(): TypeAlias {
    this.expect('ident', 'type');
    const nameToken = this.expect('ident');
    this.expect('assignment', '=');
    const type = this.parseType();
    this.expect('semicolon');

    return {
      kind: 'TypeAlias',
      name: nameToken.value,
      type,
    };
  }

  // ---- Type Parsing ----

  private parseType(): TypeExpr {
    const nameToken = this.expect('ident');

    // Array type
    if (nameToken.value === 'array') {
      this.expect('langle');
      const element = this.parseType();
      let size: Expression | null = null;
      if (this.match('comma')) {
        size = this.parseExpression();
      }
      this.expect('rangle');
      return {
        kind: 'ArrayTypeExpr',
        element,
        size,
      };
    }

    // Generic type (vec2<f32>, etc)
    if (this.match('langle')) {
      const args: TypeExpr[] = [this.parseType()];
      while (this.match('comma')) {
        args.push(this.parseType());
      }
      this.expect('rangle');
      return {
        kind: 'GenericTypeExpr',
        name: nameToken.value,
        args,
      };
    }

    // Simple named type
    return {
      kind: 'NamedTypeExpr',
      name: nameToken.value,
    };
  }

  // ---- Statement Parsing ----

  private parseBlock(): BlockStmt {
    this.expect('lbrace');
    const statements: Statement[] = [];

    while (!this.check('rbrace') && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
    }

    this.expect('rbrace');

    return {
      kind: 'BlockStmt',
      statements,
    };
  }

  private parseStatement(): Statement | null {
    const token = this.current();

    if (token.type === 'ident') {
      switch (token.value) {
        case 'let':
          return this.parseLetStmt();
        case 'var':
          return this.parseVarStmt();
        case 'if':
          return this.parseIfStmt();
        case 'for':
          return this.parseForStmt();
        case 'while':
          return this.parseWhileStmt();
        case 'loop':
          return this.parseLoopStmt();
        case 'switch':
          return this.parseSwitchStmt();
        case 'break':
          return this.parseBreakStmt();
        case 'continue':
          return this.parseContinueStmt();
        case 'return':
          return this.parseReturnStmt();
        case 'discard':
          return this.parseDiscardStmt();
      }
    }

    if (this.check('lbrace')) {
      return this.parseBlock();
    }

    // Expression statement (or assignment)
    return this.parseExpressionStatement();
  }

  private parseLetStmt(): LetStmt {
    this.expect('ident', 'let');
    const nameToken = this.expect('ident');

    let type: TypeExpr | null = null;
    if (this.match('colon')) {
      type = this.parseType();
    }

    this.expect('assignment', '=');
    const initializer = this.parseExpression();
    this.expect('semicolon');

    return {
      kind: 'LetStmt',
      name: nameToken.value,
      type,
      initializer,
    };
  }

  private parseVarStmt(): VarStmt {
    this.expect('ident', 'var');
    const nameToken = this.expect('ident');

    let type: TypeExpr | null = null;
    if (this.match('colon')) {
      type = this.parseType();
    }

    let initializer: Expression | null = null;
    if (this.match('assignment', '=')) {
      initializer = this.parseExpression();
    }

    this.expect('semicolon');

    return {
      kind: 'VarStmt',
      name: nameToken.value,
      type,
      initializer,
    };
  }

  private parseIfStmt(): IfStmt {
    this.expect('ident', 'if');

    // Condition (optionally in parens)
    let condition: Expression;
    if (this.match('lparen')) {
      condition = this.parseExpression();
      this.expect('rparen');
    } else {
      condition = this.parseExpression();
    }

    const consequent = this.parseBlock();

    let alternate: BlockStmt | IfStmt | null = null;
    if (this.match('ident', 'else')) {
      if (this.check('ident', 'if')) {
        alternate = this.parseIfStmt();
      } else {
        alternate = this.parseBlock();
      }
    }

    return {
      kind: 'IfStmt',
      condition,
      consequent,
      alternate,
    };
  }

  private parseForStmt(): ForStmt {
    this.expect('ident', 'for');
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
      kind: 'ForStmt',
      init,
      condition,
      update,
      body,
    };
  }

  private parseForInit(): Statement {
    const token = this.current();
    if (token.type === 'ident' && (token.value === 'let' || token.value === 'var')) {
      if (token.value === 'let') {
        return this.parseLetStmtNoSemi();
      } else {
        return this.parseVarStmtNoSemi();
      }
    }
    return this.parseExpressionStatementNoSemi();
  }

  private parseForUpdate(): Statement {
    return this.parseExpressionStatementNoSemi();
  }

  private parseLetStmtNoSemi(): LetStmt {
    this.expect('ident', 'let');
    const nameToken = this.expect('ident');

    let type: TypeExpr | null = null;
    if (this.match('colon')) {
      type = this.parseType();
    }

    this.expect('assignment', '=');
    const initializer = this.parseExpression();

    return {
      kind: 'LetStmt',
      name: nameToken.value,
      type,
      initializer,
    };
  }

  private parseVarStmtNoSemi(): VarStmt {
    this.expect('ident', 'var');
    const nameToken = this.expect('ident');

    let type: TypeExpr | null = null;
    if (this.match('colon')) {
      type = this.parseType();
    }

    let initializer: Expression | null = null;
    if (this.match('assignment', '=')) {
      initializer = this.parseExpression();
    }

    return {
      kind: 'VarStmt',
      name: nameToken.value,
      type,
      initializer,
    };
  }

  private parseWhileStmt(): WhileStmt {
    this.expect('ident', 'while');
    const condition = this.parseExpression();
    const body = this.parseBlock();

    return {
      kind: 'WhileStmt',
      condition,
      body,
    };
  }

  private parseLoopStmt(): LoopStmt {
    this.expect('ident', 'loop');
    const body = this.parseBlock();

    let continuing: BlockStmt | null = null;
    if (this.match('ident', 'continuing')) {
      continuing = this.parseBlock();
    }

    return {
      kind: 'LoopStmt',
      body,
      continuing,
    };
  }

  private parseSwitchStmt(): SwitchStmt {
    this.expect('ident', 'switch');
    const selector = this.parseExpression();
    this.expect('lbrace');

    const cases: SwitchCase[] = [];
    while (!this.check('rbrace') && !this.isAtEnd()) {
      cases.push(this.parseSwitchCase());
    }

    this.expect('rbrace');

    return {
      kind: 'SwitchStmt',
      selector,
      cases,
    };
  }

  private parseSwitchCase(): SwitchCase {
    const keyword = this.expect('ident');
    const isDefault = keyword.value === 'default';

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
      kind: 'SwitchCase',
      selectors,
      isDefault,
      body,
    };
  }

  private parseBreakStmt(): BreakStmt {
    this.expect('ident', 'break');
    this.expect('semicolon');
    return { kind: 'BreakStmt' };
  }

  private parseContinueStmt(): ContinueStmt {
    this.expect('ident', 'continue');
    this.expect('semicolon');
    return { kind: 'ContinueStmt' };
  }

  private parseReturnStmt(): ReturnStmt {
    this.expect('ident', 'return');

    let value: Expression | null = null;
    if (!this.check('semicolon')) {
      value = this.parseExpression();
    }

    this.expect('semicolon');

    return {
      kind: 'ReturnStmt',
      value,
    };
  }

  private parseDiscardStmt(): DiscardStmt {
    this.expect('ident', 'discard');
    this.expect('semicolon');
    return { kind: 'DiscardStmt' };
  }

  private parseExpressionStatement(): Statement {
    const expr = this.parseExpression();

    // Check for increment/decrement
    if (this.match('increment')) {
      const prev = this.tokens[this.pos - 1];
      this.expect('semicolon');
      if (prev.value === '++') {
        return { kind: 'IncrementStmt', operand: expr };
      } else {
        return { kind: 'DecrementStmt', operand: expr };
      }
    }

    // Check for assignment
    if (this.check('assignment')) {
      const op = this.advance();
      if (op.value === '=') {
        const value = this.parseExpression();
        this.expect('semicolon');
        return { kind: 'AssignStmt', target: expr, value };
      } else {
        const value = this.parseExpression();
        this.expect('semicolon');
        return {
          kind: 'CompoundAssignStmt',
          operator: op.value as CompoundAssignStmt['operator'],
          target: expr,
          value,
        };
      }
    }

    this.expect('semicolon');
    return { kind: 'ExprStmt', expression: expr };
  }

  private parseExpressionStatementNoSemi(): Statement {
    const expr = this.parseExpression();

    // Check for increment/decrement
    if (this.match('increment')) {
      const prev = this.tokens[this.pos - 1];
      if (prev.value === '++') {
        return { kind: 'IncrementStmt', operand: expr };
      } else {
        return { kind: 'DecrementStmt', operand: expr };
      }
    }

    // Check for assignment
    if (this.check('assignment')) {
      const op = this.advance();
      if (op.value === '=') {
        const value = this.parseExpression();
        return { kind: 'AssignStmt', target: expr, value };
      } else {
        const value = this.parseExpression();
        return {
          kind: 'CompoundAssignStmt',
          operator: op.value as CompoundAssignStmt['operator'],
          target: expr,
          value,
        };
      }
    }

    return { kind: 'ExprStmt', expression: expr };
  }

  // ---- Expression Parsing (Precedence Climbing) ----

  private parseExpression(): Expression {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): Expression {
    let left = this.parseLogicalAnd();

    while (this.match('logical', '||')) {
      const right = this.parseLogicalAnd();
      left = {
        kind: 'BinaryExpr',
        operator: '||',
        left,
        right,
        resultType: 'bool',
      };
    }

    return left;
  }

  private parseLogicalAnd(): Expression {
    let left = this.parseBitwiseOr();

    while (this.match('logical', '&&')) {
      const right = this.parseBitwiseOr();
      left = {
        kind: 'BinaryExpr',
        operator: '&&',
        left,
        right,
        resultType: 'bool',
      };
    }

    return left;
  }

  private parseBitwiseOr(): Expression {
    let left = this.parseBitwiseXor();

    while (this.match('bitwise', '|')) {
      const right = this.parseBitwiseXor();
      left = {
        kind: 'BinaryExpr',
        operator: '|',
        left,
        right,
        resultType: this.inferBinaryType(left, right),
      };
    }

    return left;
  }

  private parseBitwiseXor(): Expression {
    let left = this.parseBitwiseAnd();

    while (this.match('bitwise', '^')) {
      const right = this.parseBitwiseAnd();
      left = {
        kind: 'BinaryExpr',
        operator: '^',
        left,
        right,
        resultType: this.inferBinaryType(left, right),
      };
    }

    return left;
  }

  private parseBitwiseAnd(): Expression {
    let left = this.parseEquality();

    while (this.match('bitwise', '&')) {
      const right = this.parseEquality();
      left = {
        kind: 'BinaryExpr',
        operator: '&',
        left,
        right,
        resultType: this.inferBinaryType(left, right),
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
        kind: 'BinaryExpr',
        operator: op.value as BinaryOperator,
        left,
        right,
        resultType: 'bool',
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
        kind: 'BinaryExpr',
        operator: op.value as BinaryOperator,
        left,
        right,
        resultType: 'bool',
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
        kind: 'BinaryExpr',
        operator: op.value as BinaryOperator,
        left,
        right,
        resultType: this.inferBinaryType(left, right),
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
        kind: 'BinaryExpr',
        operator: op.value as BinaryOperator,
        left,
        right,
        resultType: this.inferBinaryType(left, right),
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
        kind: 'BinaryExpr',
        operator: op.value as BinaryOperator,
        left,
        right,
        resultType: this.inferBinaryType(left, right),
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
        kind: 'UnaryExpr',
        operator: op.value as UnaryExpr['operator'],
        operand,
        resultType: op.value === '!' ? 'bool' : operand.resultType,
      };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match('dot')) {
        const member = this.expect('ident');
        expr = {
          kind: 'MemberExpr',
          object: expr,
          member: member.value,
          resultType: this.inferMemberType(expr, member.value),
        };
      } else if (this.match('lbracket')) {
        const index = this.parseExpression();
        this.expect('rbracket');
        expr = {
          kind: 'IndexExpr',
          object: expr,
          index,
          resultType: this.inferIndexType(expr),
        };
      } else if (this.check('langle') && expr.kind === 'IdentifierExpr') {
        const typeArgs: string[] = [];
        this.advance();
        while (!this.check('rangle') && !this.isAtEnd()) {
          typeArgs.push(this.advance().value);
        }
        this.expect('rangle');
        expr = {
          kind: 'IdentifierExpr',
          name: `${(expr as IdentifierExpr).name}<${typeArgs.join('')}>`,
          resultType: this.inferIdentifierType(`${(expr as IdentifierExpr).name}<${typeArgs.join('')}>`),
        };
      } else if (this.check('lparen') && expr.kind === 'IdentifierExpr') {
        this.advance();
        const args: Expression[] = [];
        if (!this.check('rparen')) {
          args.push(this.parseExpression());
          while (this.match('comma')) {
            args.push(this.parseExpression());
          }
        }
        this.expect('rparen');
        expr = {
          kind: 'CallExpr',
          callee: (expr as IdentifierExpr).name,
          args,
          resultType: this.inferCallType((expr as IdentifierExpr).name, args),
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): Expression {
    const token = this.current();

    // Number literal
    if (token.type === 'number') {
      this.advance();
      return this.parseNumberLiteral(token);
    }

    // Boolean literal
    if (token.type === 'ident' && (token.value === 'true' || token.value === 'false')) {
      this.advance();
      return {
        kind: 'LiteralExpr',
        value: token.value === 'true',
        raw: token.value,
        resultType: 'bool',
      };
    }

    // Identifier
    if (token.type === 'ident') {
      this.advance();
      return {
        kind: 'IdentifierExpr',
        name: token.value,
        resultType: this.inferIdentifierType(token.value),
      };
    }

    // Parenthesized expression
    if (this.match('lparen')) {
      const expr = this.parseExpression();
      this.expect('rparen');
      return {
        kind: 'ParenExpr',
        expression: expr,
        resultType: expr.resultType,
      };
    }

    throw new ParseError(`Unexpected token '${token.value}'`, token);
  }

  private parseNumberLiteral(token: Token): LiteralExpr {
    const raw = token.value;
    const lower = raw.toLowerCase();

    let value: number;
    let resultType: WGSLType;

    if (lower.startsWith('0x')) {
      value = parseInt(raw, 16);
      resultType = lower.endsWith('u') ? 'u32' : 'i32';
    } else if (lower.endsWith('u')) {
      value = parseInt(raw);
      resultType = 'u32';
    } else if (lower.endsWith('i')) {
      value = parseInt(raw);
      resultType = 'i32';
    } else if (lower.includes('.') || lower.includes('e') || lower.endsWith('f') || lower.endsWith('h')) {
      value = parseFloat(raw);
      resultType = 'f32';
    } else {
      value = parseFloat(raw);
      resultType = Number.isInteger(value) ? 'i32' : 'f32';
    }

    return {
      kind: 'LiteralExpr',
      value,
      raw,
      resultType,
    };
  }

  // ---- Type Inference Helpers ----

  private inferBinaryType(left: Expression, right: Expression): WGSLType {
    // Simplified inference - real implementation would be more complex
    if (left.resultType === right.resultType) {
      return left.resultType;
    }
    // Default to f32 for mixed types
    return 'f32';
  }

  private inferMemberType(object: Expression, member: string): WGSLType {
    const objType = object.resultType;

    // Swizzle patterns
    if (member.length === 1 && 'xyzwrgba'.includes(member)) {
      return 'f32';
    }
    if (member.length === 2 && /^[xyzwrgba]{2}$/.test(member)) {
      return 'vec2<f32>';
    }
    if (member.length === 3 && /^[xyzwrgba]{3}$/.test(member)) {
      return 'vec3<f32>';
    }
    if (member.length === 4 && /^[xyzwrgba]{4}$/.test(member)) {
      return 'vec4<f32>';
    }

    return 'unknown';
  }

  private inferIndexType(object: Expression): WGSLType {
    const objType = object.resultType;

    if (objType.startsWith('vec')) {
      return 'f32';
    }
    if (objType.startsWith('mat')) {
      // mat2x2 index -> vec2, etc
      return 'vec2<f32>';
    }

    return 'unknown';
  }

  private inferCallType(callee: string, args: Expression[]): WGSLType {
    // Common function return types
    const SCALAR_RETURNS = new Set([
      'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
      'sinh', 'cosh', 'tanh', 'exp', 'exp2', 'log', 'log2',
      'sqrt', 'inverseSqrt', 'abs', 'sign', 'floor', 'ceil',
      'round', 'trunc', 'fract', 'length', 'distance', 'dot',
      'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'pow',
      'f_hash', 'f_n', 'f_sin', 'f_cos', 'f_smin', 'noise', 'fbm', 'hash',
    ]);

    const VEC2_RETURNS = new Set(['normalize', 'reflect', 'refract', 'hash2']);
    const VEC3_RETURNS = new Set(['cross', 'f_pal', 'hash3']);
    const VEC4_RETURNS = new Set([]);

    // Vector constructors
    if (callee === 'vec2' || callee === 'vec2<f32>') return 'vec2<f32>';
    if (callee === 'vec3' || callee === 'vec3<f32>') return 'vec3<f32>';
    if (callee === 'vec4' || callee === 'vec4<f32>') return 'vec4<f32>';
    if (callee === 'mat2x2' || callee === 'mat2x2<f32>') return 'mat2x2<f32>';
    if (callee === 'mat3x3' || callee === 'mat3x3<f32>') return 'mat3x3<f32>';
    if (callee === 'mat4x4' || callee === 'mat4x4<f32>') return 'mat4x4<f32>';

    if (SCALAR_RETURNS.has(callee)) return 'f32';
    if (VEC2_RETURNS.has(callee)) return 'vec2<f32>';
    if (VEC3_RETURNS.has(callee)) return 'vec3<f32>';
    if (VEC4_RETURNS.has(callee)) return 'vec4<f32>';

    // For unknown functions, try to infer from first arg
    if (args.length > 0) {
      return args[0].resultType;
    }

    return 'unknown';
  }

  private inferIdentifierType(name: string): WGSLType {
    // Common shader variables
    const KNOWN_TYPES: Record<string, WGSLType> = {
      'time': 'f32',
      'resolution': 'vec2<f32>',
      'mouse': 'vec2<f32>',
      'scroll': 'vec2<f32>',
      'uv': 'vec2<f32>',
      'p': 'vec2<f32>',
      'fragCoord': 'vec4<f32>',
      'col': 'vec3<f32>',
      'color': 'vec3<f32>',
    };

    return KNOWN_TYPES[name] || 'unknown';
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

export function parse(source: string): Program {
  return new Parser(source).parse();
}
