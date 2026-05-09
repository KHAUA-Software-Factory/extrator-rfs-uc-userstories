export function extractRequirementsPrompt() {
  const systemPromptBase =
    'Voce e um analista de requisitos. A partir do texto livre do usuario, gere uma lista completa e proporcional de requisitos funcionais plausiveis. ' +
    'Nao gere casos de uso e nao gere user stories nesta etapa. ' +
    'Cada requisito deve ser claro, verificavel e escrito em portugues. ' +
    "Use ator='Usuario' quando o ator nao estiver explicito. " +
    'Use acao no infinitivo, como Criar, Consultar, Cancelar, Emitir, Aprovar, Exportar, Notificar, Gerenciar. ' +
    "Use prioridade APENAS como 'Alta', 'Media' ou 'Baixa' (sem acento). " +
    'Use objeto como o alvo funcional da acao. ';

  const systemPrompt =
    systemPromptBase +
    'Objetivo: produzir todos os requisitos funcionais necessarios para representar bem o input, sem limite minimo ou maximo fixo de quantidade. ' +
    'A quantidade deve nascer do dominio descrito pelo usuario: entradas simples podem gerar poucos RFs; entradas ricas devem gerar todos os RFs relevantes. ' +
    'Nao pare em uma quantidade arbitraria e nao force uma quantidade artificial. ' +
    'Estruture mentalmente por modulos e cubra o que for plausivel dentro do contexto: ' +
    '(1) autenticacao/contas/perfis, (2) cadastros principais do dominio, (3) operacoes principais (CRUD), (4) consultas/pesquisa/filtros, (5) validacoes e regras de negocio, ' +
    '(6) historico/auditoria, (7) permissao por papel, (8) notificacoes, (9) importacao/exportacao (quando fizer sentido), (10) relatorios/indicadores (quando fizer sentido). ' +
    'Nao invente entidades absurdas; inferir e permitido, mas deve ser plausivel e coerente com o dominio sugerido pelo texto. ' +
    'Quando um requisito for explicitamente mencionado, use em origem um TRECHO LITERAL do texto. ' +
    "Quando for uma inferencia plausivel (nao literal), use origem='inferido do contexto: <curta justificativa>'. " +
    'Evite extrapolacoes fora do dominio; prefira granularizar funcionalidades diretamente relacionadas ao problema descrito.';

  return systemPrompt;
}

export function generateUseCasesPrompt() {
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

export function generateUmlPrompt() {
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

export function generateUserStoriesPrompt() {
  return (
    "Voce e um analista que escreve user stories no formato Mike Cohn: 'Como [papel], eu quero [funcionalidade] para [beneficio].' " +
    'A entrada do usuario e um diagrama UML de casos de uso em PlantUML (subconjunto simples). ' +
    'Para cada caso de uso, gere UMA user story principal. ' +
    'O papel deve sair do(s) ator(es) do caso de uso (priorize o ator principal). ' +
    "Inclua de 2 a 4 criterios de aceitacao curtos, comecando com 'Dado que', 'Quando' ou 'Entao'. " +
    "Em 'casos_de_uso_relacionados' coloque os ids do(s) caso(s) de uso de origem (ex.: ['UC001'])."
  );
}
