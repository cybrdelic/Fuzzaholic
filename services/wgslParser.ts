/**
 * WGSL PARSER - Purpose-built for shader fuzzing
 *
 * A lightweight WGSL parser that extracts:
 * - Function boundaries (main vs helpers)
 * - Numeric literal positions with context
 * - Operator positions with context
 * - Frozen zones (annotations, uniforms, type params)
 *
 * This replaces regex-based mutation targeting with proper parsing.
 */

// ============================================================================
// TOKEN TYPES
// ============================================================================

export type TokenType =
  | 'number'      // 1.0, .5, 123, 0xFF, 1u
  | 'ident'       // variable names, keywords, types
  | 'operator'    // + - * / %
  | 'comparison'  // == != < > <= >=
  | 'assignment'  // = += -= *= /= %=
  | 'arrow'       // ->
  | 'increment'   // ++ --
  | 'logical'     // && || !
  | 'bitwise'     // & | ^ ~ << >>
  | 'lparen'      // (
  | 'rparen'      // )
  | 'lbrace'      // {
  | 'rbrace'      // }
  | 'lbracket'    // [
  | 'rbracket'    // ]
  | 'langle'      // <
  | 'rangle'      // >
  | 'comma'       // ,
  | 'semicolon'   // ;
  | 'colon'       // :
  | 'dot'         // .
  | 'at'          // @
  | 'comment'     // // ...
  | 'whitespace'  // spaces, tabs, newlines
  | 'unknown';

export interface Token {
  type: TokenType;
  value: string;
  start: number;    // Character offset in source
  end: number;      // Character offset end (exclusive)
  line: number;     // 1-indexed line number
  column: number;   // 1-indexed column number
}

// ============================================================================
// LEXER
// ============================================================================

