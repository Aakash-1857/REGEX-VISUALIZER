/**
 * RegexParser.ts — Recursive-descent parser for regular expressions.
 *
 * Produces a typed AST (RegexNode) from an input string.
 * No RegExp objects are used. This is a hand-written parser with
 * error recovery for unbalanced parentheses.
 *
 * Grammar (in decreasing precedence):
 *   Union    ::= Concat ('|' Concat)*
 *   Concat   ::= Star Star*
 *   Star     ::= Atom ('*' | '+' | '?')*
 *   Atom     ::= literal | '(' Union ')' | 'ε' | 'ε'
 *
 * Supported:
 *   - Literals: any non-meta character, or escaped meta (\*, \|, etc.)
 *   - Union: a|b
 *   - Concatenation: ab (implicit)
 *   - Kleene star: a*
 *   - One-or-more: a+ (desugars to aa*)
 *   - Optional: a? (desugars to a|ε)
 *   - Grouping: (expr)
 *   - Epsilon: ε or the literal character ε
 *   - Empty set: ∅
 */

import type { RegexNode, ParseError, ParseResult } from '../types/automata';

/** Meta characters: |, *, +, ?, (, ) — used for grammar rules, not as a runtime set. */

/**
 * Parse a regular expression string into a typed AST.
 *
 * @param input - The regex string to parse.
 * @returns ParseResult with a (possibly partial) AST and any parse errors.
 *
 * @example
 *   parse("(a|b)*abb")
 *   // → { ast: { type: 'concat', ... }, errors: [] }
 *
 *   parse("(ab")
 *   // → { ast: ..., errors: [{ message: 'Unbalanced ...', spanStart: 0, spanEnd: 2 }] }
 */
export function parse(input: string): ParseResult {
  const parser = new Parser(input);
  const ast = parser.parseUnion();
  return { ast, errors: parser.errors };
}

/**
 * Internal parser state machine.
 *
 * Maintains a position cursor `pos` over the input string and
 * collects ParseError objects for resilient parsing.
 */
class Parser {
  readonly input: string;
  pos: number;
  errors: ParseError[];

  constructor(input: string) {
    this.input = input;
    this.pos = 0;
    this.errors = [];
  }

  /** Peek at the current character without consuming. Returns '' at EOF. */
  private peek(): string {
    return this.pos < this.input.length ? this.input[this.pos] : '';
  }

  /** Consume and return the current character, advancing the cursor. */
  private consume(): string {
    return this.input[this.pos++];
  }

  /** Whether the cursor has reached the end of input. */
  private atEnd(): boolean {
    return this.pos >= this.input.length;
  }

  /**
   * parseUnion — Lowest precedence.
   *
   * Union ::= Concat ('|' Concat)*
   *
   * Mathematically: L(r₁ | r₂) = L(r₁) ∪ L(r₂)
   */
  parseUnion(): RegexNode | null {
    let left = this.parseConcat();
    while (this.peek() === '|') {
      this.consume(); // eat '|'
      const right = this.parseConcat();
      if (left === null && right === null) {
        // ε | ε
        left = { type: 'epsilon' };
      } else if (left === null) {
        left = { type: 'union', left: { type: 'epsilon' }, right: right! };
      } else if (right === null) {
        left = { type: 'union', left, right: { type: 'epsilon' } };
      } else {
        left = { type: 'union', left, right };
      }
    }
    return left;
  }

  /**
   * parseConcat — Middle precedence (implicit concatenation).
   *
   * Concat ::= Star Star*
   *
   * Two atoms adjacent with no operator → concatenation.
   * Mathematically: L(r₁r₂) = { xy : x ∈ L(r₁), y ∈ L(r₂) }
   */
  private parseConcat(): RegexNode | null {
    let left = this.parseStar();

    while (!this.atEnd() && this.peek() !== '|' && this.peek() !== ')') {
      const right = this.parseStar();
      if (right === null) break;
      if (left === null) {
        left = right;
      } else {
        left = { type: 'concat', left, right };
      }
    }

    return left;
  }

  /**
   * parseStar — Highest unary precedence.
   *
   * Star ::= Atom ('*' | '+' | '?')*
   *
   * Desugaring:
   *   r* = Kleene star: L(r*) = ∪_{i≥0} L(r)^i
   *   r+ = rr*          (one or more)
   *   r? = r | ε        (optional)
   */
  private parseStar(): RegexNode | null {
    let node = this.parseAtom();
    if (node === null) return null;

    while (this.peek() === '*' || this.peek() === '+' || this.peek() === '?') {
      const op = this.consume();
      if (op === '*') {
        // Kleene star: L(r*) = {ε} ∪ L(r) ∪ L(r)L(r) ∪ ...
        node = { type: 'star', child: node };
      } else if (op === '+') {
        // One-or-more: r+ ≡ rr*
        node = { type: 'concat', left: node, right: { type: 'star', child: node } };
      } else if (op === '?') {
        // Optional: r? ≡ r | ε
        node = { type: 'union', left: node, right: { type: 'epsilon' } };
      }
    }

    return node;
  }

  /**
   * parseAtom — Atomic (highest) precedence.
   *
   * Atom ::= literal | '(' Union ')' | 'ε' | '∅'
   *
   * Handles:
   * - Parenthesized groups with error recovery for unbalanced parens
   * - Escaped characters: \*, \(, \|, \\, etc.
   * - Epsilon character: ε
   * - Empty set character: ∅
   * - Any non-meta literal character
   */
  private parseAtom(): RegexNode | null {
    const ch = this.peek();

    if (ch === '') return null;

    // ── Parenthesized group ──
    if (ch === '(') {
      const openPos = this.pos;
      this.consume(); // eat '('
      const inner = this.parseUnion();

      if (this.peek() === ')') {
        this.consume(); // eat ')'
      } else {
        // Unbalanced parenthesis — emit error, return partial AST
        this.errors.push({
          message: `Unbalanced '(': expected closing ')' but reached end of input`,
          spanStart: openPos,
          spanEnd: this.pos,
        });
      }

      return inner ?? { type: 'epsilon' };
    }

    // ── Closing paren without open — let caller handle ──
    if (ch === ')') {
      return null;
    }

    // ── Unary operators without operand ──
    if (ch === '*' || ch === '+' || ch === '?') {
      return null;
    }

    // ── Escape sequences ──
    if (ch === '\\') {
      this.consume(); // eat '\'
      if (this.atEnd()) {
        this.errors.push({
          message: `Trailing backslash at end of input`,
          spanStart: this.pos - 1,
          spanEnd: this.pos,
        });
        return { type: 'literal', char: '\\' };
      }
      const escaped = this.consume();
      return { type: 'literal', char: escaped };
    }

    // ── Epsilon literal ──
    if (ch === 'ε') {
      this.consume();
      return { type: 'epsilon' };
    }

    // ── Empty set literal ──
    if (ch === '∅') {
      this.consume();
      return { type: 'empty' };
    }

    // ── Dot (wildcard) — we treat as literal since we don't have a defined alphabet up front ──
    // The user can use it as a regular character; for automata purposes it's just '.'
    if (ch === '.') {
      this.consume();
      return { type: 'literal', char: '.' };
    }

    // ── Regular literal ──
    this.consume();
    return { type: 'literal', char: ch };
  }
}
