export type WorkspaceRoute = { page: string; subject: string; section: string };
const pages = new Set([
  'home',
  'plan',
  'subjects',
  'library',
  'you',
  'devices',
  'analytics',
  'results',
  'workshop',
  'forge',
  'enchant',
  'equipment',
  'shop',
  'redeem',
  'admin',
  'super',
  'study',
  'assessment',
  'exam',
  'course',
  'remedy',
  'chest',
  'onboarding',
  'brand-studio',
]);
export function parseWorkspaceRoute(hash: string): WorkspaceRoute {
  const parts = hash
    .replace(/^#/, '')
    .split('/')
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return '';
      }
    });
  const page = pages.has(parts[0]) ? parts[0] : 'home';
  return { page, subject: parts[1] || 'all', section: parts[2] || '' };
}
export function workspaceHash({
  page,
  subject = 'all',
  section = '',
}: Partial<WorkspaceRoute> & { page: string }) {
  return (
    '#' +
    [
      page,
      ...(subject !== 'all' || section ? [subject] : []),
      ...(section ? [section] : []),
    ]
      .map(encodeURIComponent)
      .join('/')
  );
}
export const MAIN_NAV = [
  { id: 'home', label: '今天' },
  { id: 'plan', label: '学习计划' },
  { id: 'subjects', label: '学科与资料' },
  { id: 'results', label: '成绩与考试' },
  { id: 'workshop', label: '工坊' },
] as const;
export function workspaceSection(page: string) {
  if (['subjects', 'library', 'course'].includes(page)) return 'subjects';
  if (['results', 'analytics', 'exam', 'assessment'].includes(page))
    return 'results';
  if (
    [
      'workshop',
      'forge',
      'enchant',
      'equipment',
      'shop',
      'redeem',
      'super',
      'admin',
          'brand-studio',
    ].includes(page)
  )
    return 'workshop';
  if (['plan', 'study', 'remedy', 'chest', 'onboarding'].includes(page))
    return 'plan';
  return page === 'you' || page === 'devices' ? 'you' : 'home';
}
