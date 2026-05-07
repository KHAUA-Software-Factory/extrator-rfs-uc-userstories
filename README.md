# Extrator SOLID de Casos de Uso

Aplicacao em Python que recebe uma descricao em linguagem natural em portugues e produz, em 3 etapas com validacao humana entre elas:

1. **Requisitos funcionais** extraidos com IA, editaveis em tabela.
2. **Casos de uso UML** (atores, descricao, gatilho, pre-condicoes, relacoes `<<include>>`/`<<extend>>`), tambem editaveis.
3. **User stories** no formato Mike Cohn ("Como ... eu quero ... para ..."), com criterios de aceitacao em estilo Gherkin, geradas pela IA a partir dos casos de uso aprovados.

Saidas geradas:

- `requisitos_funcionais.{json,md}`
- `tabela_casos_de_uso.md`, `casos_de_uso.csv`, `relatorio_casos_de_uso.txt`
- `diagrama_casos_de_uso.svg`, `diagrama_casos_de_uso.puml`
- `user_stories.{json,md}`
- `relatorio_completo.pdf` (consolidado, com todas as etapas em sequencia)

---

# Passo a passo - rodar em qualquer maquina (Windows, macOS, Linux)

So precisa de **3 coisas**: Docker Desktop, este projeto descompactado e uma chave da OpenAI.

## 1) Instalar o Docker Desktop

