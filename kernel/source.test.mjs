import { stripComments } from './source.mjs';

const cases = [
  ['a // globalOutbound: null', 'a '],
  ['/* globalOutbound: null */ b', '                           b'.replace(/^ {27}/, ' '.repeat(26))],
  ["x = 'http://a/b' // c", "x = 'http://a/b' "],
  ['y = `${u}//x` // c', 'y = `${u}//x` '],
  ['r = /a\\/\\/b/g; // c', 'r = /a\\/\\/b/g; '],
  ['line1 /* a\nb */ line2', 'line1     \n    line2'],
  ['z = a / b // c', 'z = a / b '],
];
let failed = 0;
for (const [input, want] of cases) {
  const got = stripComments(input);
  const ok = input.includes('/*') ? got.split('\n').length === input.split('\n').length && !/globalOutbound|a\nb/.test(got) : got === want;
  if (!ok) {
    failed++;
    console.log(`FAIL ${JSON.stringify(input)} -> ${JSON.stringify(got)}`);
  }
}
console.log(`${cases.length - failed}/${cases.length} strip cases pass`);
process.exit(failed ? 1 : 0);