export class WGSLLexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }
    return this.tokens;
  }

  private peek(offset: number = 0): string {
    return this.source[this.pos + offset] || '';
  }

  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private makeToken(type: TokenType, value: string, startPos: number, startLine: number, startColumn: number): Token {
    return {
      type,
      value,
      start: startPos,
      end: this.pos,
      line: startLine,
      column: startColumn
    };
  }

  private nextToken(): Token | null {
    const startPos = this.pos;
    const startLine = this.line;
    const startColumn = this.column;
    const char = this.peek();

    // Whitespace
    if (/\s/.test(char)) {
      let value = '';
      while (this.pos < this.source.length && /\s/.test(this.peek())) {
        value += this.advance();
      }
      return this.makeToken('whitespace', value, startPos, startLine, startColumn);
    }

    // Comment
    if (char === '/' && this.peek(1) === '/') {
      let value = '';
      while (this.pos < this.source.length && this.peek() !== '\n') {
        value += this.advance();
      }
      return this.makeToken('comment', value, startPos, startLine, startColumn);
    }

    // Numbers: 0x hex, decimal with optional exponent, unsigned suffix
    if (/\d/.test(char) || (char === '.' && /\d/.test(this.peek(1)))) {
      let value = '';

      // Hex number
      if (char === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
        value += this.advance(); // 0
        value += this.advance(); // x
        while (/[0-9a-fA-F]/.test(this.peek())) {
          value += this.advance();
        }
      } else {
        // Decimal: integer part
        while (/\d/.test(this.peek())) {
          value += this.advance();
        }
        // Decimal point
        if (this.peek() === '.' && this.peek(1) !== '.') { // Not range operator ..
          value += this.advance();
          while (/\d/.test(this.peek())) {
            value += this.advance();
          }
        }
        // Exponent
        if (this.peek() === 'e' || this.peek() === 'E') {
          value += this.advance();
          if (this.peek() === '+' || this.peek() === '-') {
            value += this.advance();
          }
          while (/\d/.test(this.peek())) {
            value += this.advance();
          }
        }
      }
      // Type suffix (u for unsigned, f for float, i for signed, h for half)
      if (/[uUfFiIhH]/.test(this.peek()) && !/[a-zA-Z_]/.test(this.peek(1))) {
        value += this.advance();
      }
      return this.makeToken('number', value, startPos, startLine, startColumn);
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      let value = '';
      while (/[a-zA-Z0-9_]/.test(this.peek())) {
        value += this.advance();
      }
      return this.makeToken('ident', value, startPos, startLine, startColumn);
    }

    // Multi-character operators (check longer ones first)
    const twoChar = char + this.peek(1);

    // Arrow
    if (twoChar === '->') {
      this.advance(); this.advance();
      return this.makeToken('arrow', '->', startPos, startLine, startColumn);
    }

    // Increment/Decrement
    if (twoChar === '++' || twoChar === '--') {
      this.advance(); this.advance();
      return this.makeToken('increment', twoChar, startPos, startLine, startColumn);
    }

    // Comparison
    if (twoChar === '==' || twoChar === '!=' || twoChar === '<=' || twoChar === '>=') {
      this.advance(); this.advance();
      return this.makeToken('comparison', twoChar, startPos, startLine, startColumn);
    }

    // Compound assignment
    if (twoChar === '+=' || twoChar === '-=' || twoChar === '*=' || twoChar === '/=' || twoChar === '%=') {
      this.advance(); this.advance();
      return this.makeToken('assignment', twoChar, startPos, startLine, startColumn);
    }

    // Logical
    if (twoChar === '&&' || twoChar === '||') {
      this.advance(); this.advance();
      return this.makeToken('logical', twoChar, startPos, startLine, startColumn);
    }

    // Bitwise shift
    if (twoChar === '<<' || twoChar === '>>') {
      this.advance(); this.advance();
      return this.makeToken('bitwise', twoChar, startPos, startLine, startColumn);
    }

    // Single character tokens
    this.advance();

    switch (char) {
      case '+': case '-': case '*': case '/': case '%':
        return this.makeToken('operator', char, startPos, startLine, startColumn);
      case '<':
        return this.makeToken('langle', char, startPos, startLine, startColumn);
      case '>':
        return this.makeToken('rangle', char, startPos, startLine, startColumn);
      case '=':
        return this.makeToken('assignment', char, startPos, startLine, startColumn);
      case '!':
        return this.makeToken('logical', char, startPos, startLine, startColumn);
      case '&': case '|': case '^': case '~':
        return this.makeToken('bitwise', char, startPos, startLine, startColumn);
      case '(':
        return this.makeToken('lparen', char, startPos, startLine, startColumn);
      case ')':
        return this.makeToken('rparen', char, startPos, startLine, startColumn);
      case '{':
        return this.makeToken('lbrace', char, startPos, startLine, startColumn);
      case '}':
        return this.makeToken('rbrace', char, startPos, startLine, startColumn);
      case '[':
        return this.makeToken('lbracket', char, startPos, startLine, startColumn);
      case ']':
        return this.makeToken('rbracket', char, startPos, startLine, startColumn);
      case ',':
        return this.makeToken('comma', char, startPos, startLine, startColumn);
      case ';':
        return this.makeToken('semicolon', char, startPos, startLine, startColumn);
      case ':':
        return this.makeToken('colon', char, startPos, startLine, startColumn);
      case '.':
        return this.makeToken('dot', char, startPos, startLine, startColumn);
      case '@':
        return this.makeToken('at', char, startPos, startLine, startColumn);
      default:
        return this.makeToken('unknown', char, startPos, startLine, startColumn);
    }
  }
}

// ============================================================================
// AST TYPES
// ============================================================================

export interface SourceRange {
  start: number;
  end: number;
  startLine: number;
  endLine: number;
}

export interface FunctionDecl {
  name: string;
  range: SourceRange;
  bodyRange: SourceRange;  // Just the body inside { }
  params: Array<{ name: string; type: string }>;
  returnType: string | null;
  isEntryPoint: boolean;   // @vertex, @fragment, @compute
}

export interface UniformDecl {
  name: string;
  type: string;
  group: number;
  binding: number;
  range: SourceRange;
}

