import { parse } from './RegexParser.ts';
import { toNFA } from './AutomataEngine.ts';
import fs from 'fs';
const ast = parse('(a|b)*').ast;
const nfa = toNFA(ast);
const result = JSON.stringify(nfa, (k,v) => v instanceof Set ? [...v] : v instanceof Map ? [...v.entries()] : v, 2);
fs.writeFileSync('C:/Users/91999/OneDrive/Desktop/tempTuring/out.json', result);
