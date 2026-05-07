/**
 * WGSL AST Types - v2 Clean Implementation
 *
 * Complete type definitions for WGSL Abstract Syntax Tree.
 * Every node is fully typed to enable correctness-by-construction.
 *
 * NO REGEX. NO STRING MANIPULATION. PURE AST.
 */

// ============================================================================
// SOURCE LOCATION
// ============================================================================

export interface SourceLocation {
  start: number;
  end: number;
  line: number;
  column: number;
}

// ============================================================================
// WGSL TYPE SYSTEM
// ============================================================================

/**
 * All WGSL types that we track for type-safe expression building
 */
export type WGSLType =
  | 'f32'
  | 'i32'
  | 'u32'
  | 'bool'
  | 'vec2<f32>'
  | 'vec3<f32>'
  | 'vec4<f32>'
  | 'vec2<i32>'
  | 'vec3<i32>'
  | 'vec4<i32>'
  | 'vec2<u32>'
  | 'vec3<u32>'
  | 'vec4<u32>'
  | 'mat2x2<f32>'
  | 'mat3x3<f32>'
  | 'mat4x4<f32>'
  | 'sampler'
  | 'texture_2d<f32>'
  | 'void'
  | 'unknown';

/**
 * Check if a type is a scalar (f32, i32, u32, bool)
 */
export function isScalarType(t: WGSLType): boolean {
  return t === 'f32' || t === 'i32' || t === 'u32' || t === 'bool';
}

/**
 * Check if a type is a vector
 */
export function isVectorType(t: WGSLType): boolean {
  return t.startsWith('vec');
}

/**
 * Check if a type is a matrix
 */
export function isMatrixType(t: WGSLType): boolean {
  return t.startsWith('mat');
}

/**
 * Get the scalar type from a vector type
 */
export function getVectorScalarType(t: WGSLType): WGSLType {
  if (t.includes('<f32>')) return 'f32';
  if (t.includes('<i32>')) return 'i32';
  if (t.includes('<u32>')) return 'u32';
  return 'unknown';
}

/**
 * Get vector dimension (2, 3, or 4)
 */
export function getVectorDimension(t: WGSLType): number {
  if (t.startsWith('vec2')) return 2;
  if (t.startsWith('vec3')) return 3;
  if (t.startsWith('vec4')) return 4;
  return 0;
}

// ============================================================================
// BASE AST NODE
// ============================================================================

export interface ASTNode {
  kind: string;
  loc?: SourceLocation;
}

// ============================================================================
// TOP-LEVEL PROGRAM
// ============================================================================

export interface Program extends ASTNode {
  kind: 'Program';
  declarations: Declaration[];
}

// ============================================================================
// DECLARATIONS
// ============================================================================

export type Declaration =
  | FunctionDecl
  | GlobalVarDecl
  | ConstDecl
  | StructDecl
  | TypeAlias;

export interface Attribute extends ASTNode {
  kind: 'Attribute';
  name: string;
  args: Expression[];
}

export interface FunctionDecl extends ASTNode {
  kind: 'FunctionDecl';
  name: string;
  attributes: Attribute[];
  params: Parameter[];
  returnType: TypeExpr | null;
  returnAttributes: Attribute[];
  body: BlockStmt;
}

export interface Parameter extends ASTNode {
  kind: 'Parameter';
  name: string;
  attributes: Attribute[];
  type: TypeExpr;
}

export interface GlobalVarDecl extends ASTNode {
  kind: 'GlobalVarDecl';
  attributes: Attribute[];
  name: string;
  addressSpace: string | null;
  accessMode: string | null;
  type: TypeExpr | null;
  initializer: Expression | null;
}

export interface ConstDecl extends ASTNode {
  kind: 'ConstDecl';
  name: string;
  type: TypeExpr | null;
  initializer: Expression;
}

export interface StructDecl extends ASTNode {
  kind: 'StructDecl';
  name: string;
  members: StructMember[];
}

export interface StructMember extends ASTNode {
  kind: 'StructMember';
  name: string;
  attributes: Attribute[];
  type: TypeExpr;
}

export interface TypeAlias extends ASTNode {
  kind: 'TypeAlias';
  name: string;
  type: TypeExpr;
}

// ============================================================================
// TYPE EXPRESSIONS
// ============================================================================

export type TypeExpr =
  | NamedTypeExpr
  | GenericTypeExpr
  | ArrayTypeExpr;

export interface NamedTypeExpr extends ASTNode {
  kind: 'NamedTypeExpr';
  name: string;
}

export interface GenericTypeExpr extends ASTNode {
  kind: 'GenericTypeExpr';
  name: string;
  args: TypeExpr[];
}

export interface ArrayTypeExpr extends ASTNode {
  kind: 'ArrayTypeExpr';
  element: TypeExpr;
  size: Expression | null;
}

// ============================================================================
// STATEMENTS
// ============================================================================

export type Statement =
  | BlockStmt
  | LetStmt
  | VarStmt
  | AssignStmt
  | CompoundAssignStmt
  | IncrementStmt
  | DecrementStmt
  | IfStmt
  | ForStmt
  | WhileStmt
  | LoopStmt
  | SwitchStmt
  | BreakStmt
  | ContinueStmt
  | ReturnStmt
  | DiscardStmt
  | ExprStmt;

export interface BlockStmt extends ASTNode {
  kind: 'BlockStmt';
  statements: Statement[];
}

