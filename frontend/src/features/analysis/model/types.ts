export type FunctionalRequirement = {
  id: string;
  descricao: string;
  ator: string;
  acao: string;
  objeto: string;
  prioridade: 'Alta' | 'Media' | 'Baixa';
  origem: string;
};

export type UseCase = {
  id: string;
  nome: string;
  ator_principal: string;
  objetivo: string;
  relacoes: UseCaseRelation[];
};

export type UseCaseRelation = {
  tipo: 'include' | 'extend';
  destino: string;
  condicao: string;
};

export type UserStory = {
  id: string;
  papel: string;
  quero: string;
  para: string;
  criterios_de_aceitacao: string[];
  casos_de_uso_relacionados: string[];
};
