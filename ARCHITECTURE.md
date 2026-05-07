# Arquitetura SOLID

Este projeto usa uma arquitetura por responsabilidades para extrair casos de uso de texto em portugues sem usar IA.

## Fluxo

```text
Texto em portugues
-> OpenAIRequirementsExtractor
-> Tabela editavel de requisitos funcionais
-> RequirementsToUseCasesConverter
-> RuleBasedRelationshipDetector
-> Markdown/Csv/Text exporters
-> SVG/PlantUML renderers
```

O renderizador SVG usa rotas ortogonais em faixas laterais para relacoes `include` e `extend`, evitando que setas cruzem o interior dos casos de uso.

O extrator deterministico antigo continua disponivel como caminho secundario para testes e comparacao, mas o fluxo recomendado usa IA para transformar texto livre em requisitos funcionais editaveis.

## Como os principios SOLID aparecem

- **Single Responsibility**: cada classe tem uma tarefa: chamar a API, estruturar RFs, converter RFs em casos de uso, detectar relacoes, exportar tabela ou renderizar diagrama.
- **Open/Closed**: novos extratores, exportadores ou renderizadores podem ser adicionados sem alterar o servico de aplicacao.
- **Liskov Substitution**: implementacoes concretas seguem os contratos definidos em `usecase_solid/ports.py`.
- **Interface Segregation**: os contratos sao pequenos: `UseCaseExtractor`, `RelationshipDetector`, `DocumentExporter` e `DiagramRenderer`.
- **Dependency Inversion**: `UseCaseAnalysisService` depende de abstracoes, e o arquivo `bootstrap.py` monta as implementacoes concretas.

## Papel Da IA

IA e usada para interpretar linguagem natural aberta e devolver requisitos funcionais em JSON estruturado. O usuario revisa esses RFs antes da geracao dos casos de uso.

O programa continua responsavel pela parte auditavel:

- salvar RFs aprovados;
- gerar casos de uso;
- gerar tabela e relatorio;
- gerar diagramas;
- manter rastreabilidade entre RFs e casos de uso.
