/**
 * Safe arithmetic calculator — hand-written recursive-descent parser.
 * NO eval / Function constructor anywhere. Supports:
 *   + - * / % ^ unary-minus parentheses, integers & decimals.
 * Anything else (letters, assignments, injection attempts) is rejected.
 */

export class CalcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CalcError'
  }
}

type OpChar = '+' | '-' | '*' | '/' | '%' | '^'

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; value: OpChar }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

const OPERATORS = new Set<OpChar>(['+', '-', '*', '/', '%', '^'])

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const s = input
  while (i < s.length) {
    const ch = s[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      let dotCount = 0
      while (j < s.length && /[0-9.]/.test(s[j])) {
        if (s[j] === '.') dotCount++
        if (dotCount > 1) throw new CalcError(`Malformed number at position ${j}`)
        j++
      }
      const numStr = s.slice(i, j)
      const value = Number(numStr)
      if (!Number.isFinite(value)) throw new CalcError(`Malformed number "${numStr}"`)
      tokens.push({ kind: 'num', value })
      i = j
      continue
    }
    if (OPERATORS.has(ch as OpChar)) {
      tokens.push({ kind: 'op', value: ch as OpChar })
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' })
      i++
      continue
    }
    throw new CalcError(`Illegal character "${ch}" at position ${i}`)
  }
  if (tokens.length === 0) throw new CalcError('Empty expression')
  return tokens
}

// Grammar (precedence low→high):
//   expr    := term (('+'|'-') term)*
//   term    := factor (('*'|'/'|'%') factor)*
//   factor  := unary ('^' factor)?          // right-assoc power
//   unary   := '-' unary | primary
//   primary := NUMBER | '(' expr ')'

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token {
    const t = this.tokens[this.pos]
    if (!t) throw new CalcError('Unexpected end of expression')
    this.pos++
    return t
  }

  parse(): number {
    const v = this.expr()
    if (this.pos !== this.tokens.length) {
      throw new CalcError('Unexpected trailing tokens')
    }
    return v
  }

  private expr(): number {
    let left = this.term()
    for (;;) {
      const t = this.peek()
      if (t && t.kind === 'op' && (t.value === '+' || t.value === '-')) {
        this.next()
        const right = this.term()
        left = t.value === '+' ? left + right : left - right
      } else return left
    }
  }

  private term(): number {
    let left = this.factor()
    for (;;) {
      const t = this.peek()
      if (t && t.kind === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        this.next()
        const right = this.factor()
        if ((t.value === '/' || t.value === '%') && right === 0) {
          throw new CalcError('Division by zero')
        }
        left = t.value === '*' ? left * right : t.value === '/' ? left / right : left % right
      } else return left
    }
  }

  private factor(): number {
    const base = this.unary()
    const t = this.peek()
    if (t && t.kind === 'op' && t.value === '^') {
      this.next()
      const exp = this.factor() // right-associative
      const v = Math.pow(base, exp)
      if (!Number.isFinite(v)) throw new CalcError('Result out of range')
      return v
    }
    return base
  }

  private unary(): number {
    const t = this.peek()
    if (t && t.kind === 'op' && t.value === '-') {
      this.next()
      return -this.unary()
    }
    return this.primary()
  }

  private primary(): number {
    const t = this.next()
    if (t.kind === 'num') return t.value
    if (t.kind === 'lparen') {
      const v = this.expr()
      const close = this.next()
      if (close.kind !== 'rparen') throw new CalcError('Expected closing parenthesis')
      return v
    }
    throw new CalcError('Expected number or opening parenthesis')
  }
}

/** Evaluate a safe arithmetic expression. Throws CalcError on anything invalid. */
export function calculate(expression: string): number {
  if (!expression || expression.length > 500) {
    throw new CalcError('Expression empty or too long (max 500 chars)')
  }
  const result = new Parser(tokenize(expression)).parse()
  if (!Number.isFinite(result)) throw new CalcError('Result is not finite')
  return result
}