export interface AnnotationNode {
  name: string;       // 'binding', 'group', 'location', etc.
  args: string[];     // Arguments inside parens
  range: SourceRange;
}

export interface MutableNumber {
  value: string;
  numericValue: number;
  range: SourceRange;
  context: NumberContext;
}

export interface MutableOperator {
  value: string;      // '+', '-', '*', '/'
  range: SourceRange;
  context: OperatorContext;
}

export type NumberContext =
  | 'expression'      // Safe to mutate
  | 'loop-init'       // for (var i = 0; ...)
  | 'loop-condition'  // for (...; i < 10; ...)
  | 'loop-increment'  // for (...; ...; i++)
  | 'array-size'      // array<f32, 10>
  | 'type-param'      // vec2<f32>
  | 'annotation'      // @binding(0)
  | 'swizzle';        // .xyz

export type OperatorContext =
  | 'binary'          // a + b - safe to mutate
  | 'unary'           // -x - usually safe
  | 'increment';      // i++ - never mutate

// ============================================================================
// PARSER
// ============================================================================

export class WGSLParser {
  private tokens: Token[] = [];
  private pos: number = 0;
  private source: string;

  // Parsed results
  public functions: FunctionDecl[] = [];
  public uniforms: UniformDecl[] = [];
  public annotations: AnnotationNode[] = [];

  // Frozen token indices (should not be mutated)
  private frozenRanges: SourceRange[] = [];

  constructor(source: string) {
    this.source = source;
    const lexer = new WGSLLexer(source);
    this.tokens = lexer.tokenize();
  }

  parse(): void {
    while (!this.isAtEnd()) {
      this.parseTopLevel();
    }
  }

  // ---- Token navigation ----

  private current(): Token | null {
    return this.tokens[this.pos] || null;
  }

  private peek(offset: number = 0): Token | null {
    return this.tokens[this.pos + offset] || null;
  }

