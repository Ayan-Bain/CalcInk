import type { ASTNode } from './ast'
import { tokenize, type Token, type TokenKind } from './lexer'

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(input: string) {
    this.tokens = tokenize(input)
  }

  private peek(): Token { return this.tokens[this.pos] }
  private consume(): Token { return this.tokens[this.pos++] }
  private expect(kind: TokenKind): Token {
    const tok = this.consume()
    if (tok.kind !== kind) throw new Error(`Expected ${kind}, got ${tok.kind}`)
    return tok
  }

  parse(): ASTNode {
    const node = this.parseExpression()
    const next = this.peek()
    if (next.kind === 'equals') this.consume()
    if (this.peek().kind !== 'eof') throw new Error('Unexpected tokens after expression')
    return node
  }

  // expression := term ((+ | -) term)*
  private parseExpression(): ASTNode {
    let left = this.parseTerm()
    while (this.peek().kind === 'plus' || this.peek().kind === 'minus') {
      const op = this.consume().kind === 'plus' ? '+' : '-'
      const right = this.parseTerm()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  // term := factor ((* | /) factor)*
  private parseTerm(): ASTNode {
    let left = this.parseFactor()
    while (this.peek().kind === 'mul' || this.peek().kind === 'div') {
      const op = this.consume().kind === 'mul' ? '*' : '/'
      const right = this.parseFactor()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  // factor := ('-' factor) | '(' expression ')' | number
  private parseFactor(): ASTNode {
    if (this.peek().kind === 'minus') {
      this.consume()
      const operand = this.parseFactor()
      return { kind: 'unary', op: '-', operand }
    }
    if (this.peek().kind === 'lparen') {
      this.consume()
      const node = this.parseExpression()
      this.expect('rparen')
      return node
    }
    return this.parseNumber()
  }

  private parseNumber(): ASTNode {
    const tok = this.expect('number')
    return { kind: 'number', value: tok.value! }
  }
}

export function parse(input: string): ASTNode {
  return new Parser(input).parse()
}