export interface LetStmt extends ASTNode {
  kind: 'LetStmt';
  name: string;
  type: TypeExpr | null;
  initializer: Expression;
}

export interface VarStmt extends ASTNode {
  kind: 'VarStmt';
  name: string;
  type: TypeExpr | null;
  initializer: Expression | null;
}

export interface AssignStmt extends ASTNode {
  kind: 'AssignStmt';
  target: Expression;
  value: Expression;
}

export interface CompoundAssignStmt extends ASTNode {
  kind: 'CompoundAssignStmt';
  operator: '+=' | '-=' | '*=' | '/=' | '%=' | '&=' | '|=' | '^=';
  target: Expression;
  value: Expression;
}

export interface IncrementStmt extends ASTNode {
  kind: 'IncrementStmt';
  operand: Expression;
}

export interface DecrementStmt extends ASTNode {
  kind: 'DecrementStmt';
  operand: Expression;
}

export interface IfStmt extends ASTNode {
  kind: 'IfStmt';
  condition: Expression;
  consequent: BlockStmt;
  alternate: BlockStmt | IfStmt | null;
}

export interface ForStmt extends ASTNode {
  kind: 'ForStmt';
  init: Statement | null;
  condition: Expression | null;
  update: Statement | null;
  body: BlockStmt;
}

export interface WhileStmt extends ASTNode {
  kind: 'WhileStmt';
  condition: Expression;
  body: BlockStmt;
}

export interface LoopStmt extends ASTNode {
  kind: 'LoopStmt';
  body: BlockStmt;
  continuing: BlockStmt | null;
}

export interface SwitchStmt extends ASTNode {
  kind: 'SwitchStmt';
  selector: Expression;
  cases: SwitchCase[];
}

export interface SwitchCase extends ASTNode {
  kind: 'SwitchCase';
  selectors: Expression[];
  isDefault: boolean;
  body: BlockStmt;
}

export interface BreakStmt extends ASTNode {
  kind: 'BreakStmt';
}

export interface ContinueStmt extends ASTNode {
  kind: 'ContinueStmt';
}

export interface ReturnStmt extends ASTNode {
  kind: 'ReturnStmt';
  value: Expression | null;
}

export interface DiscardStmt extends ASTNode {
  kind: 'DiscardStmt';
}

export interface ExprStmt extends ASTNode {
  kind: 'ExprStmt';
  expression: Expression;
}

// ============================================================================
// EXPRESSIONS
// ============================================================================

export type Expression =
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | MemberExpr
  | IndexExpr
  | LiteralExpr
  | IdentifierExpr
  | ParenExpr;

export interface BinaryExpr extends ASTNode {
  kind: 'BinaryExpr';
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
  resultType: WGSLType;
}

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '<' | '>' | '<=' | '>='
  | '&&' | '||'
  | '&' | '|' | '^' | '<<' | '>>';

export interface UnaryExpr extends ASTNode {
  kind: 'UnaryExpr';
  operator: UnaryOperator;
  operand: Expression;
  resultType: WGSLType;
}

export type UnaryOperator = '-' | '!' | '~';

export interface CallExpr extends ASTNode {
  kind: 'CallExpr';
  callee: string;
  args: Expression[];
  resultType: WGSLType;
}

export interface MemberExpr extends ASTNode {
  kind: 'MemberExpr';
  object: Expression;
  member: string;
  resultType: WGSLType;
}

export interface IndexExpr extends ASTNode {
  kind: 'IndexExpr';
  object: Expression;
  index: Expression;
  resultType: WGSLType;
}

export interface LiteralExpr extends ASTNode {
  kind: 'LiteralExpr';
  value: number | boolean;
  raw: string;
  resultType: WGSLType;
}

export interface IdentifierExpr extends ASTNode {
  kind: 'IdentifierExpr';
  name: string;
  resultType: WGSLType;
}

export interface ParenExpr extends ASTNode {
  kind: 'ParenExpr';
  expression: Expression;
  resultType: WGSLType;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isExpression(node: ASTNode): node is Expression {
  return [
    'BinaryExpr', 'UnaryExpr', 'CallExpr', 'MemberExpr',
    'IndexExpr', 'LiteralExpr', 'IdentifierExpr', 'ParenExpr'
  ].includes(node.kind);
}

export function isStatement(node: ASTNode): node is Statement {
  return [
    'BlockStmt', 'LetStmt', 'VarStmt', 'AssignStmt', 'CompoundAssignStmt',
    'IncrementStmt', 'DecrementStmt', 'IfStmt', 'ForStmt', 'WhileStmt',
    'LoopStmt', 'SwitchStmt', 'BreakStmt', 'ContinueStmt', 'ReturnStmt',
    'DiscardStmt', 'ExprStmt'
  ].includes(node.kind);
}

export function isDeclaration(node: ASTNode): node is Declaration {
  return [
    'FunctionDecl', 'GlobalVarDecl', 'ConstDecl', 'StructDecl', 'TypeAlias'
  ].includes(node.kind);
}

// ============================================================================
// RESULT TYPE EXTRACTION
// ============================================================================

/**
 * Get the result type of any expression
 */
export function getExpressionType(expr: Expression): WGSLType {
  switch (expr.kind) {
    case 'BinaryExpr':
    case 'UnaryExpr':
    case 'CallExpr':
    case 'MemberExpr':
    case 'IndexExpr':
    case 'LiteralExpr':
    case 'IdentifierExpr':
    case 'ParenExpr':
      return expr.resultType;
    default:
      return 'unknown';
  }
}
