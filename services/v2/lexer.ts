/**
 * WGSL Lexer - v2 Clean Implementation
 *
 * Tokenizes WGSL source code into a stream of tokens.
 * Pure lexical analysis - no semantic interpretation.
 *
 * NO REGEX FOR PARSING. Simple character-by-character scanning.
 */

// ============================================================================
// TOKEN TYPES
// ============================================================================

export type TokenType =
  | 'number'       // 1.0, .5, 123, 0xFF, 1u, 2i, 3f
  | 'ident'        // variable names, keywords, types
  | 'string'       // "..." (for potential future use)
  | 'operator'     // + - * / %
  | 'comparison'   // == != < > <= >=
  | 'assignment'   // = += -= *= /= %=
  | 'arrow'        // ->
  | 'increment'    // ++ --
  | 'logical'      // && || !
  | 'bitwise'      // & | ^ ~ << >>
  | 'lparen'       // (
  | 'rparen'       // )
  | 'lbrace'       // {
  | 'rbrace'       // }
  | 'lbracket'     // [
  | 'rbracket'     // ]
  | 'langle'       // <
  | 'rangle'       // >
  | 'comma'        // ,
  | 'semicolon'    // ;
  | 'colon'        // :
  | 'dot'          // .
  | 'at'           // @
  | 'comment'      // // ...
  | 'whitespace'   // spaces, tabs, newlines
  | 'eof'          // end of file
  | 'unknown';     // unrecognized

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

// ============================================================================
// KEYWORDS
// ============================================================================

export const KEYWORDS = new Set([
  // Declaration keywords
  'fn', 'let', 'var', 'const', 'struct', 'type', 'override', 'alias',
  // Control flow
  'if', 'else', 'for', 'while', 'loop', 'switch', 'case', 'default',
  'break', 'continue', 'return', 'discard', 'continuing',
  // Boolean literals
  'true', 'false',
  // Address spaces
  'function', 'private', 'workgroup', 'uniform', 'storage',
  // Access modes
  'read', 'write', 'read_write',
]);

export const BUILTIN_TYPES = new Set([
  'bool', 'f32', 'f16', 'i32', 'u32',
  'vec2', 'vec3', 'vec4',
  'mat2x2', 'mat2x3', 'mat2x4',
  'mat3x2', 'mat3x3', 'mat3x4',
  'mat4x2', 'mat4x3', 'mat4x4',
  'array', 'ptr',
  'sampler', 'sampler_comparison',
  'texture_1d', 'texture_2d', 'texture_2d_array', 'texture_3d',
  'texture_cube', 'texture_cube_array', 'texture_multisampled_2d',
  'texture_storage_1d', 'texture_storage_2d', 'texture_storage_2d_array', 'texture_storage_3d',
  'texture_depth_2d', 'texture_depth_2d_array', 'texture_depth_cube', 'texture_depth_cube_array',
  'texture_depth_multisampled_2d',
]);