- **Windows:** [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) -> "Docker Desktop for Windows" -> instale (o instalador habilita WSL2 sozinho) -> reinicie se ele pedir.
- **macOS:** [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) -> escolha **Apple Silicon** (M1/M2/M3/M4) ou **Intel** conforme o Mac -> arraste para `Aplicativos`.
- **Linux:** siga [docs.docker.com/desktop/install/linux](https://docs.docker.com/desktop/install/linux/) ou instale via gerenciador (`sudo apt install docker.io docker-compose-plugin` no Debian/Ubuntu).

Abra o app e espere o icone do Docker mostrar **"running"** na barra de status. Sem isso, nada funciona.

Conferir no terminal:

```bash
docker --version
docker compose version
```

Devem aparecer versoes (algo como `Docker version 27.x` e `Docker Compose version v2.x`).

## 2) Pegar o projeto

**Opcao A** - descompactar o `.zip` recebido:

- Windows: clique direito no zip -> `Extrair tudo`.
- macOS: duplo clique no zip.
- Linux: `unzip extrator-rfs-uc-userstories.zip`.

**Opcao B** - clonar do GitHub (precisa ter `git` e acesso ao repositorio):

```bash
git clone https://github.com/gilbertofalco/extrator-rfs-uc-userstories.git
```

## 3) Abrir um terminal na pasta do projeto

- **Windows:** abra **PowerShell** (Menu Iniciar -> digite `powershell`).
- **macOS:** abra **Terminal** (`Cmd + Espaco` -> "Terminal").
- **Linux:** qualquer terminal (`gnome-terminal`, `konsole`, etc.).

```bash
cd extrator-rfs-uc-userstories
```

(No Windows, ajuste o caminho conforme o local onde extraiu, ex.: `cd C:\Users\SEU_USUARIO\Downloads\extrator-rfs-uc-userstories`.)

## 4) Criar o arquivo `.env` com a chave da OpenAI

A chave e gerada em [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (precisa estar logado e ter saldo/cartao configurado).

**macOS / Linux:**

```bash
cp .env.example .env
nano .env
```

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
notepad .env
```

No editor, troque a linha `OPENAI_API_KEY=sua_chave_aqui` por:

```text
OPENAI_API_KEY=sk-proj-...    # cole aqui a sua chave
```

Salve e feche.

## 5) Subir o container

```bash
docker compose up --build -d
```

A primeira vez demora **2 a 5 minutos** (baixa Python 3.12-slim e instala dependencias). Proximas vezes sobe em segundos.

Conferir se esta rodando:

```bash
docker compose ps
```

Deve aparecer `extrator-casos-de-uso` com status `Up` e `(healthy)` apos uns 30 segundos.

Para acompanhar log em tempo real:

```bash
docker compose logs -f app
```

(`Ctrl+C` sai dos logs sem derrubar o container.)

## 6) Abrir no navegador

[http://localhost:8765](http://localhost:8765)

## 7) Usar a interface (3 etapas com gates)

**Etapa 1 - Requisitos funcionais**

1. Cole a descricao livre do sistema (ex.: "totem do McDonalds com pagamento por aproximacao").
2. (Opcional) marque `Sugerir requisitos adicionais com IA` se quiser que a IA complemente RFs comuns ao tipo de sistema. RFs sugeridos vem com origem prefixada por `sugestao IA:` para rastreabilidade.
3. `Extrair requisitos com IA` -> revise/edite/adicione/remova RFs -> `Validar requisitos` (libera a Etapa 2).

**Etapa 2 - Casos de uso**

4. `Gerar casos de uso` -> revise a tabela editavel (ID, atores, nome, descricao, gatilho, pre-condicoes).
   - `Salvar casos de uso` regenera CSV/MD/SVG/PlantUML/relatorio com base nas suas edicoes.
   - `Adicionar caso de uso` cria linha em branco.
   - `Remover` exclui um UC; relacoes que perdem origem ou destino sao descartadas automaticamente.
5. `Validar casos de uso` (libera a Etapa 3). Editar depois reverte para pendente.

**Etapa 3 - User Stories**

6. `OK, gerar User Stories com IA` -> a IA produz uma user story por UC com 2 a 4 criterios em estilo Gherkin.
7. `Baixar PDF completo` na lateral direita gera o PDF com tudo em sequencia.

A qualquer momento, `Resetar pipeline` (canto superior direito) zera tudo.

## 8) Onde ficam as saidas

Dentro da pasta do projeto:

```text
outputs/web_gui/
├── relatorio_completo.pdf
├── requisitos_funcionais.{json,md}
├── user_stories.{json,md}
├── tabela_casos_de_uso.md
├── casos_de_uso.csv
├── relatorio_casos_de_uso.txt
├── diagrama_casos_de_uso.svg
└── diagrama_casos_de_uso.puml
```

## 9) Encerrar quando terminar

```bash
docker compose down
```

Para reabrir depois sem reconstruir:

```bash
docker compose up -d
```

---

## Problemas comuns

| Sintoma | Causa | Solucao |
|---|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop fechado | Abra o Docker Desktop e espere ficar "running" |
| `port is already allocated` (8765) | Algo ja usa a porta | Edite `docker-compose.yml`, troque `"8765:8765"` por `"9000:8765"` e acesse `localhost:9000` |
| `Erro ao extrair requisitos com IA: 401` | Chave invalida ou sem saldo | Confira `.env` e o saldo em [platform.openai.com/usage](https://platform.openai.com/usage) |
| Pagina em branco ou "este site nao pode ser acessado" | Container ainda subindo | Aguarde 10 a 30s e de F5 |
| Windows: `cp` nao reconhecido | PowerShell usa outro comando | Use `Copy-Item .env.example .env` |
| Mac M1/M2/M3 lento na 1a build | Docker Desktop em emulacao | Garanta que esta usando Docker Desktop **for Apple Silicon** |
| `env file ... .env not found` em Docker antigo | Compose < 2.24 nao entende `required: false` | Atualize o Docker Desktop ou rode `cp .env.example .env` antes |

---

# Modo alternativo - rodar com Python local (sem Docker)

So necessario se voce nao quer instalar Docker.

## Configurar chave da API

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```text
OPENAI_API_KEY=sua_chave_aqui
OPENAI_MODEL=gpt-5.2
```

Instale as dependencias em um virtualenv local (em macOS o Python do Homebrew nao permite `pip install` global):

```bash
python3 -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Em seguida sempre rode com o venv ativo (ou usando `.venv/bin/python` diretamente).

As dependencias incluem `python-dotenv`, `reportlab` e `svglib`. As duas ultimas habilitam a geracao do PDF; se elas faltarem, o restante da aplicacao continua funcionando.

## Abrir interface grafica web local

```bash
python gui.py
```

Tambem e possivel abrir pela entrada principal:

```bash
python main.py --gui
```

Por padrao, `gui.py` abre uma interface web local para evitar problemas de Tkinter no macOS/Homebrew.

## Fluxo por terminal com IA (sem GUI)

Extrair requisitos funcionais:

```bash
python main.py --extract-requirements --file examples/entrada.txt --out outputs
```

Gerar casos de uso a partir dos requisitos aprovados:

```bash
python main.py --requirements-file outputs/requisitos_funcionais.json --out outputs
```

## Executar com texto direto

```bash
python main.py --text "O cliente pode consultar pedidos. Para consultar pedidos, o cliente deve realizar login."
```

Tambem aceita comandos curtos sem ator explicito. Nesses casos, o ator padrao sera `Usuario`:

```bash
python main.py --text "criar novos pedidos"
```

---

# Detalhes tecnicos

## Variaveis de ambiente reconhecidas pelo container

| Variavel | Default | Funcao |
|---|---|---|
| `GUI_HOST` | `0.0.0.0` | Interface de escuta. Em container precisa ser `0.0.0.0` para receber requests do host. |
| `GUI_PORT` | `8765` | Porta interna do container. |
| `GUI_OPEN_BROWSER` | `0` | Em servidor headless (container) deve ser `0`. |
| `GUI_OUTPUT_DIR` | `/app/outputs/web_gui` | Onde os artefatos sao gerados; mapeado para `./outputs/web_gui` via volume. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | (do `.env`) | Configuracao da API OpenAI. |

## Verificar se o Docker da sua maquina constroi a imagem do zero

```bash
sh scripts/verify-docker.sh
```

(Util para diagnosticar problemas de build sem cache.)

## Testes automatizados

```bash
python -m unittest discover -s tests
```

## Observacao metodologica

A IA e usada nas pontas que dependem de interpretacao de linguagem natural (extracao de RFs, geracao de user stories). O programa mantem a parte deterministica e auditavel: edicao/aprovacao dos RFs, geracao de casos de uso, diagramas, relatorios e rastreabilidade entre texto -> RF -> UC -> user story.
