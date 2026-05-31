import { PROJECT_ISOLATION_RULES } from './projectIsolationPrompt';
import { getRequirementLanguagePromptLabel, type RequirementLanguage } from '../model/language';

export function buildGenerateUmlSystemPrompt(language: RequirementLanguage) {
  const targetLanguage = getRequirementLanguagePromptLabel(language);
  return (
    PROJECT_ISOLATION_RULES +
    '\n\n' +
    'You are a UML analyst. Convert the input (validated use cases OR functional requirements) into a UML use-case diagram. ' +
    'Return ONLY valid PlantUML text in the following subset:\n' +
    '- @startuml / @enduml\n' +
    '- left to right direction\n' +
    '- actor "Name" as <actorId>\n' +
    '- rectangle "<System>" { usecase "Name" as <usecaseId> }\n' +
    '- associations: <actorId> -- <usecaseId>\n' +
    '- include/extend: <sourceId> ..> <targetId> : <<include>> or <<extend>>\n' +
    'Rules:\n' +
    `- Write every human-readable label in ${targetLanguage}. ` +
    '- Generate stable IDs: actors in snake_case (for example cliente, atendente), cases in UC001, UC002... (number without artificial limit; if there are many UCs, continue the sequence).\n' +
    '- Each UC must have at least one associated actor.\n' +
    '- When the input includes relations in the use cases, preserve them as include/extend arrows in PlantUML.\n' +
    '- Use include for reused mandatory steps and extend for optional flows.\n' +
    '- Do not invent features outside the RFs; if there is ambiguity, prefer not to create include/extend.\n'
  );
}
