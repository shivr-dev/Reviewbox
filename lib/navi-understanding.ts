import { z } from 'zod';
/** A conversational check carries no grade, mastery delta or scheduler action. */
export const naviUnderstandingCheck = z
  .object({ question: z.string().trim().min(1).max(700) })
  .strict();
export const naviCheckRequest = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('ask') }).strict(),
  z
    .object({
      phase: z.literal('review'),
      question: z.string().trim().min(1).max(700),
      answer: z.string().trim().min(1).max(1600),
    })
    .strict(),
]);
export type NaviCheckRequest = z.infer<typeof naviCheckRequest>;
