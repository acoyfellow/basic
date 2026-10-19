const REGEX_CAN_FOLLOW = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const KEYWORDS_BEFORE_REGEX = /(?:^|[^\w$])(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)\s*$/;

const lastSignificant = (text) => {
  for (let i = text.length - 1; i >= 0; i--) if (!/\s/.test(text[i])) return text[i];
  return '';
};

export const stripComments = (source) => {
  let out = '';
  let i = 0;
  const templateDepth = [];
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      out += c;
      i++;
      while (i < source.length && source[i] !== c && source[i] !== '\n') {
        if (source[i] === '\\') out += source[i++];
        out += source[i++] ?? '';
      }
      out += source[i++] ?? '';
      continue;
    }
    if (c === '`' || (c === '}' && templateDepth.at(-1) === 0)) {
      if (c === '}') templateDepth.pop();
      out += c;
      i++;
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          out += source[i++];
          out += source[i++] ?? '';
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          out += '${';
          i += 2;
          templateDepth.push(0);
          break;
        }
        out += source[i++];
      }
      if (source[i] === '`') out += source[i++];
      continue;
    }
    if (c === '{' && templateDepth.length) templateDepth[templateDepth.length - 1]++;
    if (c === '}' && templateDepth.length) templateDepth[templateDepth.length - 1]--;
    if (c === '/' && (REGEX_CAN_FOLLOW.has(lastSignificant(out)) || KEYWORDS_BEFORE_REGEX.test(out.slice(-12)))) {
      out += c;
      i++;
      let inClass = false;
      while (i < source.length && source[i] !== '\n') {
        const r = source[i];
        if (r === '\\') {
          out += source[i++];
          out += source[i++] ?? '';
          continue;
        }
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
        out += source[i++];
      }
      out += source[i++] ?? '';
      continue;
    }
    out += c;
    i++;
  }
  return out;
};