  private advance(): Token | null {
    if (!this.isAtEnd()) {
      return this.tokens[this.pos++];
    }
    return null;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private skipWhitespaceAndComments(): void {
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
    this.skipWhitespaceAndComments();
    return this.current();
  }

  private match(type: TokenType, value?: string): boolean {
    const t = this.currentNonWS();
    if (!t) return false;
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }

  private consume(type: TokenType, value?: string): Token | null {
    if (this.match(type, value)) {
      return this.advance();
    }
    return null;
  }

  // ---- Parsing ----

  private parseTopLevel(): void {
    this.skipWhitespaceAndComments();
    if (this.isAtEnd()) return;

    // Collect annotations before declarations
    const pendingAnnotations: AnnotationNode[] = [];
    while (this.match('at')) {
      const ann = this.parseAnnotation();
      if (ann) {
        pendingAnnotations.push(ann);
        this.annotations.push(ann);
      }
      this.skipWhitespaceAndComments();
    }

    // Check what declaration follows
    const t = this.currentNonWS();
    if (!t) return;

    if (t.type === 'ident') {
      if (t.value === 'fn') {
        this.parseFunction(pendingAnnotations);
      } else if (t.value === 'var') {
        this.parseVar(pendingAnnotations);
      } else if (t.value === 'let' || t.value === 'const') {
        this.parseLetOrConst();
      } else if (t.value === 'struct') {
        this.parseStruct();
      } else if (t.value === 'type') {
        this.parseTypeAlias();
      } else {
        // Skip unknown
        this.advance();
      }
    } else {
      this.advance();
    }
  }

  private parseAnnotation(): AnnotationNode | null {
    const atToken = this.consume('at');
    if (!atToken) return null;

    this.skipWhitespaceAndComments();
    const nameToken = this.consume('ident');
    if (!nameToken) return null;

    const args: string[] = [];
    let endPos = nameToken.end;
    let endLine = nameToken.line;

    // Check for parenthesized arguments
    this.skipWhitespaceAndComments();
    if (this.match('lparen')) {
      const lp = this.advance()!;
      // Freeze everything inside annotation parens
      let depth = 1;
      let argValue = '';

      while (!this.isAtEnd() && depth > 0) {
        const t = this.advance()!;
        if (t.type === 'lparen') depth++;
        else if (t.type === 'rparen') {
          depth--;
          if (depth === 0) {
            if (argValue.trim()) args.push(argValue.trim());
            endPos = t.end;
            endLine = t.line;
            break;
          }
        } else if (t.type === 'comma' && depth === 1) {
          if (argValue.trim()) args.push(argValue.trim());
          argValue = '';
        } else if (t.type !== 'whitespace') {
          argValue += t.value;
        }
      }

      // Mark annotation range as frozen
      this.frozenRanges.push({
        start: atToken.start,
        end: endPos,
        startLine: atToken.line,
        endLine: endLine
      });
    }

    return {
      name: nameToken.value,
      args,
      range: {
        start: atToken.start,
        end: endPos,
        startLine: atToken.line,
        endLine: endLine
      }
    };
  }

  private parseFunction(annotations: AnnotationNode[]): void {
    const fnToken = this.consume('ident', 'fn');
    if (!fnToken) return;

    this.skipWhitespaceAndComments();
    const nameToken = this.consume('ident');
    if (!nameToken) return;

    const isEntryPoint = annotations.some(a =>
      ['vertex', 'fragment', 'compute'].includes(a.name)
    );

    // Parse parameters
    const params: Array<{ name: string; type: string }> = [];
    this.skipWhitespaceAndComments();
    if (this.match('lparen')) {
      this.advance();
      // Skip to closing paren, collecting param info
      let depth = 1;
      while (!this.isAtEnd() && depth > 0) {
        const t = this.advance()!;
        if (t.type === 'lparen') depth++;
        else if (t.type === 'rparen') depth--;
        // TODO: Could parse param names/types here
      }
    }

    // Parse return type
    let returnType: string | null = null;
    this.skipWhitespaceAndComments();
    if (this.match('arrow')) {
      this.advance();
      // Skip annotations on return type
      while (this.match('at')) {
        this.parseAnnotation();
      }
      // Collect return type tokens
      this.skipWhitespaceAndComments();
      let typeTokens: string[] = [];
      while (!this.isAtEnd() && !this.match('lbrace')) {
        const t = this.advance();
        if (t && t.type !== 'whitespace') {
          typeTokens.push(t.value);
        }
      }
      returnType = typeTokens.join('');
    }

    // Parse body
    this.skipWhitespaceAndComments();
    if (!this.match('lbrace')) return;

    const lbrace = this.advance()!;
    const bodyStart = lbrace.end;
    let bodyEnd = bodyStart;
    let depth = 1;
    let endLine = lbrace.line;

    while (!this.isAtEnd() && depth > 0) {
      const t = this.advance()!;
      if (t.type === 'lbrace') depth++;
      else if (t.type === 'rbrace') {
        depth--;
        if (depth === 0) {
          bodyEnd = t.start;
          endLine = t.line;
        }
      }
    }

    this.functions.push({
      name: nameToken.value,
      range: {
        start: fnToken.start,
        end: bodyEnd,
        startLine: fnToken.line,
        endLine: endLine
      },
      bodyRange: {
        start: bodyStart,
        end: bodyEnd,
        startLine: lbrace.line,
        endLine: endLine
      },
      params,
      returnType,
      isEntryPoint
    });
  }

  private parseVar(annotations: AnnotationNode[]): void {
    const varToken = this.consume('ident', 'var');
    if (!varToken) return;

    // Check for <storage_class>
    let isUniform = false;
    this.skipWhitespaceAndComments();
    if (this.match('langle')) {
      this.advance();
      let depth = 1;
      while (!this.isAtEnd() && depth > 0) {
        const t = this.advance()!;
        if (t.type === 'ident' && t.value === 'uniform') {
          isUniform = true;
        }
        if (t.type === 'langle') depth++;
        else if (t.type === 'rangle') depth--;
      }
    }

    // Get variable name
    this.skipWhitespaceAndComments();
    const nameToken = this.consume('ident');
    if (!nameToken) return;

    // Get type
    let varType = '';
    this.skipWhitespaceAndComments();
    if (this.match('colon')) {
      this.advance();
      this.skipWhitespaceAndComments();
      // Collect type tokens until ; or =
      while (!this.isAtEnd() && !this.match('semicolon') && !this.match('assignment', '=')) {
        const t = this.advance();
        if (t && t.type !== 'whitespace') {
          varType += t.value;
        }
      }
    }

    // Skip to semicolon
    let endPos = nameToken.end;
    let endLine = nameToken.line;
    while (!this.isAtEnd() && !this.match('semicolon')) {
      const t = this.advance()!;
      endPos = t.end;
      endLine = t.line;
    }
    if (this.match('semicolon')) {
      const semi = this.advance()!;
      endPos = semi.end;
      endLine = semi.line;
    }

    // If uniform, record it and freeze the entire declaration
    if (isUniform) {
      const groupAnn = annotations.find(a => a.name === 'group');
      const bindAnn = annotations.find(a => a.name === 'binding');

      this.uniforms.push({
        name: nameToken.value,
        type: varType,
        group: groupAnn && groupAnn.args[0] ? parseInt(groupAnn.args[0]) : 0,
        binding: bindAnn && bindAnn.args[0] ? parseInt(bindAnn.args[0]) : 0,
        range: {
          start: varToken.start,
          end: endPos,
          startLine: varToken.line,
          endLine: endLine
        }
      });

      // Freeze the entire uniform declaration
      this.frozenRanges.push({
        start: annotations.length > 0 ? annotations[0].range.start : varToken.start,
        end: endPos,
        startLine: annotations.length > 0 ? annotations[0].range.startLine : varToken.line,
        endLine: endLine
      });
    }
  }

  private parseLetOrConst(): void {
    // Skip until semicolon
    while (!this.isAtEnd() && !this.match('semicolon')) {
      this.advance();
    }
    if (this.match('semicolon')) {
      this.advance();
    }
  }

  private parseStruct(): void {
    // Skip struct definition
    this.consume('ident', 'struct');
    this.skipWhitespaceAndComments();
    this.consume('ident'); // struct name
    this.skipWhitespaceAndComments();
    if (this.match('lbrace')) {
      this.advance();
      let depth = 1;
      while (!this.isAtEnd() && depth > 0) {
        const t = this.advance()!;
        if (t.type === 'lbrace') depth++;
        else if (t.type === 'rbrace') depth--;
      }
    }
  }

  private parseTypeAlias(): void {
    // Skip type alias
    while (!this.isAtEnd() && !this.match('semicolon')) {
      this.advance();
    }
    if (this.match('semicolon')) {
      this.advance();
    }
  }

  // ---- Mutation Target Extraction ----

  /**
   * Find all numbers that are safe to mutate in a given function
   */
  findMutableNumbers(fn: FunctionDecl): MutableNumber[] {
    const results: MutableNumber[] = [];

    for (let i = 0; i < this.tokens.length; i++) {
      const t = this.tokens[i];

      // Only process number tokens
      if (t.type !== 'number') continue;

      // Must be inside the function body
      if (t.start < fn.bodyRange.start || t.end > fn.bodyRange.end) continue;

      // Check if in a frozen range
      if (this.isInFrozenRange(t.start, t.end)) continue;

      // Determine context
      const context = this.getNumberContext(i, fn);

      // Parse numeric value
      let numericValue: number;
      const val = t.value.toLowerCase();
      if (val.startsWith('0x')) {
        numericValue = parseInt(val, 16);
      } else if (val.endsWith('u') || val.endsWith('i') || val.endsWith('f') || val.endsWith('h')) {
        numericValue = parseFloat(val.slice(0, -1));
      } else {
        numericValue = parseFloat(val);
      }

      results.push({
        value: t.value,
        numericValue,
        range: { start: t.start, end: t.end, startLine: t.line, endLine: t.line },
        context
      });
    }

    return results;
  }

  /**
   * Find all operators that are safe to mutate in a given function
   */
  findMutableOperators(fn: FunctionDecl): MutableOperator[] {
    const results: MutableOperator[] = [];

    for (let i = 0; i < this.tokens.length; i++) {
      const t = this.tokens[i];

      // Only process operator tokens (+ - * / %)
      if (t.type !== 'operator') continue;

      // Must be inside the function body
      if (t.start < fn.bodyRange.start || t.end > fn.bodyRange.end) continue;

      // Check if in a frozen range
      if (this.isInFrozenRange(t.start, t.end)) continue;

      // Determine context
      const context = this.getOperatorContext(i);

      results.push({
        value: t.value,
        range: { start: t.start, end: t.end, startLine: t.line, endLine: t.line },
        context
      });
    }

    return results;
  }

  private isInFrozenRange(start: number, end: number): boolean {
    for (const range of this.frozenRanges) {
      if (start >= range.start && end <= range.end) {
        return true;
      }
    }
    return false;
  }

  private getNumberContext(tokenIndex: number, fn: FunctionDecl): NumberContext {
    // Look backwards for context clues
    let prevNonWS: Token | null = null;
    let prevPrevNonWS: Token | null = null;

    for (let i = tokenIndex - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.type !== 'whitespace' && t.type !== 'comment') {
        if (!prevNonWS) {
          prevNonWS = t;
        } else if (!prevPrevNonWS) {
          prevPrevNonWS = t;
          break;
        }
      }
    }

    // Look forward for context clues
    let nextNonWS: Token | null = null;
    for (let i = tokenIndex + 1; i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (t.type !== 'whitespace' && t.type !== 'comment') {
        nextNonWS = t;
        break;
      }
    }

    // Inside angle brackets (type parameters like vec2<f32>)
    if (prevNonWS?.type === 'langle' || nextNonWS?.type === 'rangle') {
      return 'type-param';
    }

    // After @ (annotation)
    if (prevNonWS?.type === 'at' || prevPrevNonWS?.type === 'at') {
      return 'annotation';
    }

    // In for loop - look for 'for' keyword nearby
    // This is a heuristic: check if we're between 'for' and opening brace
    const forContext = this.detectForLoopContext(tokenIndex);
    if (forContext) {
      return forContext;
    }

    // After dot (swizzle like .xyz)
    if (prevNonWS?.type === 'dot') {
      return 'swizzle';
    }

    // Inside array size declaration
    if (prevNonWS?.type === 'comma' && this.isInsideArrayType(tokenIndex)) {
      return 'array-size';
    }

    return 'expression';
  }

