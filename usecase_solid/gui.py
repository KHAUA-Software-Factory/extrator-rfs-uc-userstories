from __future__ import annotations

import webbrowser
from pathlib import Path
from typing import Dict, Optional

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from usecase_solid.application import UseCaseAnalysisResult
from usecase_solid.bootstrap import build_analysis_service
from usecase_solid.output_writer import write_analysis_outputs


class UseCaseExtractorGui:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.service = build_analysis_service()
        self.output_dir = Path("outputs/gui")
        self.latest_result: Optional[UseCaseAnalysisResult] = None
        self.latest_paths: Dict[str, Path] = {}

        self.root.title("Extrator de Casos de Uso")
        self.root.geometry("1180x760")
        self.root.minsize(980, 620)

        self._build_layout()
        self._load_example_text()

    def _build_layout(self) -> None:
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)

        container = ttk.Frame(self.root, padding=12)
        container.grid(row=0, column=0, sticky="nsew")
        container.columnconfigure(0, weight=1)
        container.rowconfigure(1, weight=1)

        title = ttk.Label(container, text="Extrator de Casos de Uso", font=("Arial", 18, "bold"))
        title.grid(row=0, column=0, sticky="w", pady=(0, 10))

        paned = ttk.PanedWindow(container, orient=tk.HORIZONTAL)
        paned.grid(row=1, column=0, sticky="nsew")

        input_frame = ttk.Frame(paned, padding=(0, 0, 10, 0))
        output_frame = ttk.Frame(paned, padding=(10, 0, 0, 0))
        paned.add(input_frame, weight=1)
        paned.add(output_frame, weight=2)

        input_frame.columnconfigure(0, weight=1)
        input_frame.rowconfigure(1, weight=1)
        output_frame.columnconfigure(0, weight=1)
        output_frame.rowconfigure(0, weight=1)

        ttk.Label(input_frame, text="Descricao em portugues").grid(row=0, column=0, sticky="w")
        self.input_text = tk.Text(input_frame, wrap="word", undo=True, height=28, font=("Arial", 12))
        input_scroll = ttk.Scrollbar(input_frame, orient=tk.VERTICAL, command=self.input_text.yview)
        self.input_text.configure(yscrollcommand=input_scroll.set)
        self.input_text.grid(row=1, column=0, sticky="nsew", pady=(6, 10))
        input_scroll.grid(row=1, column=1, sticky="ns", pady=(6, 10))

        buttons = ttk.Frame(input_frame)
        buttons.grid(row=2, column=0, columnspan=2, sticky="ew")
        buttons.columnconfigure(4, weight=1)

        ttk.Button(buttons, text="Abrir TXT", command=self._open_text_file).grid(row=0, column=0, padx=(0, 6))
        ttk.Button(buttons, text="Processar", command=self._process_text).grid(row=0, column=1, padx=(0, 6))
        ttk.Button(buttons, text="Limpar", command=self._clear_all).grid(row=0, column=2, padx=(0, 6))
        ttk.Button(buttons, text="Salvar em...", command=self._choose_output_dir).grid(row=0, column=3, padx=(0, 6))

        self.open_diagram_button = ttk.Button(buttons, text="Abrir diagrama SVG", command=self._open_svg_diagram)
        self.open_diagram_button.grid(row=0, column=5, sticky="e")
        self.open_diagram_button.state(["disabled"])

        self.tabs = ttk.Notebook(output_frame)
        self.tabs.grid(row=0, column=0, sticky="nsew")
        self.table_text = self._add_text_tab("Tabela")
        self.report_text = self._add_text_tab("Relatorio")
        self.plantuml_text = self._add_text_tab("PlantUML")
        self.files_text = self._add_text_tab("Arquivos")

        self.status_var = tk.StringVar(value=f"Saida: {self.output_dir}")
        status = ttk.Label(container, textvariable=self.status_var, anchor="w")
        status.grid(row=2, column=0, sticky="ew", pady=(10, 0))

    def _add_text_tab(self, label: str) -> tk.Text:
        frame = ttk.Frame(self.tabs)
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(0, weight=1)
        text = tk.Text(frame, wrap="word", font=("Menlo", 12))
        scroll = ttk.Scrollbar(frame, orient=tk.VERTICAL, command=text.yview)
        text.configure(yscrollcommand=scroll.set)
        text.grid(row=0, column=0, sticky="nsew")
        scroll.grid(row=0, column=1, sticky="ns")
        self.tabs.add(frame, text=label)
        return text

    def _load_example_text(self) -> None:
        example = Path("examples/entrada.txt")
        if example.exists():
            self.input_text.insert("1.0", example.read_text(encoding="utf-8"))

    def _open_text_file(self) -> None:
        filename = filedialog.askopenfilename(
            title="Abrir arquivo de texto",
            filetypes=[("Arquivos de texto", "*.txt"), ("Todos os arquivos", "*.*")],
        )
        if not filename:
            return
        path = Path(filename)
        self.input_text.delete("1.0", tk.END)
        self.input_text.insert("1.0", path.read_text(encoding="utf-8"))
        self.status_var.set(f"Entrada carregada: {path}")

    def _choose_output_dir(self) -> None:
        dirname = filedialog.askdirectory(title="Selecionar pasta de saida")
        if not dirname:
            return
        self.output_dir = Path(dirname)
        self.status_var.set(f"Saida: {self.output_dir}")

    def _process_text(self) -> None:
        text = self.input_text.get("1.0", tk.END).strip()
        if not text:
            messagebox.showwarning("Aviso", "Digite uma descricao antes de processar.")
            return

        try:
            result = self.service.execute(text)
            paths = write_analysis_outputs(result, self.output_dir)
        except Exception as exc:
            messagebox.showerror("Erro", f"Nao foi possivel processar o texto.\n\n{exc}")
            return

        self.latest_result = result
        self.latest_paths = paths
        self._replace_text(self.table_text, result.markdown_table)
        self._replace_text(self.report_text, result.text_report)
        self._replace_text(self.plantuml_text, result.plantuml_diagram)
        self._replace_text(self.files_text, self._format_paths(paths))
        self.open_diagram_button.state(["!disabled"])
        self.status_var.set(f"{len(result.document.use_cases)} caso(s) de uso gerado(s). Saida: {self.output_dir}")
        self.tabs.select(0)

    def _open_svg_diagram(self) -> None:
        path = self.latest_paths.get("diagrama_casos_de_uso.svg")
        if not path:
            messagebox.showwarning("Aviso", "Processe um texto antes de abrir o diagrama.")
            return
        webbrowser.open(path.resolve().as_uri())

    def _clear_all(self) -> None:
        self.input_text.delete("1.0", tk.END)
        for text_widget in (self.table_text, self.report_text, self.plantuml_text, self.files_text):
            self._replace_text(text_widget, "")
        self.latest_result = None
        self.latest_paths = {}
        self.open_diagram_button.state(["disabled"])
        self.status_var.set(f"Saida: {self.output_dir}")

    def _replace_text(self, widget: tk.Text, value: str) -> None:
        widget.configure(state="normal")
        widget.delete("1.0", tk.END)
        widget.insert("1.0", value)
        widget.configure(state="normal")

    def _format_paths(self, paths: Dict[str, Path]) -> str:
        lines = ["Arquivos gerados:"]
        for path in paths.values():
            lines.append(f"- {path}")
        return "\n".join(lines)


def run_gui() -> int:
    root = tk.Tk()
    UseCaseExtractorGui(root)
    root.mainloop()
    return 0
