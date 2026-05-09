export type PhaseId = 1 | 2 | 3 | 4;

export type AnalysisWizard = {
  phaseLocked: (target: PhaseId) => boolean;
  recommendedPhase: PhaseId;
};

export function getRecommendedPhase(statusText: string | undefined): PhaseId {
  const status = String(statusText || '');
  if (status === 'uml_validated' || status === 'user_stories_generated') return 4;
  if (status === 'use_cases_validated' || status === 'uml_generated') return 3;
  if (status === 'requirements_validated' || status === 'use_cases_generated') return 2;
  return 1;
}

export function isPhaseLocked(statusText: string | undefined, target: PhaseId): boolean {
  const status = String(statusText || '');
  if (target === 1) return false;
  if (target === 2)
    return (
      status !== 'requirements_validated' &&
      status !== 'use_cases_generated' &&
      status !== 'use_cases_validated' &&
      status !== 'uml_generated' &&
      status !== 'uml_validated' &&
      status !== 'user_stories_generated'
    );
  if (target === 3)
    return (
      status !== 'use_cases_validated' &&
      status !== 'uml_generated' &&
      status !== 'uml_validated' &&
      status !== 'user_stories_generated'
    );
  return status !== 'uml_validated' && status !== 'user_stories_generated';
}

export function useAnalysisWizard(statusText: string | undefined): AnalysisWizard {
  return {
    recommendedPhase: getRecommendedPhase(statusText),
    phaseLocked: (target) => isPhaseLocked(statusText, target),
  };
}
