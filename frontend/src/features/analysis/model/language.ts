export type RequirementLanguage = 'pt-BR' | 'en-US' | 'es-ES' | 'fr-FR';

export type RequirementLanguageOption = {
  value: RequirementLanguage;
  flag: string;
  label: string;
  promptLabel: string;
};

export const REQUIREMENT_LANGUAGE_OPTIONS: RequirementLanguageOption[] = [
  {
    value: 'pt-BR',
    flag: '🇧🇷',
    label: 'Português',
    promptLabel: 'Brazilian Portuguese',
  },
  {
    value: 'en-US',
    flag: '🇺🇸',
    label: 'English',
    promptLabel: 'English',
  },
  {
    value: 'es-ES',
    flag: '🇪🇸',
    label: 'Español',
    promptLabel: 'Spanish',
  },
  {
    value: 'fr-FR',
    flag: '🇫🇷',
    label: 'Français',
    promptLabel: 'French',
  },
];

type PriorityLabelSet = {
  alta: string;
  media: string;
  baixa: string;
};

const PRIORITY_LABELS: Record<RequirementLanguage, PriorityLabelSet> = {
  'pt-BR': { alta: 'Alta', media: 'Média', baixa: 'Baixa' },
  'en-US': { alta: 'High', media: 'Medium', baixa: 'Low' },
  'es-ES': { alta: 'Alta', media: 'Media', baixa: 'Baja' },
  'fr-FR': { alta: 'Haute', media: 'Moyenne', baixa: 'Basse' },
};

export function getRequirementLanguageOption(value: RequirementLanguage) {
  return REQUIREMENT_LANGUAGE_OPTIONS.find((option) => option.value === value) || REQUIREMENT_LANGUAGE_OPTIONS[0];
}

export function getRequirementLanguagePromptLabel(value: RequirementLanguage) {
  return getRequirementLanguageOption(value).promptLabel;
}

export function getRequirementPriorityLabel(
  value: 'Alta' | 'Media' | 'Baixa',
  language: RequirementLanguage,
) {
  const labels = PRIORITY_LABELS[language] || PRIORITY_LABELS['pt-BR'];
  if (value === 'Alta') return labels.alta;
  if (value === 'Baixa') return labels.baixa;
  return labels.media;
}

export function getRequirementPriorityValue(
  value: string,
): 'Alta' | 'Media' | 'Baixa' {
  const normalized = value.trim().toLowerCase();
  if (['alta', 'high', 'haute', 'alta'].includes(normalized)) return 'Alta';
  if (['baixa', 'low', 'basse', 'baja'].includes(normalized)) return 'Baixa';
  return 'Media';
}
