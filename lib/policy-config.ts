import type { StudyData } from './model';

/** All values are testable product assumptions, not calibrated probability estimates. */
export type PolicyConfig = {
  id: string;
  version: 2;
  label: string;
  objective: 'expected-learning-gain-per-minute';
  engine: {
    priority: {
      weakness: number;
      forgetting: number;
      errors: number;
      exam: number;
      importance: number;
      verification: number;
      repetitionPenalty: number;
      diagnosisBonus: number;
      fingerprintBonus: number;
      calibrationBonus: number;
      prerequisiteBonus: number;
      dependencyDiscount: number;
    };
  };
  evidence: {
    stabilityUpLimit: number;
    stabilityDownLimit: number;
    smoothing: number;
    hintWeights: {
      light: number;
      method: number;
      step: number;
      answer: number;
      legacy: number;
    };
    acquisitionLimit: number;
    retentionLimit: number;
    timingFloor: number;
    positiveRate: number;
    dailyGainCap: number;
    negativeRate: number;
    coldIntervals: number[];
    maxStability: number;
    sourceWeights: { self: number; objective: number; rubric: number };
    suspectWeight: number;
    guessWeight: number;
    familyFactors: {
      formula: number;
      vocabulary: number;
      fact: number;
      reasoning: number;
    };
    subjectFactors: Record<string, number>;
    failureAttribution: {
      unconfirmedBase: number;
      unconfirmedConcept: number;
      confirmedBase: number;
      confirmedConcept: number;
    };
  };
  utility: {
    learning: number;
    information: number;
    exam: number;
    retention: number;
    continuity: number;
    administration: number;
    exploration: number;
    fatigueCost: number;
    minimumMinutes: number;
    reportMinutes: number;
    practiceMinutes: number;
    explorationShare: number;
    candidateLimit: number;
    resumeHalfLifeDays: number;
    teachErrorCount: number;
    severeErrorConfidence: number;
    verifiedHypothesisInfluence:number;
  };
  assistant: {
    base: number;
    weightFloor: number;
    weightDivisor: number;
    prerequisite: number;
    due: number;
    exam: number;
    examHorizonDays: number;
    forgetting: number;
    memory: number;
    retentionDailyLimit: number;
    initialPerSubject: number;
    initialCombined: number;
  };
  signals: Record<string, number>;
  // Evidence priors can be changed and compared without editing the update rules.
  actionModel: Record<
    string,
    {
      learn: number;
      information: number;
      retention: number;
      effort: number;
      administration: number;
    }
  >;
};
export const DEFAULT_POLICY: PolicyConfig = {
  id: 'learning-v2-balanced',
  version: 2,
  label: '均衡学习',
  objective: 'expected-learning-gain-per-minute',
  engine: {
    priority: {
      weakness: 0.28,
      forgetting: 0.22,
      errors: 0.15,
      exam: 0.15,
      importance: 0.08,
      verification: 0.05,
      repetitionPenalty: 0.45,
      diagnosisBonus: 0.15,
      fingerprintBonus: 0.05,
      calibrationBonus: 0.1,
      prerequisiteBonus: 0.18,
      dependencyDiscount: 0.65,
    },
  },
  evidence: {
    stabilityUpLimit: 1.4,
    stabilityDownLimit: 0.8,
    smoothing: 0.18,
    hintWeights: {
      light: 0.9,
      method: 0.72,
      step: 0.45,
      answer: 0.12,
      legacy: 0.65,
    },
    acquisitionLimit: 6,
    retentionLimit: 2,
    timingFloor: 0.8,
    positiveRate: 0.22,
    dailyGainCap: 0.08,
    negativeRate: 0.1,
    coldIntervals: [1, 3, 7],
    maxStability: 180,
    sourceWeights: { self: 0.55, objective: 1, rubric: 1 },
    suspectWeight: 0.4,
    guessWeight: 0.55,
    familyFactors: { formula: 0.85, vocabulary: 1.1, fact: 1.2, reasoning: 1 },
    subjectFactors: { math: 0.95, physics: 0.95, chemistry: 0.95 },
    failureAttribution: {
      unconfirmedBase: 0.4,
      unconfirmedConcept: 0.3,
      confirmedBase: 0.75,
      confirmedConcept: 0.25,
    },
  },
  utility: {
    learning: 1,
    information: 0.8,
    exam: 0.7,
    retention: 0.65,
    continuity: 0.25,
    administration: 1.1,
    exploration: 0.3,
    fatigueCost: 0.65,
    minimumMinutes: 2,
    reportMinutes: 2,
    practiceMinutes: 8,
    explorationShare: 0.2,
    candidateLimit: 6,
    resumeHalfLifeDays: 7,
    teachErrorCount: 2,
    severeErrorConfidence: 0.8,
    verifiedHypothesisInfluence:.1,
  },
  assistant: {
    base: 0.25,
    weightFloor: 0.4,
    weightDivisor: 3,
    prerequisite: 0.35,
    due: 0.3,
    exam: 0.35,
    examHorizonDays: 28,
    forgetting: 0.2,
    memory: 0.05,
    retentionDailyLimit: 2,
    initialPerSubject: 8,
    initialCombined: 12,
  },
  actionModel: {
    resume: {
      learn: 0.65,
      information: 0.3,
      retention: 0.4,
      effort: 0.5,
      administration: 0,
    },
    score: {
      learn: 0,
      information: 0.2,
      retention: 0,
      effort: 0.1,
      administration: 1,
    },
    initial: {
      learn: 0.15,
      information: 1,
      retention: 0,
      effort: 0.5,
      administration: 0,
    },
    test: {
      learn: 0.25,
      information: 1,
      retention: 0.4,
      effort: 0.7,
      administration: 0,
    },
    pressure: {
      learn: 0.15,
      information: 1,
      retention: 0.25,
      effort: 1,
      administration: 0,
    },
    simulation: {
      learn: 0.45,
      information: 1,
      retention: 0.4,
      effort: 1,
      administration: 0,
    },
    'import-exam': {
      learn: 0,
      information: 0.15,
      retention: 0,
      effort: 0.15,
      administration: 0.25,
    },
    course: {
      learn: 1,
      information: 0.15,
      retention: 0.2,
      effort: 0.45,
      administration: 0,
    },
    teach: {
      learn: 1,
      information: 0.25,
      retention: 0.35,
      effort: 0.3,
      administration: 0,
    },
    remedy: {
      learn: 1,
      information: 0.3,
      retention: 0.4,
      effort: 0.4,
      administration: 0,
    },
    verify: {
      learn: 0.3,
      information: 0.8,
      retention: 1,
      effort: 0.5,
      administration: 0,
    },
    practice: {
      learn: 0.8,
      information: 0.25,
      retention: 0.8,
      effort: 0.5,
      administration: 0,
    },
    report: {
      learn: 0,
      information: 0.2,
      retention: 0,
      effort: 0.1,
      administration: 0.12,
    },
    checkpoint: {
      learn: 0,
      information: 0.2,
      retention: 0,
      effort: 0.1,
      administration: 0.45,
    },
    rest: {
      learn: 0,
      information: 0,
      retention: 0,
      effort: 0,
      administration: 0,
    },
    import: {
      learn: 0,
      information: 0.2,
      retention: 0,
      effort: 0.15,
      administration: 0.4,
    },
  },
  signals: {
    historyDays: 30,
    fatigueWindowMinutes: 45,
    fatigueMinSamples: 6,
    fatigueDurationMinutes: 45,
    fatigueSpeedRatio: 1.8,
    fatigueHigh: 0.65,
    completionMinSamples: 4,
    completionDefault: 0.7,
    completionPriorSamples: 4,
    completionEffortMinutes: 20,
    metadataMinSamples: 6,
    metadataMinDays: 3,
    metadataTimeRatio: 2,
    metadataSuccessTolerance: 0.35,
    metadataDefaultConfidence: 0.5,
    metadataSuspectConfidence: 0.25,
    assessmentEvidenceScale: 8,
    assessmentMinSamples: 3,
    assessmentSufficientSamples: 24,
    pressureMinBaseline: 4,
    pressureMinDays: 2,
    pressureEvidenceScale: 8,
    examHorizonDays: 30,
    examGapFallback: 0.2,
    examImprovabilityFallback: 0.5,
    examMarginalStep: 0.05,
    speedMinSamples: 6,
    hypothesisMinSamples: 4,
  },
};
export const POLICY_REGISTRY: Record<string, PolicyConfig> = {
  [DEFAULT_POLICY.id]: DEFAULT_POLICY,
  'learning-v2-retention': {
    ...DEFAULT_POLICY,
    id: 'learning-v2-retention',
    label: '保持优先（实验）',
    utility: {
      ...DEFAULT_POLICY.utility,
      retention: 0.85,
      information: 0.65,
      explorationShare: 0.15,
    },
  },
  'learning-v2-exploration': {
    ...DEFAULT_POLICY,
    id: 'learning-v2-exploration',
    label: '拓展优先（实验）',
    utility: {
      ...DEFAULT_POLICY.utility,
      exploration: 0.5,
      explorationShare: 0.25,
    },
  },
};
export function policyFor(data?: Pick<StudyData, 'settings'>): PolicyConfig {
  return (
    POLICY_REGISTRY[data?.settings.studyPolicy?.id ?? ''] ?? DEFAULT_POLICY
  );
}
export function policySnapshot(policy: PolicyConfig) {
  return JSON.parse(JSON.stringify(policy)) as PolicyConfig;
}
export function validPolicyId(id: string) {
  return Object.hasOwn(POLICY_REGISTRY, id);
}
