export type ASTNode =
  | { kind: 'number'; value: number }
  | { kind: 'unary'; op: '-'; operand: ASTNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: ASTNode; right: ASTNode }
