import type { ExamDetails } from './exam-schedule';
import { SUBJECTS, type StudyData, type Subject } from './model';
import type { SprintGoal } from './exam-sprint';

export const CHECK_IN_GOALS = ['exam', 'retention', 'course', 'gpa', 'explore'] as const;
export const STUDY_MODES = ['auto', 'guided', 'manual'] as const;
type StudyMode = typeof STUDY_MODES[number];
type ModeAnswers = { start?: StudyMode; adjust?: StudyMode; confirmed?: StudyMode };

export function recommendStudyMode(answers?: ModeAnswers): StudyMode | undefined {
  const { start, adjust } = answers ?? {};
  if (start && adjust && start !== adjust) return 'guided';
  return start ?? adjust;
}
export type LearningProfile = {
  stage: '' | 'middle' | 'high' | 'higher' | 'other';
  goals: (typeof CHECK_IN_GOALS[number])[];
  subjects: Subject[];
  priorities: Subject[];
  routine: '' | 'school' | 'home' | 'flexible';
  minutes: number;
  days: number;
  mode: StudyMode;
  help: 'hint' | 'steps';
  independent: boolean;
  format: 'concept' | 'practice' | 'mixed';
  materials: boolean;
  diagnostic: boolean;
  grading: '' | 'percent' | 'letter' | 'four' | 'five' | 'custom';
  credits: boolean;
  trackGpa: boolean;
  schoolRules: boolean;
};
export type CheckInDraft = {
  step: 'welcome' | 'demo' | 'symbols' | 'profile' | 'routine' | 'rhythm' | 'method' |
    'mode-adjust' | 'mode-result' | 'review-format' | 'navi-help' |
    'subjects' | 'weights' | 'goals' | 'gpa' | 'materials' | 'diagnostic' |
    'agreement' | 'account' | 'ready';
  profile: LearningProfile;
  exam?: ExamDetails & { scoreReminder: boolean };
  examKey: string;
  weights?: Record<string, number>;
  modeAnswers?: ModeAnswers;
};
export function learningProfile(data: StudyData): LearningProfile {
  if (data.settings.learningProfile) return {
    ...data.settings.learningProfile,
    mode: data.settings.studyMode ?? data.settings.learningProfile.mode,
  };
  const weights = data.settings.assistant?.weights;
  const subjects = weights ? SUBJECTS.filter(s => (weights[s.id] ?? 1) > 0).map(s => s.id) : [];
  return {
    stage: '', goals: [], subjects,
    priorities: subjects.filter(s => (weights?.[s] ?? 1) > 1),
    minutes: data.settings.assistant?.dailyMinutes ?? data.settings.dailyMinutes ?? 30,
    days: 5, routine: '', mode: data.settings.studyMode ?? 'guided', help: 'hint',
    independent: true, format: 'mixed', materials: false, diagnostic: false,
    grading: '', credits: false, trackGpa: false, schoolRules: false,
  };
}
export function checkInWeights(data: StudyData, profile: LearningProfile) {
  const previous = data.settings.assistant;
  return profile.subjects.length ? Object.fromEntries(SUBJECTS.map(({id}) => {
    const old = previous?.weights[id] ?? 1;
    return [id, !profile.subjects.includes(id) ? 0 :
      profile.priorities.includes(id) ? Math.max(2, old) : old > 0 && !data.settings.learningProfile?.priorities.includes(id) ? old : 1];
  })) : previous?.weights ?? Object.fromEntries(SUBJECTS.map(({id})=>[id,1]));
}
export function checkInSettings(data: StudyData, profile: LearningProfile, at: string,
  weightOverrides?: CheckInDraft['weights'],
): StudyData['settings'] {
  const previous = data.settings.assistant;
  const weights = { ...checkInWeights(data, profile), ...weightOverrides };
  if (!Object.values(weights).some(weight => weight > 0)) throw new Error('subjects');
  const suggestedGoal: SprintGoal = profile.format === 'concept' ? 'consolidate' :
    profile.format === 'practice' ? 'weakness' : 'review';
  return {
    ...data.settings,
    learningProfile: profile,
    learningCheckIn: undefined,
    studyMode: profile.mode,
    dailyMinutes: profile.minutes,
    sprintPreferences: {minutes: data.settings.sprintPreferences?.minutes ?? Math.min(60, profile.minutes),
      goal: data.settings.sprintPreferences?.goal ?? suggestedGoal},
    assistant: {
      ...previous, version: 1, weights, dailyMinutes: profile.minutes,
      onboardingStep: 9, onboardingVersion: 4, onboardedAt: previous?.onboardedAt ?? at,
    },
  };
}
