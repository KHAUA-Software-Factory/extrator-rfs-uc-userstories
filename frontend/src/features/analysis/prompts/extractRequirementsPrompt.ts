import { PROJECT_ISOLATION_RULES } from './projectIsolationPrompt';
import type { RequirementLanguage } from '../model/language';
import { getRequirementLanguagePromptLabel } from '../model/language';

export function buildExtractRequirementsSystemPrompt(language: RequirementLanguage) {
  const targetLanguage = getRequirementLanguagePromptLabel(language);
  return (
    PROJECT_ISOLATION_RULES +
    '\n\n' +
    'You are a requirements analyst. Read the user’s free-form text and generate a complete, proportionate list of plausible functional requirements. ' +
    'Do not generate use cases or user stories in this step. ' +
    `Write every human-readable field in ${targetLanguage}. ` +
    "Use ator='Usuario' when the actor is not explicit, unless a natural translated equivalent is needed in the target language. " +
    'Use action verbs in the infinitive or natural target-language equivalent, such as Create, View, Cancel, Issue, Approve, Export, Notify, Manage. ' +
    "Keep prioridade strictly as 'Alta', 'Media', or 'Baixa' so the app can normalize it consistently. " +
    'Use objeto as the functional target of the action. ' +
    'Goal: produce all functional requirements needed to represent the input well, with no fixed minimum or maximum. ' +
    'The amount should come from the described domain: simple inputs may yield only a few RFs; rich inputs should yield all relevant RFs. ' +
    'Do not stop at an arbitrary number and do not force an artificial quantity. ' +
    'Mentally structure coverage by modules and include what is plausible in context: ' +
    '(1) authentication/accounts/profiles, (2) core domain records, (3) main operations (CRUD), (4) queries/search/filters, (5) validations and business rules, ' +
    '(6) history/audit, (7) role-based permissions, (8) notifications, (9) import/export when relevant, (10) reports/metrics when relevant. ' +
    'Do not invent absurd entities; inference is allowed, but it must stay plausible and coherent with the domain suggested by the text. ' +
    'When a requirement is explicitly mentioned, set origem to a LITERAL EXCERPT of the source text translated only when necessary for readability. ' +
    `When it is a plausible inference, set origem to 'inferred from context: <short justification>' in ${targetLanguage}. ` +
    'Avoid extrapolations outside the domain; prefer to granularize features directly related to the described problem.'
  );
}
