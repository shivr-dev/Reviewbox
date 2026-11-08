import { z } from 'zod';
export const membershipPlan = z.enum(['free','plus','pro']);
export type MembershipPlan = z.infer<typeof membershipPlan>;
export const MEMBERSHIP_POLICY_VERSION=1;
export const MEMBERSHIP_PLANS = {
  free:{name:'Free',monthly:0,yearly:0,credits:60,plusTrials:3,rank:0,color:'neutral',tagline:'Experience Reviewbox'},
  plus:{name:'Plus',monthly:19,yearly:168,credits:500,plusTrials:0,rank:1,color:'blue',tagline:'Your Personal AI Tutor'},
  pro:{name:'Pro',monthly:59,yearly:588,credits:1800,plusTrials:0,rank:2,color:'violet',tagline:'Your Personal AI Learning Agent'},
} as const;
export const MEMBERSHIP_FEATURES = {
  learning:{plan:'free',credits:0},gpa:{plan:'free',credits:0},sync:{plan:'free',credits:0},packs:{plan:'free',credits:0},
  navi_basic:{plan:'free',credits:1},navi_deep:{plan:'plus',credits:3},multi_context:{plan:'plus',credits:5},diagnosis:{plan:'plus',credits:8},
  workspace:{plan:'plus',credits:0},batch_export:{plan:'plus',credits:0},agent:{plan:'pro',credits:8},workflows:{plan:'pro',credits:0},twin:{plan:'pro',credits:0},
} as const satisfies Record<string,{plan:MembershipPlan;credits:number}>;
export type MembershipFeature=keyof typeof MEMBERSHIP_FEATURES;
export const membershipFeature=z.enum(Object.keys(MEMBERSHIP_FEATURES) as [MembershipFeature,...MembershipFeature[]]);
export const hasMembershipFeature=(plan:MembershipPlan,feature:MembershipFeature)=>MEMBERSHIP_PLANS[plan].rank>=MEMBERSHIP_PLANS[MEMBERSHIP_FEATURES[feature].plan].rank;
export type MembershipSnapshot={
  admin?:boolean;plan:MembershipPlan;status:'free'|'active'|'cancelled'|'expired'|'grace';startsAt:string;expiresAt:string|null;cancelAtPeriodEnd:boolean;autoRenew:boolean;legacyUntil:string|null;
  period:{start:string;end:string;allowance:number;used:number;reserved:number;remaining:number};
  plusTrial:{remaining:number;resetsAt:string};proPreview:{eligible:boolean;remaining:number;eligibleAt:string|null};
  ledger:{id:string;at:string;feature:MembershipFeature;reserved:number;charged:number;status:string}[];
  subscriptionEvents:{id:string;at:string;type:string;plan:MembershipPlan}[];
};
export const agentWorkflowSchema=z.object({
  id:z.string().uuid(),name:z.string().trim().min(1).max(80),
  kind:z.enum(['weekly-report','exam-readiness','pack-updates','quality-review']),
  subjects:z.array(z.enum(['chinese','math','english','ce','physics','chemistry','biology','history'])).max(8),
  schedule:z.enum(['manual','weekly']),weekday:z.number().int().min(0).max(6).default(1),hour:z.number().int().min(0).max(23).default(9),timeZone:z.string().max(80).default('Asia/Shanghai'),
  enabled:z.boolean(),
}).strict();
export type AgentWorkflow=z.infer<typeof agentWorkflowSchema>;
/** This serializable catalogue seeds the DB policy; client values never authorize or deduct credits. */
export const membershipPolicySeed=()=>({version:MEMBERSHIP_POLICY_VERSION,plans:MEMBERSHIP_PLANS,features:MEMBERSHIP_FEATURES});
