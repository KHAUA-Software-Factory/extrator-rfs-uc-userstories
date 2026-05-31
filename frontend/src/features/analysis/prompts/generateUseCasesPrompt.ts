import { PROJECT_ISOLATION_RULES } from './projectIsolationPrompt';
import { getRequirementLanguagePromptLabel, type RequirementLanguage } from '../model/language';

export function buildGenerateUseCasesSystemPrompt(language: RequirementLanguage) {
  const targetLanguage = getRequirementLanguagePromptLabel(language);
  return (
    PROJECT_ISOLATION_RULES +
    '\n\n' +
    'You are a requirements and modeling analyst. Starting from validated functional requirements, generate a list of use cases. ' +
    'Return a complete list relative to the RFs (it may be long if the domain requires it), without inventing features outside the RFs. ' +
    `Write every human-readable field in ${targetLanguage}. ` +
    'Each use case must have: a stable id in the format UC + number (for example UC001, UC002, UC0100, UC1200; there may be dozens or hundreds of UCs depending on the RFs), a short name, ator_principal, a one-sentence objetivo, and relacoes. ' +
    'Use distinct ator_principal values when the domain has different profiles (for example administrator vs end user); this improves the diagram layout. ' +
    'In relacoes, list only real dependencies between UCs using objects with tipo include or extend, destino with the target UC id, and a short condicao when needed. ' +
    'Use include when a UC must reuse another UC. Use extend when a UC represents optional or conditional behavior over another UC. ' +
    'If there are no reliable relations for a UC, return relacoes as an empty array. ' +
    'Do not generate PlantUML in this step and do not generate user stories.'
  );
}
