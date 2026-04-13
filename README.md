# RE Lab — Regular Expression Visualizer

> Enter a regular expression. See the strings it generates.
> Prove two expressions equivalent — or find the string that breaks them.

#### Made by: Aakash Gupta, B.Tech NSUT, Mathematics and Computing (2024UCM2848)
---

## What It Does

You type a regular expression. The tool does three things:

1. **Generates** a ranked list of strings belonging to the language L(R)
2. **Visualizes** the underlying automaton — NFA → DFA → Minimized DFA
3. **Checks equivalence** — given RE₁ and RE₂, either proves L(RE₁) = L(RE₂)
   or produces the shortest counterexample string

---

## Motivation

Regular expressions are taught formally but rarely *shown*. It is non-obvious
that `(a|b)*` and `(a*b*)*` define identical languages, or that `(a+)+`
is redundant. This tool makes those facts visible and interactive.

---

## Core Features

### Symbol Palette
Click-to-build interface. No need to memorize syntax.
Palette groups: operators (`|` `*` `+` `?`), grouping, character classes,
quantifiers, escape sequences. Every click inserts a syntactically valid token.

### String Generator
Produces members of L(R) in non-decreasing length order via BFS over the
minimized DFA. Output is deterministic and shortest-first — you see `ε`, `a`,
`ab` before `aababba`.
```
RE:  (a|b)*abb

Generated strings (L ≤ 6):
  abb, aabb, babb, aaabb, ababb, ...
```

Configurable max length and max count. Correctly includes `ε` when the
expression is nullable.

### Automata Pipeline
The string generator is backed by a full formal pipeline:
```
RE  ──►  NFA  ──►  DFA  ──►  MinDFA
     Thompson  Powerset   Hopcroft
```

Each stage is inspectable on the canvas. The minimized DFA is what drives
generation and equivalence checking.

### Equivalence Checker
Input two regular expressions. The tool minimizes both and checks
structural isomorphism.

**If equivalent** — displays the state bijection: q₀(RE₁) ↔ q₀(RE₂), etc.

**If not equivalent** — computes the symmetric difference L(RE₁) △ L(RE₂)
and returns the shortest witness string *w* such that one expression
accepts *w* and the other rejects it. The string is loaded into the tester
so you can step through both machines simultaneously.

---

## Example: Proving Equivalence
```
RE₁:  (a|b)*
RE₂:  (a*b*)*

Minimized DFA — RE₁:  1 state (self-loop on a, b; accepting)
Minimized DFA — RE₂:  1 state (self-loop on a, b; accepting)

Result: EQUIVALENT  ✓
Bijection: q₀(RE₁) ↔ q₀(RE₂)
```
```
RE₁:  a*b
RE₂:  ab*

Result: NOT EQUIVALENT  ✗
Witness: "b"  — accepted by RE₁, rejected by RE₂
```

---

## Supported Syntax

| Construct | Notation | Example |
|---|---|---|
| Union | `\|` | `a\|b` |
| Concatenation | implicit | `ab` |
| Kleene star | `*` | `a*` |
| One or more | `+` | `a+` |
| Optional | `?` | `a?` |
| Grouping | `(…)` | `(ab)*` |
| Literal escape | `\` | `\*` matches `*` |

---

## Stack

- **Vite + React + TypeScript** — application shell
- **Tailwind CSS** — styling
- **Cytoscape.js** — automaton graph rendering
- **Vitest** — unit tests on the logic layer

The parser, Thompson construction, subset construction, Hopcroft minimization,
and BFS string generator are all implemented from scratch in pure TypeScript.
No external regex or automata libraries are used.

---

## Running Locally
```bash
git clone https://github.com/<user>/re-lab
cd re-lab
npm install
npm run dev
```

---

## License

MIT
