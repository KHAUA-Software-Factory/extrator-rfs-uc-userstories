import type { UseCase, UseCaseRelation } from '../../model/types';

import { useState } from 'react';

import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';

import { ResultItemActions } from '../../shared/ui/ResultItemActions';

type Props = {
  phase: number;
  statusText: string;
  statusLabel: string;
  generating: boolean;
  requirementsCount: number;
  useCases: UseCase[];
  onGenerate: () => void;
  onValidate: () => void;
  onChangeUseCases: (next: UseCase[]) => void;
  onAddUseCase: () => void;
  onRemoveUseCase: (index: number) => void;
};

export function UseCasesStep(props: Props) {
  const {
    phase,
    statusText,
    statusLabel,
    generating,
    requirementsCount,
    useCases,
    onGenerate,
    onValidate,
    onChangeUseCases,
    onAddUseCase,
    onRemoveUseCase,
  } = props;

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftUseCase, setDraftUseCase] = useState<UseCase | null>(null);
  const canGenerate = requirementsCount > 0 && statusText === 'requirements_validated';
  const hasUseCases = useCases.length > 0;
  const draftTargetOptions =
    editingIndex === null ? [] : useCases.filter((_, candidateIdx) => candidateIdx !== editingIndex);

  if (phase !== 2) return null;

  function startEditUseCase(index: number) {
    setEditingIndex(index);
    setDraftUseCase({ ...useCases[index], relacoes: [...(useCases[index].relacoes || [])] });
  }

  function closeEditUseCase() {
    setEditingIndex(null);
    setDraftUseCase(null);
  }

  function saveUseCase() {
    if (editingIndex === null || !draftUseCase) return;
    const next = [...useCases];
    next[editingIndex] = draftUseCase;
    onChangeUseCases(next);
    closeEditUseCase();
  }

  function removeUseCase(index: number) {
    if (editingIndex === index) closeEditUseCase();
    onRemoveUseCase(index);
  }

  function updateDraftUseCase(patch: Partial<UseCase>) {
    if (!draftUseCase) return;
    setDraftUseCase({ ...draftUseCase, ...patch });
  }

  function updateDraftRelation(relationIndex: number, patch: Partial<UseCaseRelation>) {
    if (!draftUseCase) return;
    updateDraftUseCase({
      relacoes: (draftUseCase.relacoes || []).map((relacao, currentIdx) =>
        currentIdx === relationIndex ? { ...relacao, ...patch } : relacao,
      ),
    });
  }

  function addDraftRelation() {
    if (!draftUseCase) return;
    updateDraftUseCase({
      relacoes: [
        ...(draftUseCase.relacoes || []),
        {
          tipo: 'include',
          destino: draftTargetOptions[0]?.id || '',
          condicao: '',
        },
      ],
    });
  }

  function removeDraftRelation(relationIndex: number) {
    if (!draftUseCase) return;
    updateDraftUseCase({
      relacoes: (draftUseCase.relacoes || []).filter((_, currentIdx) => currentIdx !== relationIndex),
    });
  }

  function formatUseCaseLabel(id: string) {
    const useCase = useCases.find((candidate) => candidate.id === id);
    if (!useCase) return id || '-';
    return `${useCase.id || '-'}${useCase.nome ? ` - ${useCase.nome}` : ''}`;
  }

  return (
    <>
      <h5 className="mb-3">Etapa 2 – Casos de uso (IA + edição)</h5>
      <Stack direction="horizontal" gap={2} className="action-bar mb-3">
        {canGenerate || generating ? (
          <Button onClick={onGenerate} disabled={generating}>
            {generating ? 'Gerando…' : 'Gerar lista de UCs com IA'}
          </Button>
        ) : null}
        {hasUseCases ? (
          <Button variant="success" onClick={onValidate}>
            Validar UCs
          </Button>
        ) : null}
        {requirementsCount ? (
          <Button variant="outline-primary" onClick={onAddUseCase}>
            Adicionar UC
          </Button>
        ) : null}
        <div className="status-pill text-muted small ms-auto">
          status: <code>{statusLabel}</code>
        </div>
      </Stack>

      {useCases.length ? (
        <Table bordered size="sm" responsive className="result-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome</th>
              <th>Ator principal</th>
              <th>Objetivo</th>
              <th>Include / Extend</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {useCases.map((uc, idx) => {
              const relacoes = uc.relacoes || [];

              return (
                <tr key={uc.id || idx}>
                  <td className="result-table__id">{uc.id || '-'}</td>
                  <td>{uc.nome || '-'}</td>
                  <td>{uc.ator_principal || '-'}</td>
                  <td className="result-table__long">{uc.objetivo || '-'}</td>
                  <td>
                    {relacoes.length ? (
                      <div className="result-relation-list">
                        {relacoes.map((relacao, relationIdx) => (
                          <div
                            className="result-relation-list__item"
                            key={`${uc.id || idx}:rel:${relationIdx}`}
                          >
                            <span
                              className={`result-chip result-chip--${relacao.tipo}`}
                            >{`<<${relacao.tipo}>>`}</span>
                            <span>{formatUseCaseLabel(relacao.destino)}</span>
                            {relacao.condicao ? (
                              <span className="result-table__muted">({relacao.condicao})</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="result-table__muted">Sem relações</span>
                    )}
                  </td>
                  <td className="text-end">
                    <ResultItemActions
                      editLabel={`Editar caso de uso ${uc.id || idx + 1}`}
                      deleteLabel={`Excluir caso de uso ${uc.id || idx + 1}`}
                      onEdit={() => startEditUseCase(idx)}
                      onDelete={() => removeUseCase(idx)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <Alert variant="secondary">
          Valide os requisitos (Etapa 1) para liberar a geração da lista de UCs.
        </Alert>
      )}

      <Modal show={Boolean(draftUseCase)} onHide={closeEditUseCase} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Editar caso de uso</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {draftUseCase ? (
            <Form>
              <div className="result-modal-grid result-modal-grid--two">
                <Form.Group>
                  <Form.Label>ID</Form.Label>
                  <Form.Control
                    value={draftUseCase.id}
                    onChange={(e) => updateDraftUseCase({ id: e.target.value })}
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label>Ator principal</Form.Label>
                  <Form.Control
                    value={draftUseCase.ator_principal}
                    onChange={(e) => updateDraftUseCase({ ator_principal: e.target.value })}
                  />
                </Form.Group>
              </div>
              <Form.Group className="mt-3">
                <Form.Label>Nome</Form.Label>
                <Form.Control
                  value={draftUseCase.nome}
                  onChange={(e) => updateDraftUseCase({ nome: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mt-3">
                <Form.Label>Objetivo</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={draftUseCase.objetivo}
                  onChange={(e) => updateDraftUseCase({ objetivo: e.target.value })}
                />
              </Form.Group>
              <div className="mt-3">
                <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                  <Form.Label className="mb-0">Include / Extend</Form.Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-secondary"
                    onClick={addDraftRelation}
                    disabled={!draftTargetOptions.length}
                  >
                    Adicionar relação
                  </Button>
                </div>
                <Stack gap={2}>
                  {(draftUseCase.relacoes || []).length ? (
                    (draftUseCase.relacoes || []).map((relacao, relationIdx) => (
                      <div
                        className="relation-editor d-flex gap-2 align-items-center"
                        key={`draft-rel:${relationIdx}`}
                      >
                        <Form.Select
                          size="sm"
                          style={{ maxWidth: 110 }}
                          value={relacao.tipo}
                          onChange={(e) =>
                            updateDraftRelation(relationIdx, {
                              tipo: e.target.value as UseCaseRelation['tipo'],
                            })
                          }
                        >
                          <option value="include">include</option>
                          <option value="extend">extend</option>
                        </Form.Select>
                        <Form.Select
                          size="sm"
                          value={relacao.destino}
                          onChange={(e) =>
                            updateDraftRelation(relationIdx, { destino: e.target.value })
                          }
                        >
                          <option value="">UC destino</option>
                          {draftTargetOptions.map((target) => (
                            <option value={target.id} key={target.id || target.nome}>
                              {target.id || target.nome}
                            </option>
                          ))}
                        </Form.Select>
                        <Form.Control
                          size="sm"
                          placeholder="Condição"
                          value={relacao.condicao}
                          onChange={(e) =>
                            updateDraftRelation(relationIdx, { condicao: e.target.value })
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline-danger"
                          className="result-icon-button"
                          onClick={() => removeDraftRelation(relationIdx)}
                          aria-label="Excluir relação"
                          title="Excluir relação"
                        >
                          x
                        </Button>
                      </div>
                    ))
                  ) : (
                    <span className="result-table__muted small">Sem relações</span>
                  )}
                </Stack>
              </div>
            </Form>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeEditUseCase}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={saveUseCase}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
