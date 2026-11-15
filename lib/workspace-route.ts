export type WorkspaceRoute = { page: string; subject: string; section: string; target?:string };
const retiredPages = new Set(['workshop','forge','enchant','equipment','shop','redeem','chest','admin','brand-studio','habitat']);
const pages = new Set([
  'home',
  'website',
  'plan',
  'subjects',
  'library',
  'you',
  'devices',
  'analytics',
  'results',
  'super','membership',
  'study',
  'sprint',
  'assessment',
  'exam',
  'course',
  'remedy',
  'onboarding',
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
  if (retiredPages.has(parts[0])) return { page: 'home', subject: 'all', section: '' };
  if (parts[0] === 'you' && parts[2] === 'partner') return { page: 'you', subject: 'all', section: '' };
  const page = pages.has(parts[0]) ? parts[0] : 'home';
  return { page, subject: parts[1] || 'all', section: parts[2] || '', ...(parts[3]?{target:parts[3]}:{}) };
}
export function isRetiredWorkspaceRoute(hash: string) {
  const match = /^#?([^/]+)(?:\/[^/]*\/([^/]+))?/.exec(hash);
  return !!match && (retiredPages.has(match[1]) || (match[1] === 'you' && match[2] === 'partner'));
}
export function workspaceHash({
  page,
  subject = 'all',
  section = '',
  target,
}: Partial<WorkspaceRoute> & { page: string }) {
  return (
    '#' +
    [
      page,
      ...(subject !== 'all' || section || target ? [subject] : []),
      ...(section || target ? [section] : []),
      ...(target ? [target] : []),
    ]
      .map(encodeURIComponent)
      .join('/')
  );
}
export const MAIN_NAV = [
  { id: 'home', label: '今天' },
  { id: 'subjects', label: '学科与资料' },
  { id: 'results', label: '成绩与考试' },
] as const;
export function workspaceSection(page: string) {
  if(['membership','super'].includes(page))return 'you';
  if (['subjects', 'library', 'course'].includes(page)) return 'subjects';
  if (['results', 'analytics', 'exam', 'assessment'].includes(page))
    return 'results';
  if (['plan', 'study', 'sprint', 'remedy', 'onboarding'].includes(page))
    return 'plan';
  return page === 'you' || page === 'devices' || page==='membership'||page==='super' ? 'you' : 'home';
}
