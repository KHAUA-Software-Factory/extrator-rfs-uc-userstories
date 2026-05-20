import type { UserStory } from '../../model/types';

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
  plantuml: string;
  userStories: UserStory[];
  onGenerate: () => void;
  onExportPdf: () => void;
  onFinishExtraction: () => void;
  onChangeUserStories: (next: UserStory[]) => void;
  onRemoveUserStory: (index: number) => void;
};

export function UserStoriesStep(props: Props) {
  const {
    phase,
    statusText,
    statusLabel,
    generating,
    plantuml,
    userStories,
    onGenerate,
    onExportPdf,
    onFinishExtraction,
    onChangeUserStories,
    onRemoveUserStory,
  } = props;

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftStory, setDraftStory] = useState<UserStory | null>(null);
  const canGenerate = Boolean(plantuml.trim()) && statusText === 'uml_validated';
  const hasUserStories = userStories.length > 0;
  const isFinished = statusText === 'extraction_finished';

  if (phase !== 4) return null;

  function startEditStory(index: number) {
    setEditingIndex(index);
    setDraftStory({
      ...userStories[index],
      criterios_de_aceitacao: [...(userStories[index].criterios_de_aceitacao || [])],
      casos_de_uso_relacionados: [...(userStories[index].casos_de_uso_relacionados || [])],
    });
  }

  function closeEditStory() {
    setEditingIndex(null);
    setDraftStory(null);
  }

  function saveStory() {
    if (editingIndex === null || !draftStory) return;
    const next = [...userStories];
    next[editingIndex] = draftStory;
    onChangeUserStories(next);
    closeEditStory();
  }

  function removeStory(index: number) {
    if (editingIndex === index) closeEditStory();
    onRemoveUserStory(index);
  }

  function updateDraftStory(patch: Partial<UserStory>) {
    if (!draftStory) return;
    setDraftStory({ ...draftStory, ...patch });
  }

  return (
    <>
      <h5 className="mb-3">Etapa 4 – User Stories (IA)</h5>
      <Stack direction="horizontal" gap={2} className="action-bar mb-3">
        {canGenerate || generating ? (
          <Button onClick={onGenerate} disabled={generating}>
            {generating ? 'Gerando…' : 'Gerar User Stories com IA'}
          </Button>
        ) : null}
        {hasUserStories ? (
          <Button variant="success" onClick={onExportPdf}>
            Baixar PDF
          </Button>
        ) : null}
        <div className="status-pill text-muted small ms-auto">
          status: <code>{statusLabel}</code>
        </div>
      </Stack>

      {userStories.length ? (
        <>
          <Table bordered size="sm" responsive className="result-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Papel</th>
                <th>Quero</th>
                <th>Para</th>
                <th>Critérios</th>
                <th>UC(s)</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {userStories.map((s, idx) => (
                <tr key={s.id || idx}>
                  <td className="result-table__id">{s.id || '-'}</td>
                  <td>{s.papel}</td>
                  <td>{s.quero}</td>
                  <td>{s.para}</td>
                  <td>
                    <ul className="mb-0">
                      {(s.criterios_de_aceitacao || []).map((c, idx) => (
                        <li key={idx}>{c}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="text-muted">{(s.casos_de_uso_relacionados || []).join(', ')}</td>
                  <td className="text-end">
                    <ResultItemActions
                      editLabel={`Editar user story ${s.id || idx + 1}`}
                      deleteLabel={`Excluir user story ${s.id || idx + 1}`}
                      onEdit={() => startEditStory(idx)}
                      onDelete={() => removeStory(idx)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Stack direction="horizontal" gap={2} className="justify-content-end mt-3">
            <Button
              variant={isFinished ? 'outline-success' : 'primary'}
              onClick={onFinishExtraction}
              disabled={isFinished}
            >
              {isFinished ? 'Extração finalizada' : 'Finalizar extração'}
            </Button>
          </Stack>
        </>
      ) : (
        <Alert variant="secondary">Valide o diagrama (Etapa 3) para liberar a geração.</Alert>
      )}

      <Modal show={Boolean(draftStory)} onHide={closeEditStory} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Editar user story</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {draftStory ? (
            <Form>
              <div className="result-modal-grid result-modal-grid--two">
                <Form.Group>
                  <Form.Label>ID</Form.Label>
                  <Form.Control
                    value={draftStory.id}
                    onChange={(e) => updateDraftStory({ id: e.target.value })}
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label>Papel</Form.Label>
                  <Form.Control
                    value={draftStory.papel}
                    onChange={(e) => updateDraftStory({ papel: e.target.value })}
                  />
                </Form.Group>
              </div>
              <Form.Group className="mt-3">
                <Form.Label>Quero</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={draftStory.quero}
                  onChange={(e) => updateDraftStory({ quero: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mt-3">
                <Form.Label>Para</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={draftStory.para}
                  onChange={(e) => updateDraftStory({ para: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mt-3">
                <Form.Label>Critérios de aceitação</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={5}
                  value={(draftStory.criterios_de_aceitacao || []).join('\n')}
                  onChange={(e) =>
                    updateDraftStory({
                      criterios_de_aceitacao: e.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Form.Group>
              <Form.Group className="mt-3">
                <Form.Label>Casos de uso relacionados</Form.Label>
                <Form.Control
                  value={(draftStory.casos_de_uso_relacionados || []).join(', ')}
                  onChange={(e) =>
                    updateDraftStory({
                      casos_de_uso_relacionados: e.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Form.Group>
            </Form>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeEditStory}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={saveStory}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
