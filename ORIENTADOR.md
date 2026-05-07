# Como Testar o Projeto

Este projeto extrai casos de uso de uma descricao em linguagem natural em portugues, gera tabela, relatorio e diagramas, e prepara os artefatos para uma fase posterior de IA que gera user stories.

## Requisitos

- Python 3.9 ou superior.
- Nao precisa de Graphviz.
- Chave da API OpenAI para a etapa de extracao de requisitos com IA.

## Configuracao Da API

```bash
cp .env.example .env
pip install -r requirements.txt
```

Depois, edite o arquivo `.env`:

```text
OPENAI_API_KEY=sua_chave_aqui
OPENAI_MODEL=gpt-5.2
```

## Execucao Rapida

No terminal, dentro da pasta do projeto:

```bash
python3 main.py --file examples/entrada.txt --out outputs
```

O comando gera:

```text
outputs/tabela_casos_de_uso.md
outputs/casos_de_uso.csv
outputs/relatorio_casos_de_uso.txt
outputs/diagrama_casos_de_uso.svg
outputs/diagrama_casos_de_uso.puml
```

## Interface Grafica Web Local

Para abrir a interface no navegador:

```bash
python3 gui.py
```

Na janela, clique em `Processar`. Os mesmos artefatos da execucao por terminal sao gerados na pasta `outputs/gui`, ou na pasta escolhida em `Salvar em...`.

Mantenha o terminal aberto enquanto usa a pagina local.

Fluxo recomendado na interface:

1. Inserir descricao livre do sistema.
2. Clicar em `Extrair requisitos com IA`.
3. Revisar e editar os requisitos funcionais enumerados.
4. Clicar em `Aprovar RFs e gerar casos de uso`.
5. Avaliar tabela, relatorio e diagrama.

## Testar Com Outro Texto

```bash
python3 main.py --text "O cliente pode consultar pedidos. Para consultar pedidos, o cliente deve realizar login." --out outputs
```

## Fluxo Por Terminal Com IA

```bash
python3 main.py --extract-requirements --file examples/entrada.txt --out outputs
python3 main.py --requirements-file outputs/requisitos_funcionais.json --out outputs
```

## Rodar Testes Automatizados

```bash
python3 -m unittest discover -s tests
```

## Observacao

A IA e usada para transformar texto livre em requisitos funcionais candidatos. O programa assume a etapa seguinte: edicao/aprovacao dos RFs, geracao dos casos de uso e exportacao dos artefatos.
