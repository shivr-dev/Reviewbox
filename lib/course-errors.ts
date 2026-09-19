const fallback = '课程请求未完成，请稍后继续；已保存的课程可继续使用。';

/** Never display validator dumps, proxy pages or internal exception details. */
export function courseErrorMessage(error: unknown): string {
  const value = error as {
    name?: string;
    issues?: unknown;
    message?: unknown;
  } | null;
  if (value?.name === 'TimeoutError' || value?.name === 'AbortError')
    return '课程服务响应超时，请稍后继续编制。';
  if (value?.name === 'TypeError')
    return '无法连接课程服务，请检查网络后继续。';
  if (Array.isArray(value?.issues)) {
    const firstIssue = (issues: any[]): any => {
      const issue = issues[0];
      return issue?.code === 'invalid_union'
        ? firstIssue(issue.errors?.[0] ?? [])
        : issue;
    };
    const issue = firstIssue(value.issues);
    const path: unknown[] = issue?.path ?? [];
    const at = path.findIndex(
      (part) => part === 'checks' || part === 'practice',
    );
    const labels: Record<string, string> = {
      prompt: '题干',
      answer: '答案',
      explanation: '解析',
      options: '四个不同选项',
      solution: '解题步骤',
      skill: '对应能力',
    };
    if (at >= 0 && typeof path[at + 1] === 'number') {
      const kind = path[at] === 'checks' ? '理解检验' : '巩固练习';
      const field = labels[String(path[at + 2])] ?? '内容';
      return `第 ${(path[at + 1] as number) + 1} 道${kind}的${field}缺失或格式不正确，请继续编制。`;
    }
    return '课件内容不完整或格式不正确，请继续编制。';
  }
  const message = typeof error === 'string' ? error : value?.message;
  if (typeof message !== 'string' || !message.trim()) return fallback;
  if (/invalid_union|"(?:code|issues|errors|path)"\s*:/.test(message))
    return '课件内容未通过格式检查，请继续编制。';
  if (
    message.length > 400 ||
    /[<>]|\b(?:stack|Error:|Bearer|cfut_)\b/.test(message)
  )
    return fallback;
  return /[\u3400-\u9fff]/.test(message) ? message : fallback;
}
