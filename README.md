# Extrator SOLID de Casos de Uso

Projeto em Python para receber uma descricao em linguagem natural em portugues, identificar casos de uso por regras deterministicas e gerar:

- tabela Markdown com casos de uso descritos;
- CSV com os casos identificados;
- relatorio textual detalhado;
- diagrama SVG plotado diretamente, com roteamento lateral para evitar sobreposicao entre `include` e `extend`;
- diagrama PlantUML para renderizadores externos;
- user stories no formato Mike Cohn ("Como ... eu quero ... para ...") geradas pela IA a partir dos casos de uso validados;
- relatorio PDF unico com todas as etapas em sequencia (descricao livre, RFs, tabela de casos de uso, diagrama, relatorio textual, PlantUML e user stories).

O fluxo principal usa IA apenas para extrair requisitos funcionais a partir do texto livre. Depois disso, o usuario revisa os RFs e o programa gera casos de uso, tabela e diagramas a partir dos requisitos aprovados.

## Configurar chave da API

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```text
OPENAI_API_KEY=sua_chave_aqui
OPENAI_MODEL=gpt-5.2
```

Instale as dependencias (recomendado em um virtualenv local, pois o Python do Homebrew nao permite `pip install` global):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Em seguida, sempre rode os comandos com o venv ativo (ou usando `.venv/bin/python` diretamente).

As dependencias incluem `python-dotenv`, `reportlab` e `svglib`. As duas ultimas habilitam a geracao do PDF; se elas faltarem, o restante da aplicacao continua funcionando.

## Executar com exemplo

```bash
python3 main.py --file examples/entrada.txt --out outputs
```

## Abrir interface grafica web local

```bash
python3 gui.py
```

Tambem e possivel abrir pela entrada principal:

```bash
python3 main.py --gui
```

Na interface, o fluxo tem **3 gates de validacao** que voce controla, alternando entre IA e revisao humana:

**Etapa 1 - Requisitos funcionais**

1. Digite a descricao livre do sistema (ex.: "totem do McDonalds").
2. (Opcional) Marque `Sugerir requisitos adicionais com IA` se quiser que a IA complemente RFs comuns ao tipo de sistema. RFs sugeridos vem com origem prefixada por `sugestao IA:` para rastreabilidade.
3. Clique em `Extrair requisitos com IA`.
4. Revise os RFs:
   - edite qualquer campo livremente;
   - `Adicionar requisito` cria uma linha em branco com proximo `RFNNN`;
   - `Remover` em qualquer linha exclui o RF correspondente.
5. Clique em `Validar requisitos` para fechar a etapa 1. Isso libera o botao `Gerar casos de uso`.

**Etapa 2 - Casos de uso**

6. Clique em `Gerar casos de uso` (so funciona se a etapa 1 estiver validada).
7. Revise os UCs na **tabela editavel**: `ID`, `Atores` (nomes separados por virgula), `Nome`, `Descricao`, `Gatilho` e `Pre-condicoes` (uma por linha) podem ser ajustados in loco.
   - `Salvar casos de uso` persiste suas edicoes e regenera diagrama, CSV, Markdown, PlantUML e relatorio textual a partir da nova lista.
   - `Adicionar caso de uso` cria uma linha em branco com proximo `UCNNN`.
   - `Remover` em qualquer linha exclui o UC; relacoes `<<include>>`/`<<extend>>` que perdem origem ou destino sao descartadas automaticamente.
8. Clique em `Validar casos de uso` (ou `Revalidar` se ja validado) para fechar a etapa 2 e liberar o botao `Gerar User Stories com IA`. Qualquer edicao apos a validacao volta a etapa para o estado pendente.

**Etapa 3 - User Stories**

9. Clique em `OK, gerar User Stories com IA` (so funciona se a etapa 2 estiver validada). A IA produz uma user story por caso de uso, com 2 a 4 criterios de aceitacao em estilo Gherkin.
10. Clique em `Baixar PDF completo` para receber tudo em um unico arquivo.

A qualquer momento o botao `Baixar PDF com estado atual` (no canto da tabela de RFs) tambem gera o PDF do que ja foi produzido.

