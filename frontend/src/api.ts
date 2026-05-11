import type { FunctionalRequirement, UseCase, UserStory } from './features/analysis/model/types';
import {
  EXTRACT_REQUIREMENTS_SYSTEM_PROMPT,
  GENERATE_UML_SYSTEM_PROMPT,
  GENERATE_USE_CASES_SYSTEM_PROMPT,
  GENERATE_USER_STORIES_SYSTEM_PROMPT,
  buildProjectScopedUserContent,
  type AiProjectScope,
} from './features/analysis/prompts';

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
    throw new Error(data.error?.message || `OpenAI API respondeu com status ${response.status}.`);
  }

  const output = readOpenAiOutput(data);
  if (!output) throw new Error('OpenAI retornou uma resposta vazia.');
  return parseJsonText<T>(output);
}

function normalizePriority(value: unknown): FunctionalRequirement['prioridade'] {
  const text = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (text === 'Alta' || text === 'Baixa') return text;
  return 'Media';
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
}): Promise<{ requisitos_funcionais: FunctionalRequirement[] }> {
  const text = input.text.trim();
  if (!text) throw new Error('Informe a descricao do sistema antes de chamar a IA.');

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
    systemPrompt: EXTRACT_REQUIREMENTS_SYSTEM_PROMPT,
    userContent: buildProjectScopedUserContent({
      project: input.project,
      step: 'extract_requirements',
      payload: { description_text: text },
    }),
  });

  return {
    requisitos_funcionais: (result.requisitos_funcionais || []).map(normalizeRequirement),
  };
}

export async function generateUseCases(input: AiProjectScopedInput & {
  requisitos_funcionais: FunctionalRequirement[];
}): Promise<{ casos_de_uso: UseCase[] }> {
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
    systemPrompt: GENERATE_USE_CASES_SYSTEM_PROMPT,
    userContent: buildProjectScopedUserContent({
      project: input.project,
      step: 'generate_use_cases',
      payload: { requisitos_funcionais: input.requisitos_funcionais },
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
}): Promise<{ plantuml: string }> {
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
    systemPrompt: GENERATE_UML_SYSTEM_PROMPT,
    userContent: buildProjectScopedUserContent({
      project: input.project,
      step: 'generate_uml',
      payload: {
        systemName: input.systemName,
        requisitos_funcionais: input.requisitos_funcionais,
        casos_de_uso: input.casos_de_uso,
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
}): Promise<{ user_stories: UserStory[] }> {
  const plantuml = input.plantuml.trim();
  if (!plantuml) throw new Error('Valide ou informe o PlantUML antes de chamar a IA.');

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
    systemPrompt: GENERATE_USER_STORIES_SYSTEM_PROMPT,
    userContent: buildProjectScopedUserContent({
      project: input.project,
      step: 'generate_user_stories',
      payload: { plantuml },
    }),
  });

  return {
    user_stories: (result.user_stories || []).map(normalizeUserStory),
  };
}
