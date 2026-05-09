import type { FunctionalRequirement, UseCase, UserStory } from './features/analysis/model/types';

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

function extractRequirementsPrompt() {
  return (
    'Voce e um analista de requisitos. A partir do texto livre do usuario, gere uma lista completa e proporcional de requisitos funcionais plausiveis. ' +
    'Nao gere casos de uso e nao gere user stories nesta etapa. ' +
    'Cada requisito deve ser claro, verificavel e escrito em portugues. ' +
    "Use ator='Usuario' quando o ator nao estiver explicito. " +
    'Use acao no infinitivo, como Criar, Consultar, Cancelar, Emitir, Aprovar, Exportar, Notificar, Gerenciar. ' +
    "Use prioridade APENAS como 'Alta', 'Media' ou 'Baixa' (sem acento). " +
    'Use objeto como o alvo funcional da acao. ' +
    'Objetivo: produzir todos os requisitos funcionais necessarios para representar bem o input, sem limite minimo ou maximo fixo de quantidade. ' +
    'A quantidade deve nascer do dominio descrito pelo usuario: entradas simples podem gerar poucos RFs; entradas ricas devem gerar todos os RFs relevantes. ' +
    'Nao pare em uma quantidade arbitraria e nao force uma quantidade artificial. ' +
    'Estruture mentalmente por modulos e cubra o que for plausivel dentro do contexto: ' +
    '(1) autenticacao/contas/perfis, (2) cadastros principais do dominio, (3) operacoes principais (CRUD), (4) consultas/pesquisa/filtros, (5) validacoes e regras de negocio, ' +
    '(6) historico/auditoria, (7) permissao por papel, (8) notificacoes, (9) importacao/exportacao (quando fizer sentido), (10) relatorios/indicadores (quando fizer sentido). ' +
    'Nao invente entidades absurdas; inferir e permitido, mas deve ser plausivel e coerente com o dominio sugerido pelo texto. ' +
    'Quando um requisito for explicitamente mencionado, use em origem um TRECHO LITERAL do texto. ' +
    "Quando for uma inferencia plausivel (nao literal), use origem='inferido do contexto: <curta justificativa>'. " +
    'Evite extrapolacoes fora do dominio; prefira granularizar funcionalidades diretamente relacionadas ao problema descrito.'
  );
}

function generateUseCasesPrompt() {
  return (
    'Voce e um analista de requisitos e modelagem. A partir de requisitos funcionais (RFs), gere uma lista de casos de uso (UCs). ' +
    'Retorne uma lista enxuta, sem inventar funcionalidades fora dos RFs. ' +
    'Cada caso de uso deve ter: id (UC001, UC002...), nome curto, ator_principal, objetivo (1 frase) e relacoes. ' +
    'Em relacoes, liste apenas dependencias reais entre UCs usando objetos com tipo include ou extend, destino com o id do UC alvo e condicao curta quando houver. ' +
    'Use include quando um UC obrigatoriamente reutiliza outro UC. Use extend quando um UC representa comportamento opcional ou condicional sobre outro UC. ' +
    'Se nao houver relacoes confiaveis para um UC, retorne relacoes como array vazio. ' +
    'Nao gere PlantUML nesta etapa e nao gere user stories.'
  );
}

function generateUmlPrompt() {
  return (
    'Voce e um analista UML. Converta a entrada (casos de uso validados OU requisitos funcionais) em um diagrama UML de casos de uso. ' +
    'Retorne APENAS um texto PlantUML valido no seguinte subconjunto:\n' +
    '- @startuml / @enduml\n' +
    '- left to right direction\n' +
    '- actor "Nome" as <actorId>\n' +
    '- rectangle "<Sistema>" { usecase "Nome" as <usecaseId> }\n' +
    '- associacoes: <actorId> -- <usecaseId>\n' +
    '- include/extend: <sourceId> ..> <targetId> : <<include>> ou <<extend>>\n' +
    'Regras:\n' +
    '- Gere IDs estaveis: atores em snake_case (ex.: cliente, atendente), casos em UC001, UC002...\n' +
    '- Cada UC deve ter ao menos um ator associado.\n' +
    '- Quando a entrada trouxer relacoes nos casos de uso, preserve-as como setas include/extend no PlantUML.\n' +
    '- Use include para passos obrigatorios reutilizados e extend para fluxos opcionais.\n' +
    '- Nao invente funcionalidades fora dos RFs; se houver ambiguidade, prefira nao criar include/extend.\n'
  );
}

function generateUserStoriesPrompt() {
  return (
    "Voce e um analista que escreve user stories no formato Mike Cohn: 'Como [papel], eu quero [funcionalidade] para [beneficio].' " +
    'A entrada do usuario e um diagrama UML de casos de uso em PlantUML (subconjunto simples). ' +
    'Para cada caso de uso, gere UMA user story principal. ' +
    'O papel deve sair do(s) ator(es) do caso de uso (priorize o ator principal). ' +
    "Inclua de 2 a 4 criterios de aceitacao curtos, comecando com 'Dado que', 'Quando' ou 'Entao'. " +
    "Em 'casos_de_uso_relacionados' coloque os ids do(s) caso(s) de uso de origem (ex.: ['UC001'])."
  );
}

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
  return {
    id: String(useCase.id || `UC${String(index + 1).padStart(3, '0')}`),
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

export async function extractRequirements(input: {
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
    systemPrompt: extractRequirementsPrompt(),
    userContent: text,
  });

  return {
    requisitos_funcionais: (result.requisitos_funcionais || []).map(normalizeRequirement),
  };
}

export async function generateUseCases(input: {
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
    systemPrompt: generateUseCasesPrompt(),
    userContent: JSON.stringify({ requisitos_funcionais: input.requisitos_funcionais }, null, 2),
  });

  return {
    casos_de_uso: (result.casos_de_uso || []).map(normalizeUseCase),
  };
}

export async function generateUml(input: {
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
    systemPrompt: generateUmlPrompt(),
    userContent: JSON.stringify(input, null, 2),
  });

  const plantuml = String(result.plantuml || '').trim();
  if (!plantuml.includes('@startuml') || !plantuml.includes('@enduml')) {
    throw new Error('A OpenAI retornou um PlantUML invalido.');
  }
  return { plantuml };
}

export async function generateUserStories(input: {
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
    systemPrompt: generateUserStoriesPrompt(),
    userContent: plantuml,
  });

  return {
    user_stories: (result.user_stories || []).map(normalizeUserStory),
  };
}
