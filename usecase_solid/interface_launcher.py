from __future__ import annotations

import os


def run_interface() -> int:
    if os.getenv("USE_TK_GUI", "").strip() != "1":
        from usecase_solid.web_gui import run_web_gui

        return run_web_gui()

    try:
        from usecase_solid.gui import run_gui

        return run_gui()
    except ModuleNotFoundError as exc:
        if exc.name not in {"_tkinter", "tkinter"}:
            raise
        print("Tkinter nao esta disponivel neste Python. Abrindo interface web local.")
        from usecase_solid.web_gui import run_web_gui

        return run_web_gui()
    except Exception as exc:
        module_name = exc.__class__.__module__
        if module_name != "tkinter":
            raise
        print("Nao foi possivel abrir a janela Tkinter. Abrindo interface web local.")
        from usecase_solid.web_gui import run_web_gui

        return run_web_gui()
