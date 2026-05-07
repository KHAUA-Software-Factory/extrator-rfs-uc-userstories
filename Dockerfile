FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    GUI_HOST=0.0.0.0 \
    GUI_PORT=8765 \
    GUI_OPEN_BROWSER=0 \
    GUI_OUTPUT_DIR=/app/outputs/web_gui

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .

RUN mkdir -p /app/outputs/web_gui

EXPOSE 8765

# Healthcheck simples: a pagina inicial deve retornar 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/', timeout=3).status == 200 else 1)" || exit 1

CMD ["python", "gui.py"]
