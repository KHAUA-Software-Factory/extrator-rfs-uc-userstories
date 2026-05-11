import type { UseCase, UseCaseRelation } from '../../model/types';

import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';

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

  if (phase !== 2) return null;

  const canGenerate = requirementsCount > 0 && statusText === 'requirements_validated';
  const hasUseCases = useCases.length > 0;

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
        <Table bordered size="sm" responsive>
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
              const targetOptions = useCases.filter((_, candidateIdx) => candidateIdx !== idx);

              function updateUseCase(patch: Partial<UseCase>) {
                const next = [...useCases];
                next[idx] = { ...next[idx], relacoes, ...patch };
                onChangeUseCases(next);
              }

              function updateRelation(relationIdx: number, patch: Partial<UseCaseRelation>) {
                updateUseCase({
                  relacoes: relacoes.map((relacao, currentIdx) =>
                    currentIdx === relationIdx ? { ...relacao, ...patch } : relacao,
                  ),
                });
              }

              function addRelation() {
                updateUseCase({
                  relacoes: [
                    ...relacoes,
                    {
                      tipo: 'include',
                      destino: targetOptions[0]?.id || '',
                      condicao: '',
                    },
                  ],
                });
              }

              function removeRelation(relationIdx: number) {
                updateUseCase({
                  relacoes: relacoes.filter((_, currentIdx) => currentIdx !== relationIdx),
                });
              }

              return (
                <tr key={uc.id || idx}>
                  <td className="text-muted">
                    <Form.Control
                      value={uc.id}
                      onChange={(e) => {
                        const next = [...useCases];
                        next[idx] = { ...next[idx], id: e.target.value };
                        onChangeUseCases(next);
                      }}
                    />
                  </td>
                  <td>
                    <Form.Control
                      value={uc.nome}
                      onChange={(e) => {
                        const next = [...useCases];
                        next[idx] = { ...next[idx], nome: e.target.value };
                        onChangeUseCases(next);
                      }}
                    />
                  </td>
                  <td>
                    <Form.Control
                      value={uc.ator_principal}
                      onChange={(e) => {
                        const next = [...useCases];
                        next[idx] = { ...next[idx], ator_principal: e.target.value };
                        onChangeUseCases(next);
                      }}
                    />
                  </td>
                  <td>
                    <Form.Control
                      value={uc.objetivo}
                      onChange={(e) => {
                        const next = [...useCases];
                        next[idx] = { ...next[idx], objetivo: e.target.value };
                        onChangeUseCases(next);
                      }}
                    />
                  </td>
                  <td>
                    <Stack gap={2}>
                      {relacoes.length ? (
                        relacoes.map((relacao, relationIdx) => (
                          <div
                            className="relation-editor d-flex gap-2 align-items-center"
                            key={`${uc.id || idx}:rel:${relationIdx}`}
                          >
                            <Form.Select
                              size="sm"
                              style={{ maxWidth: 110 }}
                              value={relacao.tipo}
                              onChange={(e) =>
                                updateRelation(relationIdx, {
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
                                updateRelation(relationIdx, { destino: e.target.value })
                              }
                            >
                              <option value="">UC destino</option>
                              {targetOptions.map((target) => (
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
                                updateRelation(relationIdx, { condicao: e.target.value })
                              }
                            />
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => removeRelation(relationIdx)}
                            >
                              Remover
                            </Button>
                          </div>
                        ))
                      ) : (
                        <span className="text-muted small">Sem relações</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={addRelation}
                        disabled={!targetOptions.length}
                      >
                        Adicionar relação
                      </Button>
                    </Stack>
                  </td>
                  <td>
                    <Button size="sm" variant="outline-danger" onClick={() => onRemoveUseCase(idx)}>
                      Remover
                    </Button>
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
    </>
  );
}