  private detectForLoopContext(tokenIndex: number): NumberContext | null {
    // Scan backwards to find 'for' and track parenthesis depth
    let parenDepth = 0;
    let semicolonCount = 0;
    let foundFor = false;

    for (let i = tokenIndex - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.type === 'rparen') parenDepth++;
      else if (t.type === 'lparen') {
        parenDepth--;
        if (parenDepth < 0) {
          // We've exited the for(...) parens, check if 'for' precedes
          for (let j = i - 1; j >= 0; j--) {
            const prev = this.tokens[j];
            if (prev.type === 'whitespace' || prev.type === 'comment') continue;
            if (prev.type === 'ident' && prev.value === 'for') {
              foundFor = true;
            }
            break;
          }
          break;
        }
      } else if (t.type === 'semicolon' && parenDepth === 0) {
        semicolonCount++;
      } else if (t.type === 'lbrace' || t.type === 'rbrace') {
        // Exited block scope
        break;
      }
    }

    if (!foundFor) return null;

    // Determine which part of for loop based on semicolon count
    if (semicolonCount === 0) return 'loop-init';
    if (semicolonCount === 1) return 'loop-condition';
    if (semicolonCount === 2) return 'loop-increment';

    return null;
  }

  private isInsideArrayType(tokenIndex: number): boolean {
    // Look backwards for 'array<'
    for (let i = tokenIndex - 1; i >= Math.max(0, tokenIndex - 20); i--) {
      const t = this.tokens[i];
      if (t.type === 'ident' && t.value === 'array') {
        // Check if followed by <
        for (let j = i + 1; j < tokenIndex; j++) {
          if (this.tokens[j].type === 'langle') return true;
          if (this.tokens[j].type !== 'whitespace') break;
        }
      }
      if (t.type === 'lbrace' || t.type === 'rbrace' || t.type === 'semicolon') {
        break;
      }
    }
    return false;
  }

  private getOperatorContext(tokenIndex: number): OperatorContext {
    // Look at previous non-whitespace token
    let prevNonWS: Token | null = null;
    for (let i = tokenIndex - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.type !== 'whitespace' && t.type !== 'comment') {
        prevNonWS = t;
        break;
      }
    }

    // Unary if after: = ( , [ { operators comparison assignment
    if (!prevNonWS) return 'unary';

    if (prevNonWS.type === 'assignment' ||
        prevNonWS.type === 'lparen' ||
        prevNonWS.type === 'comma' ||
        prevNonWS.type === 'lbracket' ||
        prevNonWS.type === 'lbrace' ||
        prevNonWS.type === 'operator' ||
        prevNonWS.type === 'comparison' ||
        prevNonWS.type === 'colon') {
      return 'unary';
    }

    return 'binary';
  }

  // ---- Utility methods ----

  getMainFunction(): FunctionDecl | null {
    return this.functions.find(f => f.name === 'main') || null;
  }

  getEntryPoints(): FunctionDecl[] {
    return this.functions.filter(f => f.isEntryPoint);
  }

  getHelperFunctions(): FunctionDecl[] {
    return this.functions.filter(f => !f.isEntryPoint && f.name !== 'main');
  }

  getFrozenRanges(): SourceRange[] {
    return [...this.frozenRanges];
  }
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

