import { PROJECT_ISOLATION_RULES } from './projectIsolationPrompt';
import { getRequirementLanguagePromptLabel, type RequirementLanguage } from '../model/language';

export function buildGenerateUserStoriesSystemPrompt(language: RequirementLanguage) {
  const targetLanguage = getRequirementLanguagePromptLabel(language);
  return (
    PROJECT_ISOLATION_RULES +
    '\n\n' +
    'You are an analyst who writes user stories in the Mike Cohn format: "As a [role], I want [feature] so that [benefit]." ' +
    'The user input is a UML use-case diagram in simple PlantUML. ' +
    `Write every human-readable field in ${targetLanguage}. ` +
    'For each use case, generate exactly one main user story. ' +
    'The role must come from the use case actor(s), prioritizing the main actor. ' +
    'Include 2 to 4 short acceptance criteria, using the natural equivalents of Given/When/Then in the target language. ' +
    "In 'casos_de_uso_relacionados' put the id(s) of the source use case(s), for example ['UC001']."
  );
}