No cabecalho ha tambem o botao **`Resetar pipeline`**: apos confirmacao, ele zera o texto de descricao, RFs, UCs, user stories e ambas as flags de validacao, devolvendo a sessao a um estado limpo (uma nova analise pode comecar do zero). E util quando se troca completamente o sistema sob analise.

Por padrao, `gui.py` abre uma interface web local para evitar problemas de Tkinter no macOS/Homebrew.

## Fluxo por terminal com IA

Extrair requisitos funcionais:

```bash
python3 main.py --extract-requirements --file examples/entrada.txt --out outputs
```

Gerar casos de uso a partir dos requisitos aprovados:

```bash
python3 main.py --requirements-file outputs/requisitos_funcionais.json --out outputs
```

## Executar com texto direto

```bash
python3 main.py --text "O cliente pode consultar pedidos. Para consultar pedidos, o cliente deve realizar login."
```

Tambem aceita comandos curtos sem ator explicito. Nesses casos, o ator padrao sera `Usuario`:

```bash
python3 main.py --text "criar novos pedidos"
```

Outros exemplos aceitos:

```text
Eu quero criar novos pedidos.
O sistema deve permitir criar novos pedidos.
Funcionalidades: cadastro de clientes, consulta de pedidos e emissão de relatórios.
```

## Arquivos gerados

```text
outputs/tabela_casos_de_uso.md
outputs/casos_de_uso.csv
outputs/relatorio_casos_de_uso.txt
outputs/diagrama_casos_de_uso.svg
outputs/diagrama_casos_de_uso.puml
outputs/relatorio_completo.pdf
```

Na interface web, ha tambem o botao **Baixar PDF completo** (no painel direito) e **Baixar PDF com estado atual** (junto da tabela de RFs editavel) para baixar o PDF a qualquer momento, sem precisar finalizar todo o pipeline.

## Rodar com Docker

Tres arquivos prontos:

- `Dockerfile` (Python 3.12-slim, dependencias instaladas no build, porta 8765 exposta).
- `docker-compose.yml` (servico `app` com `env_file` opcional para `.env`, volume `./outputs:/app/outputs`).
- `.dockerignore` (mantem `.venv`, `outputs`, `.env` e arquivos de IDE fora da imagem).

Pre-requisito: Docker Desktop ou Docker Engine com daemon ativo.

Copie `.env.example` para `.env` e preencha `OPENAI_API_KEY` antes de usar **Extrair requisitos com IA** ou **User Stories** (sem chave valida a pagina sobe, mas essas etapas falham).

Para conferir se o Docker da sua maquina consegue montar a imagem do zero (sem cache):

```bash
sh scripts/verify-docker.sh
```

```bash
docker compose up --build -d
```

A interface fica em `http://localhost:8765`. Os artefatos gerados ficam disponiveis em `./outputs/web_gui/` na maquina hospedeira (volume montado), incluindo o PDF.

Para ver logs: `docker compose logs -f app`. Para encerrar: `docker compose down`.

Variaveis de ambiente reconhecidas pelo container (ja setadas no `docker-compose.yml`):

| Variavel | Default | Funcao |
|---|---|---|
| `GUI_HOST` | `0.0.0.0` | Interface de escuta. Em container precisa ser `0.0.0.0` para receber requests do host. |
| `GUI_PORT` | `8765` | Porta interna do container. |
| `GUI_OPEN_BROWSER` | `0` | Em servidor headless (container) deve ser `0`. |
| `GUI_OUTPUT_DIR` | `/app/outputs/web_gui` | Onde os artefatos sao gerados; mapeado para `./outputs/web_gui` via volume. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | (do `.env`) | Configuracao da API OpenAI. |

## Testes

```bash
python3 -m unittest discover -s tests
```

## Observacao metodologica

A IA e usada para a etapa semantica de extracao de requisitos funcionais. O programa mantem a parte controlada do processo: edicao/aprovacao dos RFs, geracao de casos de uso, diagramas, relatorios e rastreabilidade.