export interface ParsedShader {
  source: string;
  parser: WGSLParser;
  mainFunction: FunctionDecl | null;
  entryPoints: FunctionDecl[];
  helperFunctions: FunctionDecl[];
  uniforms: UniformDecl[];
  mutableNumbers: MutableNumber[];
  mutableOperators: MutableOperator[];
}

/**
 * Parse a WGSL shader and extract all mutable targets
 */
export function parseWGSL(source: string): ParsedShader {
  const parser = new WGSLParser(source);
  parser.parse();

  const mainFn = parser.getMainFunction();
  const entryPoints = parser.getEntryPoints();

  // Find all mutable numbers and operators in main/entry functions
  const mutableNumbers: MutableNumber[] = [];
  const mutableOperators: MutableOperator[] = [];

  // First check main function
  if (mainFn) {
    mutableNumbers.push(...parser.findMutableNumbers(mainFn));
    mutableOperators.push(...parser.findMutableOperators(mainFn));
  }

  // Also check entry points (in case main is a helper)
  for (const ep of entryPoints) {
    if (ep.name !== 'main') {
      mutableNumbers.push(...parser.findMutableNumbers(ep));
      mutableOperators.push(...parser.findMutableOperators(ep));
    }
  }

  return {
    source,
    parser,
    mainFunction: mainFn,
    entryPoints,
    helperFunctions: parser.getHelperFunctions(),
    uniforms: parser.uniforms,
    mutableNumbers,
    mutableOperators
  };
}

/**
 * Filter mutable numbers to only those safe for fuzzing
 */
export function getSafeMutableNumbers(parsed: ParsedShader): MutableNumber[] {
  return parsed.mutableNumbers.filter(n =>
    n.context === 'expression'
  );
}

/**
 * Filter mutable operators to only those safe for fuzzing
 */
export function getSafeMutableOperators(parsed: ParsedShader): MutableOperator[] {
  return parsed.mutableOperators.filter(o =>
    o.context === 'binary'
  );
}
