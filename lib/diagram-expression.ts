export function evaluateExpression(expression: string, x: number) {
  if (expression.length > 250) throw new Error('表达式过长');
  const tokens =
    expression.match(/(?:\d*\.)?\d+(?:e[+-]?\d+)?|x|[()+\-*/^]/gi) ?? [];
  if (tokens.join('') !== expression.replace(/\s/g, ''))
    throw new Error('不支持的表达式');
  let i = 0,
    steps = 0;
  function atom(): number {
    if (++steps > 500) throw new Error('表达式过于复杂');
    const t = tokens[i++];
    if (t === '(') {
      const y = sum();
      if (tokens[i++] !== ')') throw new Error('括号不匹配');
      return y;
    }
    if (t === 'x') return x;
    if (!t || !Number.isFinite(Number(t))) throw new Error('表达式不完整');
    return Number(t);
  }
  function power(): number {
    let y = atom();
    if (tokens[i] === '^') {
      i++;
      const p = unary();
      if (Math.abs(p) > 20) throw new Error('指数过大');
      y = Math.pow(y, p);
    }
    return y;
  }
  function unary(): number {
    if (tokens[i] === '-') {
      i++;
      return -unary();
    }
    if (tokens[i] === '+') {
      i++;
      return unary();
    }
    return power();
  }
  function mul(): number {
    let y = unary();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++],
        b = unary();
      y = op === '*' ? y * b : y / b;
    }
    return y;
  }
  function sum(): number {
    let y = mul();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++],
        b = mul();
      y = op === '+' ? y + b : y - b;
    }
    return y;
  }
  const y = sum();
  if (i !== tokens.length) throw new Error('表达式不正确');
  return y;
}
