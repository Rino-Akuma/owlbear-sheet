// Безпечний обчислювач формул (без eval).
// Підтримує: числа, ідентифікатори полів, + - * / , дужки, порівняння, && || !,
// функції floor, ceil, round, abs, min, max, sum, if(умова, а, б).

const FUNCS = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  sum: (...a) => a.reduce((x, y) => x + y, 0),
  if: (c, a, b) => (c ? a : b),
};

const TOKEN_RE = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/(),<>!]))/y;

function tokenize(src) {
  const tokens = [];
  let pos = 0;
  while (pos < src.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new Error(`Невідомий символ у формулі «${src}» (позиція ${pos})`);
    }
    pos = TOKEN_RE.lastIndex;
    if (m[1] !== undefined) tokens.push({ t: 'num', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2] });
    else tokens.push({ t: 'op', v: m[3] });
  }
  return tokens;
}

/** Компілює формулу в { fn(get) -> число, deps:Set<string> }. */
export function compile(source) {
  const src = String(source);
  const tokens = tokenize(src);
  const deps = new Set();
  let i = 0;

  const isOp = (v) => tokens[i] && tokens[i].t === 'op' && tokens[i].v === v;
  const fail = (msg) => { throw new Error(`${msg} у формулі «${src}»`); };

  function binary(next, ops) {
    let left = next();
    while (tokens[i] && tokens[i].t === 'op' && ops.includes(tokens[i].v)) {
      const op = tokens[i++].v;
      const right = next();
      const l = left;
      left = (g) => {
        const a = l(g), b = right(g);
        switch (op) {
          case '||': return (a || b) ? 1 : 0;
          case '&&': return (a && b) ? 1 : 0;
          case '==': return a === b ? 1 : 0;
          case '!=': return a !== b ? 1 : 0;
          case '<': return a < b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          case '>=': return a >= b ? 1 : 0;
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return b === 0 ? 0 : a / b;
        }
        return 0;
      };
    }
    return left;
  }

  const parseOr = () => binary(parseAnd, ['||']);
  const parseAnd = () => binary(parseCmp, ['&&']);
  const parseCmp = () => binary(parseAdd, ['==', '!=', '<=', '>=', '<', '>']);
  const parseAdd = () => binary(parseMul, ['+', '-']);
  const parseMul = () => binary(parseUnary, ['*', '/']);

  function parseUnary() {
    if (isOp('-')) { i++; const e = parseUnary(); return (g) => -e(g); }
    if (isOp('!')) { i++; const e = parseUnary(); return (g) => (e(g) ? 0 : 1); }
    return parsePrimary();
  }

  function parsePrimary() {
    const tk = tokens[i++];
    if (!tk) fail('Несподіваний кінець');
    if (tk.t === 'num') return () => tk.v;
    if (tk.t === 'id') {
      if (isOp('(')) {
        const f = FUNCS[tk.v];
        if (!f) fail(`Невідома функція «${tk.v}»`);
        i++;
        const args = [];
        if (!isOp(')')) {
          args.push(parseOr());
          while (isOp(',')) { i++; args.push(parseOr()); }
        }
        if (!isOp(')')) fail('Очікувалась )');
        i++;
        return (g) => f(...args.map((a) => a(g)));
      }
      deps.add(tk.v);
      const name = tk.v;
      return (g) => g(name);
    }
    if (tk.v === '(') {
      const e = parseOr();
      if (!isOp(')')) fail('Очікувалась )');
      i++;
      return e;
    }
    return fail(`Неочікуваний символ «${tk.v}»`);
  }

  const fn = parseOr();
  if (i < tokens.length) fail(`Зайвий символ «${tokens[i].v}»`);
  return { fn, deps };
}
