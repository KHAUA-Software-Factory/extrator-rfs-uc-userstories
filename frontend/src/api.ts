import type { FunctionalRequirement, UseCase, UserStory } from './features/analysis/model/types';
import {
  buildExtractRequirementsSystemPrompt,
  buildGenerateUmlSystemPrompt,
  buildGenerateUseCasesSystemPrompt,
  buildGenerateUserStoriesSystemPrompt,
  buildProjectScopedUserContent,
  type AiProjectScope,
} from './features/analysis/prompts';
import { getRequirementPriorityValue, type RequirementLanguage } from './features/analysis/model/language';
import { logError, logEvent } from './lib/logger';

export type { FunctionalRequirement, UseCase, UserStory };

type JsonSchema = {
  type: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

const OPENAI_MODEL = String(import.meta.env.VITE_OPENAI_MODEL || 'gpt-5.2').trim();
const OPENAI_BASE_URL = String(
  import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1',
).replace(/\/+$/, '');
const OPENAI_RESPONSES_URL = `${OPENAI_BASE_URL}/responses`;

type AiProjectScopedInput = {
  project?: AiProjectScope;
};

const requirementSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'descricao', 'ator', 'acao', 'objeto', 'prioridade', 'origem'],
  properties: {
    id: { type: 'string' },
    descricao: { type: 'string' },
    ator: { type: 'string' },
    acao: { type: 'string' },
    objeto: { type: 'string' },
    prioridade: { type: 'string', enum: ['Alta', 'Media', 'Baixa'] },
    origem: { type: 'string' },
  },
};

const useCaseRelationSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'destino', 'condicao'],
  properties: {
    tipo: { type: 'string', enum: ['include', 'extend'] },
    destino: { type: 'string' },
    condicao: { type: 'string' },
  },
};

const useCaseSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'nome', 'ator_principal', 'objetivo', 'relacoes'],
  properties: {
    id: { type: 'string' },
    nome: { type: 'string' },
    ator_principal: { type: 'string' },
    objetivo: { type: 'string' },
    relacoes: { type: 'array', items: useCaseRelationSchema },
  },
};

const userStorySchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'papel', 'quero', 'para', 'criterios_de_aceitacao', 'casos_de_uso_relacionados'],
  properties: {
    id: { type: 'string' },
    papel: { type: 'string' },
    quero: { type: 'string' },
    para: { type: 'string' },
    criterios_de_aceitacao: { type: 'array', items: { type: 'string' } },
    casos_de_uso_relacionados: { type: 'array', items: { type: 'string' } },
  },
};

function getOpenAiKey() {
  const key = String(import.meta.env.VITE_OPENAI_API_KEY || '').trim();
  if (!key) {
    throw new Error(
      'Configure VITE_OPENAI_API_KEY no .env local e nos GitHub Secrets antes de usar a IA.',
    );
  }
  return key;
}

function readOpenAiOutput(data: OpenAiResponse) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  const parts =
    data.output?.flatMap((item) =>
      (item.content || [])
        .filter((content) => content.type === 'output_text' || content.type === 'text')
        .map((content) => content.text || ''),
    ) || [];
  return parts.join('\n').trim();
}

function parseJsonText<T>(text: string): T {
  const clean = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(clean) as T;
}

async function callOpenAiJson<T>({
  schemaName,
  schema,
  systemPrompt,
  userContent,
}: {
  schemaName: string;
  schema: JsonSchema;
  systemPrompt: string;
  userContent: string;
}): Promise<T> {
  const startedAt = performance.now();
  logEvent({
    event: 'ai.request.started',
    details: {
      schemaName,
      model: OPENAI_MODEL,
      baseUrl: OPENAI_BASE_URL,
      userContentLength: userContent.length,
    },
  });

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenAiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  const rawText = await response.text();
  const data = rawText ? (JSON.parse(rawText) as OpenAiResponse) : {};

  if (!response.ok) {
    const error = new Error(data.error?.message || `OpenAI API respondeu com status ${response.status}.`);
    logError('ai.request.failed', error, {
      schemaName,
      model: OPENAI_MODEL,
      status: response.status,
    });
    throw error;
  }

  const output = readOpenAiOutput(data);
  if (!output) {
    const error = new Error('OpenAI retornou uma resposta vazia.');
    logError('ai.request.empty_output', error, { schemaName, model: OPENAI_MODEL });
    throw error;
  }

  logEvent({
    event: 'ai.request.succeeded',
    details: {
      schemaName,
      model: OPENAI_MODEL,
      elapsedMs: Math.round(performance.now() - startedAt),
      outputLength: output.length,
    },
  });
  return parseJsonText<T>(output);
}

function normalizePriority(value: unknown): FunctionalRequirement['prioridade'] {
  return getRequirementPriorityValue(String(value || ''));
}

function normalizeRequirement(
  requirement: Partial<FunctionalRequirement>,
  index: number,
): FunctionalRequirement {
  return {
    id: String(requirement.id || `RF${String(index + 1).padStart(3, '0')}`),
    descricao: String(requirement.descricao || ''),
    ator: String(requirement.ator || 'Usuario'),
    acao: String(requirement.acao || ''),
    objeto: String(requirement.objeto || ''),
    prioridade: normalizePriority(requirement.prioridade),
    origem: String(requirement.origem || ''),
  };
}