// ============================================================================
// LEXER CLASS
// ============================================================================

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenize the entire source and return all tokens
   */
  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;

    while (!this.isAtEnd()) {
      const token = this.scanToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    // Add EOF token
    this.tokens.push({
      type: 'eof',
      value: '',
      start: this.pos,
      end: this.pos,
      line: this.line,
      column: this.column,
    });

    return this.tokens;
  }

  /**
   * Get tokens excluding whitespace and comments
   */
  tokenizeClean(): Token[] {
    return this.tokenize().filter(
      t => t.type !== 'whitespace' && t.type !== 'comment'
    );
  }

  // ---- Character Navigation ----

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(offset: number = 0): string {
    const idx = this.pos + offset;
    return idx < this.source.length ? this.source[idx] : '\0';
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

  private makeToken(type: TokenType, value: string, start: number, startLine: number, startColumn: number): Token {
    return {
      type,
      value,
      start,
      end: this.pos,
      line: startLine,
      column: startColumn,
    };
  }

  // ---- Character Classification ----

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isHexDigit(char: string): boolean {
    return this.isDigit(char) ||
      (char >= 'a' && char <= 'f') ||
      (char >= 'A' && char <= 'F');
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      char === '_';
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r';
  }

  // ---- Token Scanning ----

  private scanToken(): Token | null {
    const startPos = this.pos;
    const startLine = this.line;
    const startColumn = this.column;
    const char = this.peek();

    // Whitespace
    if (this.isWhitespace(char)) {
      return this.scanWhitespace(startPos, startLine, startColumn);
    }

    // Comments
    if (char === '/' && this.peek(1) === '/') {
      return this.scanLineComment(startPos, startLine, startColumn);
    }

    // Numbers
    if (this.isDigit(char) || (char === '.' && this.isDigit(this.peek(1)))) {
      return this.scanNumber(startPos, startLine, startColumn);
    }

    // Identifiers and keywords
    if (this.isAlpha(char)) {
      return this.scanIdentifier(startPos, startLine, startColumn);
    }

    // Multi-character operators (check longer first)
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

    // Bitwise compound assignment
    if (twoChar === '&=' || twoChar === '|=' || twoChar === '^=') {
      this.advance(); this.advance();
      return this.makeToken('assignment', twoChar, startPos, startLine, startColumn);
    }

    // Logical operators
    if (twoChar === '&&' || twoChar === '||') {
      this.advance(); this.advance();
      return this.makeToken('logical', twoChar, startPos, startLine, startColumn);
    }

    // Bitwise shift
    if (twoChar === '<<' || twoChar === '>>') {
      this.advance(); this.advance();
      return this.makeToken('bitwise', twoChar, startPos, startLine, startColumn);
    }

    // Single-character tokens
    this.advance();

    switch (char) {
      // Arithmetic operators
      case '+': case '-': case '*': case '/': case '%':
        return this.makeToken('operator', char, startPos, startLine, startColumn);

      // Comparison (single char)
      case '<':
        return this.makeToken('langle', char, startPos, startLine, startColumn);
      case '>':
        return this.makeToken('rangle', char, startPos, startLine, startColumn);

      // Assignment
      case '=':
        return this.makeToken('assignment', char, startPos, startLine, startColumn);

      // Logical
      case '!':
        return this.makeToken('logical', char, startPos, startLine, startColumn);

      // Bitwise
      case '&': case '|': case '^': case '~':
        return this.makeToken('bitwise', char, startPos, startLine, startColumn);

      // Delimiters
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

      // Punctuation
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

  private scanWhitespace(startPos: number, startLine: number, startColumn: number): Token {
    let value = '';
    while (!this.isAtEnd() && this.isWhitespace(this.peek())) {
      value += this.advance();
    }
    return this.makeToken('whitespace', value, startPos, startLine, startColumn);
  }

  private scanLineComment(startPos: number, startLine: number, startColumn: number): Token {
    let value = '';
    // Skip the //
    value += this.advance();
    value += this.advance();
    // Read until end of line
    while (!this.isAtEnd() && this.peek() !== '\n') {
      value += this.advance();
    }
    return this.makeToken('comment', value, startPos, startLine, startColumn);
  }

  private scanNumber(startPos: number, startLine: number, startColumn: number): Token {
    let value = '';

    // Check for hex
    if (this.peek() === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      value += this.advance(); // 0
      value += this.advance(); // x
      while (this.isHexDigit(this.peek())) {
        value += this.advance();
      }
    } else {
      // Integer part
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }

      // Decimal part
      if (this.peek() === '.' && this.peek(1) !== '.') {
        value += this.advance(); // .
        while (this.isDigit(this.peek())) {
          value += this.advance();
        }
      }

      // Exponent part
      if (this.peek() === 'e' || this.peek() === 'E') {
        value += this.advance(); // e
        if (this.peek() === '+' || this.peek() === '-') {
          value += this.advance();
        }
        while (this.isDigit(this.peek())) {
          value += this.advance();
        }
      }
    }

    // Type suffix (u, i, f, h)
    const suffix = this.peek().toLowerCase();
    if (suffix === 'u' || suffix === 'i' || suffix === 'f' || suffix === 'h') {
      // Make sure it's not part of an identifier
      if (!this.isAlpha(this.peek(1))) {
        value += this.advance();
      }
    }

    return this.makeToken('number', value, startPos, startLine, startColumn);
  }

  private scanIdentifier(startPos: number, startLine: number, startColumn: number): Token {
    let value = '';
    while (this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }
    return this.makeToken('ident', value, startPos, startLine, startColumn);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Tokenize a WGSL source string (convenience function)
 */
export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}

/**
 * Tokenize without whitespace and comments
 */
export function tokenizeClean(source: string): Token[] {
  return new Lexer(source).tokenizeClean();
}

/**
 * Check if a string is a WGSL keyword
 */
export function isKeyword(name: string): boolean {
  return KEYWORDS.has(name);
}

/**
 * Check if a string is a builtin type
 */
export function isBuiltinType(name: string): boolean {
  return BUILTIN_TYPES.has(name);
}
