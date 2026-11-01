// User input remains data, never shell commands, workflow expressions or executable code.
export const feedbackLabels = { bug: 'bug', suggestion: 'enhancement', question: 'question' };
export function issueBody(report) {
  const longest = Math.max(
    2,
    ...(report.description.match(/`+/g) ?? []).map((s) => s.length),
  );
  const fence = '`'.repeat(longest + 1);
  const environment = report.environment
    ? `\n### 自愿附带的环境\n版本：${report.environment.build} · 浏览器：${report.environment.browser} · 屏幕类别：${report.environment.viewport}\n`
    : '';
  return `<!-- reviewbox-feedback:${report.id} -->\n来自 Reviewbox 网页公开反馈（用户已确认公开）。\n\n功能区：${report.area}\n\n### 问题描述\n${fence}text\n${report.description}\n${fence}\n${environment}\n此反馈未自动附带账户、学习内容、成绩或作答记录。`;
}
export async function publishFeedback({
  github,
  identityToken,
  request = fetch,
}) {
  const endpoint =
    'https://svaaepnixdoxubjxqgyr.supabase.co/functions/v1/review-feedback/';
  async function operation(action, body) {
    const r = await request(endpoint + action, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + identityToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const value = await r.json();
    if (!r.ok || value.error)
      throw new Error('Feedback delivery operation failed: ' + r.status);
    return value;
  }
  const { reports } = await operation('claim', {});
  let delivered = 0;
  for (const report of reports) {
    try {
      const marker = `<!-- reviewbox-feedback:${report.id} -->`;
      // List directly rather than search: the search index can lag behind a just-created issue.
      const since = new Date(
        Date.parse(report.createdAt) - 86400000,
      ).toISOString();
      let existing;
      for (let page = 1; page <= 10 && !existing; page++) {
        const { data } = await github.rest.issues.listForRepo({
          owner: 'shivr-dev',
          repo: 'Reviewbox',
          state: 'all',
          per_page: 100,
          page,
          since,
        });
        existing = data.find(
          (i) => !i.pull_request && i.body?.includes(marker),
        );
        if (data.length < 100) break;
        if (page === 10 && !existing)
          throw new Error('Issue scan capacity reached');
      }
      const issue =
        existing ??
        (
          await github.rest.issues.create({
            owner: 'shivr-dev',
            repo: 'Reviewbox',
            title: '[网页反馈] ' + report.title.replace(/@/g, '@\u200b'),
            body: issueBody(report),
            labels: [feedbackLabels[report.category] ?? 'bug'],
          })
        ).data;
      await operation('ack', {
        id: report.id,
        lease: report.lease,
        url: issue.html_url,
      });
      delivered++;
    } catch {
      await operation('release', { id: report.id, lease: report.lease });
      // No report text, response body, authentication tokens or user environment in build logs.
    }
  }
  if (delivered !== reports.length)
    throw new Error(
      `Delivered ${delivered}/${reports.length}; remaining reports will retry.`,
    );
  return delivered;
}
export async function closeAnsweredIssues({ github, eventName, payload }) {
  const label = 'Answered 已答';
  let issues = [];
  if (eventName === 'issues') {
    const issue = payload.issue;
    if (payload.action === 'labeled' && payload.label?.name !== label) return 0;
    if (!issue || issue.state !== 'open' || !issue.labels?.some(l => (typeof l === 'string' ? l : l.name) === label)) return 0;
    issues = [issue];
  } else {
    for (let page = 1; page <= 10; page++) {
      const { data } = await github.rest.issues.listForRepo({ owner: 'shivr-dev', repo: 'Reviewbox', state: 'open', labels: label, per_page: 100, page });
      issues.push(...data.filter(i => !i.pull_request));
      if (data.length < 100) break;
    }
  }
  for (const issue of issues) await github.rest.issues.update({ owner: 'shivr-dev', repo: 'Reviewbox', issue_number: issue.number, state: 'closed', state_reason: 'completed' });
  return issues.length;
}