function normalizeUseCase(useCase: Partial<UseCase>, index: number): UseCase {
  const n = index + 1;
  const ucWidth = Math.max(3, String(n).length);
  return {
    id: String(useCase.id || `UC${String(n).padStart(ucWidth, '0')}`),
    nome: String(useCase.nome || ''),
    ator_principal: String(useCase.ator_principal || 'Usuario'),
    objetivo: String(useCase.objetivo || ''),
    relacoes: Array.isArray(useCase.relacoes)
      ? useCase.relacoes.map((relation) => ({
          tipo: relation.tipo === 'extend' ? 'extend' : 'include',
          destino: String(relation.destino || ''),
          condicao: String(relation.condicao || ''),
        }))
      : [],
  };
}

function normalizeUserStory(story: Partial<UserStory>, index: number): UserStory {
  return {
    id: String(story.id || `US${String(index + 1).padStart(3, '0')}`),
    papel: String(story.papel || ''),
    quero: String(story.quero || ''),
    para: String(story.para || ''),
    criterios_de_aceitacao: Array.isArray(story.criterios_de_aceitacao)
      ? story.criterios_de_aceitacao.map(String)
      : [],
    casos_de_uso_relacionados: Array.isArray(story.casos_de_uso_relacionados)
      ? story.casos_de_uso_relacionados.map(String)
      : [],
  };
}

export async function extractRequirements(input: AiProjectScopedInput & {
  text: string;
  language: RequirementLanguage;
}): Promise<{ requisitos_funcionais: FunctionalRequirement[] }> {
  const text = input.text.trim();
  if (!text) {
    const error = new Error('Informe a descricao do sistema antes de chamar a IA.');
    logError('ai.extract_requirements.invalid_input', error);
    throw error;
  }

  logEvent({
    event: 'ai.extract_requirements.started',
    details: { language: input.language, textLength: text.length },
  });

  const result = await callOpenAiJson<{ requisitos_funcionais: Partial<FunctionalRequirement>[] }>({
    schemaName: 'extracao_requisitos_funcionais',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['requisitos_funcionais'],
      properties: {
        requisitos_funcionais: { type: 'array', items: requirementSchema },
      },
    },
    systemPrompt: buildExtractRequirementsSystemPrompt(input.language),
    userContent: buildProjectScopedUserContent({
      project: input.project,
      step: 'extract_requirements',
      payload: {
        description_text: text,
        target_language: input.language,
      },
    }),
  });

  return {
    requisitos_funcionais: (result.requisitos_funcionais || []).map(normalizeRequirement),
  };
}

export async function generateUseCases(input: AiProjectScopedInput & {
  requisitos_funcionais: FunctionalRequirement[];
  language: RequirementLanguage;
}): Promise<{ casos_de_uso: UseCase[] }> {
  if (!input.requisitos_funcionais.length) {
    const error = new Error('Informe requisitos antes de gerar casos de uso.');
    logError('ai.generate_use_cases.invalid_input', error);
    throw error;
  }

  const result = await callOpenAiJson<{ casos_de_uso: Partial<UseCase>[] }>({
    schemaName: 'geracao_casos_de_uso',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['casos_de_uso'],
      properties: {
        casos_de_uso: { type: 'array', items: useCaseSchema },
      },
    },
    systemPrompt: buildGenerateUseCasesSystemPrompt(input.language),
    userContent: buildProjectScopedUserContent({
      project: input.project,
      step: 'generate_use_cases',
      payload: {
        requisitos_funcionais: input.requisitos_funcionais,
        target_language: input.language,
      },
    }),
  });

  return {
    casos_de_uso: (result.casos_de_uso || []).map(normalizeUseCase),
  };
}

export async function generateUml(input: AiProjectScopedInput & {
  systemName?: string;
  requisitos_funcionais?: FunctionalRequirement[];
  casos_de_uso?: UseCase[];
  language: RequirementLanguage;
}): Promise<{ plantuml: string }> {
  if (!input.casos_de_uso?.length) {
    const error = new Error('Informe casos de uso antes de gerar PlantUML.');
    logError('ai.generate_uml.invalid_input', error);
    throw error;
  }

  const result = await callOpenAiJson<{ plantuml: string }>({
    schemaName: 'geracao_plantuml_usecase',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['plantuml'],
      properties: {
        plantuml: { type: 'string' },
      },
    },
    systemPrompt: buildGenerateUmlSystemPrompt(input.language),
    userContent: buildProjectScopedUserContent({
      project: input.project,
      step: 'generate_uml',
      payload: {
        systemName: input.systemName,
        requisitos_funcionais: input.requisitos_funcionais,
        casos_de_uso: input.casos_de_uso,
        target_language: input.language,
      },
    }),
  });

  const plantuml = String(result.plantuml || '').trim();
  if (!plantuml.includes('@startuml') || !plantuml.includes('@enduml')) {
    throw new Error('A OpenAI retornou um PlantUML invalido.');
  }
  return { plantuml };
}

export async function generateUserStories(input: AiProjectScopedInput & {
  plantuml: string;
  language: RequirementLanguage;
}): Promise<{ user_stories: UserStory[] }> {
  const plantuml = input.plantuml.trim();
  if (!plantuml) {
    const error = new Error('Valide ou informe o PlantUML antes de chamar a IA.');
    logError('ai.generate_user_stories.invalid_input', error);
    throw error;
  }

  const result = await callOpenAiJson<{ user_stories: Partial<UserStory>[] }>({
    schemaName: 'geracao_user_stories',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['user_stories'],
      properties: {
        user_stories: { type: 'array', items: userStorySchema },
      },
    },
    systemPrompt: buildGenerateUserStoriesSystemPrompt(input.language),
    userContent: buildProjectScopedUserContent({
      project: input.project,
      step: 'generate_user_stories',
      payload: { plantuml, target_language: input.language },
    }),
  });

  return {
    user_stories: (result.user_stories || []).map(normalizeUserStory),
  };
}
