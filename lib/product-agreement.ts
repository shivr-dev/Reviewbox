export const AGREEMENT_VERSION = '2026-11-01';
export type TermsAcceptance = { version: string; acceptedAt: string };
export function hasAcceptedAgreement(value?: TermsAcceptance) {
  return (
    value?.version === AGREEMENT_VERSION &&
    Number.isFinite(Date.parse(value.acceptedAt))
  );
}
