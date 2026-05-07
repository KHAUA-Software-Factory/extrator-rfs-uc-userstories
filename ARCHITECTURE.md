# Arquitetura SOLID

Este projeto usa uma arquitetura por responsabilidades para extrair casos de uso de texto em portugues, com IA isolada nas pontas (extracao de RFs e geracao de user stories) e um nucleo deterministico para tudo que precisa ser auditavel.

## Fluxo (3 etapas com gates)

```text
Texto em portugues
-> [IA] OpenAIRequirementsExtractor
-> Tabela de RFs editaveis (Etapa 1, gate humano)
-> RequirementsToUseCasesConverter
-> RuleBasedRelationshipDetector
-> Tabela de UCs editaveis (Etapa 2, gate humano)
-> Markdown/CSV/Text exporters + SVG/PlantUML renderers
-> [IA] OpenAIUserStoriesExtractor
-> Tabela de user stories (Etapa 3, gate humano)
-> PdfReportExporter (consolida tudo em um PDF)
```

Cada gate corresponde a uma flag em `WebGuiState` (`requirements_validated`, `use_cases_validated`); editar qualquer item da etapa anterior reseta a flag e bloqueia a etapa seguinte ate nova validacao.

O renderizador SVG usa rotas ortogonais em faixas laterais para relacoes `include` e `extend`, evitando que setas cruzem o interior dos casos de uso.

O extrator deterministico antigo continua disponivel como caminho secundario (rota `/process-direct` na GUI e `--text` na CLI) para testes e comparacao, mas o fluxo recomendado usa IA para transformar texto livre em RFs editaveis.

## Como os principios SOLID aparecem

- **Single Responsibility**: cada classe tem uma tarefa: chamar a API, estruturar RFs, converter RFs em casos de uso, detectar relacoes, exportar tabela ou renderizar diagrama.
- **Open/Closed**: novos extratores, exportadores ou renderizadores podem ser adicionados sem alterar o servico de aplicacao.
- **Liskov Substitution**: implementacoes concretas seguem os contratos definidos em `usecase_solid/ports.py`.
- **Interface Segregation**: os contratos sao pequenos: `UseCaseExtractor`, `RelationshipDetector`, `DocumentExporter` e `DiagramRenderer`.
- **Dependency Inversion**: `UseCaseAnalysisService` depende de abstracoes, e o arquivo `bootstrap.py` monta as implementacoes concretas.

## Papel Da IA

IA e usada nas pontas que dependem de interpretacao de linguagem natural:

- `OpenAIRequirementsExtractor`: gera RFs candidatos a partir de texto livre, em modo conservador ou com sugestoes adicionais (prefixo `sugestao IA:` para rastreabilidade).
- `OpenAIUserStoriesExtractor`: gera user stories no formato Mike Cohn com criterios de aceitacao a partir dos UCs validados.

O programa continua responsavel pela parte auditavel:

- salvar RFs aprovados;
- gerar casos de uso a partir dos RFs;
- gerar tabela, relatorio e diagramas;
- consolidar tudo em PDF unico;
- manter rastreabilidade entre texto -> RF -> UC -> user story.
