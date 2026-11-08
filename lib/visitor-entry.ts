import type { StudyData } from './model';

/** User-owned work counts as a return visit; framework nodes and an account alone do not. */
export function hasLearningWorkspace(data: StudyData): boolean {
  return !!(
    data.events.length || data.tests.length || data.questions.length ||
    data.materials.length || data.notes.length || data.exams.length ||
    data.settings.assistant?.onboardedAt ||
    data.jobs?.some(job => ['course', 'session', 'assessment', 'exam-run', 'remediation'].includes(job.kind))
  );
}
