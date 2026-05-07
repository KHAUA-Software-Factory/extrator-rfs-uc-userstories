# Fluxo BPMN Adaptado: IA Para Requisitos Funcionais, Sistema Para Casos de Uso e User Stories

## Pools e Lanes

**Pool:** Plataforma de Engenharia de Requisitos com Apoio de IA

**Lanes:**

- Usuário
- Módulo de Extração de Requisitos com IA
- Módulo de Validação de Requisitos
- Gerador de Casos de Uso
- Módulo de Exportação/Visualização
- Sistema de IA para User Stories

## Fluxo BPMN Estruturado

### Evento de Início

- **Início:** Descrição em linguagem natural fornecida em português.

### Atividades Iniciais

1. **Usuário:** Inserir descrição do sistema em linguagem natural.
2. **Módulo de Extração de Requisitos com IA:** Enviar texto para API de IA.
3. **Módulo de Extração de Requisitos com IA:** Extrair requisitos funcionais candidatos.
4. **Módulo de Extração de Requisitos com IA:** Retornar requisitos funcionais enumerados em formato estruturado.
5. **Módulo de Validação de Requisitos:** Exibir requisitos funcionais em tabela editável.

### Gateway de Validação de Requisitos

**Gateway XOR:** Requisitos funcionais aprovados?

### Caminho A: Requisitos Não Aprovados

1. **Usuário:** Editar, excluir ou adicionar requisitos funcionais.
2. **Módulo de Validação de Requisitos:** Atualizar tabela de requisitos.
3. O fluxo retorna para o gateway de aprovação dos requisitos.

### Caminho B: Requisitos Aprovados

1. **Gerador de Casos de Uso:** Converter requisitos funcionais aprovados em casos de uso.
2. **Gerador de Casos de Uso:** Identificar atores, objetivos e descrições a partir dos RFs aprovados.
3. **Gerador de Casos de Uso:** Detectar relações `<<include>>` e `<<extend>>` quando existirem pistas nos requisitos.
4. **Gerador de Casos de Uso:** Estruturar modelo intermediário de casos de uso.
2. **Módulo de Exportação/Visualização:** Gerar tabela de casos de uso.
3. **Módulo de Exportação/Visualização:** Gerar relatório textual.
4. **Módulo de Exportação/Visualização:** Gerar diagramas de casos de uso.

### Artefatos Gerados pela Extração

Os seguintes artefatos passam a representar a saída formal da fase de requisitos:

- `requisitos_funcionais.json`
- `requisitos_funcionais.md`

Os seguintes artefatos representam a saída formal da fase de casos de uso:

- `tabela_casos_de_uso.md`
- `casos_de_uso.csv`
- `relatorio_casos_de_uso.txt`
- `diagrama_casos_de_uso.svg`
- `diagrama_casos_de_uso.puml`

### Gateway de Validação Humana

**Gateway XOR:** Casos de uso aprovados pelo usuário?

### Caminho A: Não Aprovado

1. **Usuário:** Fornecer feedback sobre atores, casos de uso, descrições ou relações.
2. **Usuário:** Corrigir requisitos funcionais ou casos de uso intermediários.
3. **Gerador de Casos de Uso:** Regenerar casos de uso a partir dos RFs corrigidos.
4. O fluxo retorna para a geração da tabela e dos diagramas.

### Caminho B: Aprovado

1. **Módulo de Exportação/Visualização:** Consolidar artefatos aprovados.
2. **Módulo de Exportação/Visualização:** Preparar pacote de entrada para a próxima fase.

### Transição Para a Fase de IA

1. **Módulo de Exportação/Visualização:** Enviar tabela e relatório de casos de uso como entrada estruturada.
2. **Sistema de IA para User Stories:** Receber casos de uso aprovados.
3. **Sistema de IA para User Stories:** Gerar user stories a partir dos casos de uso.
4. **Sistema de IA para User Stories:** Associar cada user story ao respectivo caso de uso.
5. **Sistema de IA para User Stories:** Gerar critérios de aceitação.

### Gateway de Validação das User Stories

**Gateway XOR:** User stories aprovadas?

### Caminho A: Não Aprovadas

1. **Usuário:** Revisar user stories e critérios de aceitação.
2. **Usuário:** Fornecer feedback.
3. **Sistema de IA para User Stories:** Refinar user stories.
4. O fluxo retorna para a validação das user stories.

### Caminho B: Aprovadas

1. **Sistema de IA para User Stories:** Consolidar user stories aprovadas.
2. **Módulo de Exportação/Visualização:** Exportar artefatos finais.

### Evento de Fim

- **Fim:** Casos de uso extraídos, diagramas gerados e user stories produzidas a partir dos casos de uso aprovados.

## Pontos Importantes do Modelo

- A IA é usada para transformar texto livre em requisitos funcionais candidatos.
- O usuário valida requisitos funcionais antes da geração de casos de uso.
- O programa gera casos de uso a partir de RFs aprovados, reduzindo ambiguidade.
- A geração de user stories fica desacoplada da extração inicial de requisitos.
- O modelo preserva rastreabilidade: texto original -> requisito funcional -> caso de uso -> user story.

## Entrada Recomendada Para a Fase de IA

O input para a IA deve ser baseado nos artefatos gerados pelo projeto, especialmente a tabela e o relatório textual:

```text
Contexto:
Gerar user stories a partir dos casos de uso derivados de requisitos funcionais aprovados.

Entrada:
- ID do caso de uso
- Ator(es)
- Nome do caso de uso
- Descrição
- Gatilho/condição
- Pré-condições
- Relações UML: include/extend
- Fluxo principal
- Pós-condições

Saída esperada:
- User story no formato: Como [ator], quero [objetivo], para [benefício].
- Critérios de aceitação em formato Given/When/Then.
- Referência ao ID do caso de uso de origem.
```

## Dica de Modelagem

Para deixar o BPMN mais profissional:

- Transforme “Extrair casos de uso” em um subprocesso determinístico.
- Transforme “Gerar user stories” em um subprocesso com IA.
- Adicione um evento intermediário de mensagem entre as fases: “Casos de uso aprovados enviados para IA”.
- Modele os artefatos `tabela_casos_de_uso.md` e `relatorio_casos_de_uso.txt` como objetos de dados.
- Modele o diagrama SVG/PlantUML como saída documental da fase de extração.
