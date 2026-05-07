from __future__ import annotations

from typing import Dict, Iterable, List, Optional

from usecase_solid.text_utils import normalize_for_match


VERB_FORMS: Dict[str, List[str]] = {
    "Acompanhar": ["acompanhar", "acompanha", "acompanham", "acompanhe"],
    "Agendar": ["agendar", "agenda", "agendam", "agende"],
    "Alterar": ["alterar", "altera", "alteram", "edita", "editar", "atualiza", "atualizar"],
    "Aprovar": ["aprovar", "aprova", "aprovam", "aprove"],
    "Autenticar": ["autenticar", "autentica", "autenticam"],
    "Cadastrar": ["cadastrar", "cadastra", "cadastram", "cadastre", "registrar", "registra", "registram"],
    "Cancelar": ["cancelar", "cancela", "cancelam", "cancele"],
    "Confirmar": ["confirmar", "confirma", "confirmam", "confirme"],
    "Consultar": ["consultar", "consulta", "consultam", "consulte", "visualizar", "visualiza", "visualizam"],
    "Criar": ["criar", "cria", "criam", "crie"],
    "Emitir": ["emitir", "emite", "emitem", "imprimir", "imprime", "imprimem"],
    "Enviar": ["enviar", "envia", "enviam", "envie"],
    "Excluir": ["excluir", "exclui", "excluem", "remover", "remove", "removem"],
    "Executar": ["executar", "executa", "executam"],
    "Gerar": ["gerar", "gera", "geram", "gere"],
    "Informar": ["informar", "informa", "informam", "preencher", "preenche", "preenchem"],
    "Manter": ["manter", "mantem", "mantém", "gerenciar", "gerencia", "gerenciam"],
    "Pagar": ["pagar", "paga", "pagam"],
    "Pesquisar": ["pesquisar", "pesquisa", "pesquisam", "buscar", "busca", "buscam"],
    "Receber": ["receber", "recebe", "recebem"],
    "Realizar": ["realizar", "realiza", "realizam", "fazer", "faz", "fazem", "efetuar", "efetua", "efetuam"],
    "Reprovar": ["reprovar", "reprova", "reprovam", "reprove"],
    "Reservar": ["reservar", "reserva", "reservam", "reserve"],
    "Solicitar": ["solicitar", "solicita", "solicitam", "solicite"],
    "Validar": ["validar", "valida", "validam", "valide"],
}


NOMINAL_ACTION_FORMS: Dict[str, List[str]] = {
    "Acompanhar": ["acompanhamento"],
    "Agendar": ["agendamento"],
    "Alterar": ["alteracao", "alteração", "edicao", "edição", "atualizacao", "atualização"],
    "Aprovar": ["aprovacao", "aprovação"],
    "Autenticar": ["autenticacao", "autenticação", "login"],
    "Cadastrar": ["cadastro", "cadastramento", "registro"],
    "Cancelar": ["cancelamento"],
    "Confirmar": ["confirmacao", "confirmação"],
    "Consultar": ["consulta", "visualizacao", "visualização"],
    "Criar": ["criacao", "criação"],
    "Emitir": ["emissao", "emissão", "impressao", "impressão"],
    "Enviar": ["envio"],
    "Excluir": ["exclusao", "exclusão", "remocao", "remoção"],
    "Gerar": ["geracao", "geração"],
    "Informar": ["informacao", "informação", "preenchimento"],
    "Manter": ["manutencao", "manutenção", "gerenciamento", "gestao", "gestão"],
    "Pagar": ["pagamento"],
    "Pesquisar": ["pesquisa", "busca"],
    "Receber": ["recebimento"],
    "Reservar": ["reserva"],
    "Solicitar": ["solicitacao", "solicitação", "pedido"],
    "Validar": ["validacao", "validação"],
}


class PortugueseActionLexicon:
    def __init__(
        self,
        verb_forms: Optional[Dict[str, List[str]]] = None,
        nominal_forms: Optional[Dict[str, List[str]]] = None,
    ) -> None:
        self._verb_forms = verb_forms or VERB_FORMS
        self._nominal_forms = nominal_forms or NOMINAL_ACTION_FORMS
        self._canonical_by_form: Dict[str, str] = {}
        for canonical, forms in self._verb_forms.items():
            self._canonical_by_form[normalize_for_match(canonical)] = canonical
            for form in forms:
                self._canonical_by_form[normalize_for_match(form)] = canonical
        self._canonical_by_nominal: Dict[str, str] = {}
        for canonical, forms in self._nominal_forms.items():
            for form in forms:
                self._canonical_by_nominal[normalize_for_match(form)] = canonical

    def all_forms(self) -> Iterable[str]:
        forms = set(self._canonical_by_form.keys())
        for canonical, verb_forms in self._verb_forms.items():
            forms.add(canonical)
            forms.update(verb_forms)
        return sorted(forms, key=len, reverse=True)

    def all_nominal_forms(self) -> Iterable[str]:
        forms = set(self._canonical_by_nominal.keys())
        for nominal_forms in self._nominal_forms.values():
            forms.update(nominal_forms)
        return sorted(forms, key=len, reverse=True)

    def canonical(self, verb_form: str) -> str:
        return self._canonical_by_form.get(normalize_for_match(verb_form), verb_form.capitalize())

    def canonical_from_nominal(self, nominal_form: str) -> str:
        return self._canonical_by_nominal.get(normalize_for_match(nominal_form), nominal_form.capitalize())
