import type { FunctionalRequirement } from '../../model/types';

import { useState } from 'react';

import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Row from 'react-bootstrap/Row';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';

import {
  getRequirementLanguageOption,
  getRequirementPriorityLabel,
  REQUIREMENT_LANGUAGE_OPTIONS,
  type RequirementLanguage,
} from '../../model/language';
import { ResultItemActions } from '../../shared/ui/ResultItemActions';

type Props = {
  phase: number;
  statusLabel: string;
  descriptionText: string;
  extracting: boolean;
  requirements: FunctionalRequirement[];
  language: RequirementLanguage;
  onChangeDescription: (text: string) => void;
  onChangeLanguage: (language: RequirementLanguage) => void;
  onSaveDescription: () => void;
  onExtract: () => void;
  onValidate: () => void;
  onChangeRequirements: (next: FunctionalRequirement[]) => void;
  onAddRequirement: () => void;
  onRemoveRequirement: (index: number) => void;
};

export function RequirementsStep(props: Props) {
  const {
    phase,
    statusLabel,
    descriptionText,
    extracting,
    requirements,
    language,
    onChangeDescription,
    onChangeLanguage,
    onSaveDescription,
    onExtract,
    onValidate,
    onChangeRequirements,
    onAddRequirement,
    onRemoveRequirement,
  } = props;

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftRequirement, setDraftRequirement] = useState<FunctionalRequirement | null>(null);
  const hasDescription = Boolean(descriptionText.trim());
  const hasRequirements = requirements.length > 0;

  if (phase !== 1) return null;

  function startEditRequirement(index: number) {
    setEditingIndex(index);
    setDraftRequirement({ ...requirements[index] });
  }

  function closeEditRequirement() {
    setEditingIndex(null);
    setDraftRequirement(null);
  }

  function saveRequirement() {
    if (editingIndex === null || !draftRequirement) return;
    const next = [...requirements];
    next[editingIndex] = draftRequirement;
    onChangeRequirements(next);
    closeEditRequirement();
  }

  function removeRequirement(index: number) {
    if (editingIndex === index) closeEditRequirement();
    onRemoveRequirement(index);
  }

  return (
    <>
      <h5 className="mb-3">Etapa 1 – Requisitos (IA)</h5>

      <Form>
        <Row className="g-3">
          <Col md={12}>
            <Form.Label>Descrição livre do sistema</Form.Label>
            <Form.Control
              as="textarea"
              rows={6}
              value={descriptionText}
              onChange={(e) => onChangeDescription(e.target.value)}
            />
          </Col>
          <Col md={5}>
            <Form.Label>Idioma dos requisitos</Form.Label>
            <Form.Select value={language} onChange={(e) => onChangeLanguage(e.target.value as RequirementLanguage)}>
              {REQUIREMENT_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.flag} {option.label}
                </option>
              ))}
            </Form.Select>
            <div className="text-muted small mt-1">
              O prompt roda em inglês e a saída é traduzida para{' '}
              <strong>{getRequirementLanguageOption(language).label}</strong>.
            </div>
          </Col>
          <Col md={12}>
            <Stack direction="horizontal" gap={2} className="action-bar">
              {hasDescription ? (
                <Button type="button" variant="outline-secondary" onClick={onSaveDescription}>
                  Salvar descrição
                </Button>
              ) : null}
              {hasDescription || extracting ? (
                <Button type="button" onClick={onExtract} disabled={extracting}>
                  {extracting ? 'Extraindo…' : 'Extrair requisitos com IA'}
                </Button>
              ) : null}
              {hasRequirements ? (
                <Button type="button" variant="success" onClick={onValidate}>
                  Validar requisitos
                </Button>
              ) : null}
              <Button type="button" variant="outline-primary" onClick={onAddRequirement}>
                Adicionar RF
              </Button>
              <div className="status-pill text-muted small ms-auto">
                status: <code>{statusLabel}</code>
              </div>
            </Stack>
          </Col>
        </Row>
      </Form>

      <div className="mt-3">
        {requirements.length ? (
          <Table bordered size="sm" responsive className="result-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Ator</th>
                <th>Ação do requisito</th>
                <th>Objeto</th>
                <th>Prioridade</th>
                <th>Descrição</th>
                <th>Origem</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((r, idx) => (
                <tr key={r.id || idx}>
                  <td className="result-table__id">{r.id || '-'}</td>
                  <td>{r.ator || '-'}</td>
                  <td>{r.acao || '-'}</td>
                  <td>{r.objeto || '-'}</td>
                  <td>{r.prioridade ? getRequirementPriorityLabel(r.prioridade, language) : '-'}</td>
                  <td className="result-table__long">{r.descricao || '-'}</td>
                  <td className="result-table__muted">{r.origem || '-'}</td>
                  <td className="text-end">
                    <ResultItemActions
                      editLabel={`Editar requisito ${r.id || idx + 1}`}
                      deleteLabel={`Excluir requisito ${r.id || idx + 1}`}
                      onEdit={() => startEditRequirement(idx)}
                      onDelete={() => removeRequirement(idx)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Alert variant="secondary">Nenhum requisito ainda. Extraia com IA acima.</Alert>
        )}
      </div>

      <Modal show={Boolean(draftRequirement)} onHide={closeEditRequirement} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Editar requisito funcional</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {draftRequirement ? (
            <Form>
              <div className="result-modal-grid result-modal-grid--two">
                <Form.Group>
                  <Form.Label>ID</Form.Label>
                  <Form.Control
                    value={draftRequirement.id}
                    onChange={(e) =>
                      setDraftRequirement({ ...draftRequirement, id: e.target.value })
                    }
                  />
                </Form.Group>
                  <Form.Group>
                    <Form.Label>Prioridade</Form.Label>
                    <Form.Select
                      value={draftRequirement.prioridade}
                      onChange={(e) =>
                      setDraftRequirement({
                        ...draftRequirement,
                        prioridade: e.target.value as FunctionalRequirement['prioridade'],
                      })
                    }
                  >
                    <option value="Alta">{getRequirementPriorityLabel('Alta', language)}</option>
                    <option value="Media">{getRequirementPriorityLabel('Media', language)}</option>
                    <option value="Baixa">{getRequirementPriorityLabel('Baixa', language)}</option>
                    </Form.Select>
                  </Form.Group>
                <Form.Group>
                  <Form.Label>Ator</Form.Label>
                  <Form.Control
                    value={draftRequirement.ator}
                    onChange={(e) =>
                      setDraftRequirement({ ...draftRequirement, ator: e.target.value })
                    }
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label>Ação do requisito</Form.Label>
                  <Form.Control
                    value={draftRequirement.acao}
                    onChange={(e) =>
                      setDraftRequirement({ ...draftRequirement, acao: e.target.value })
                    }
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label>Objeto</Form.Label>
                  <Form.Control
                    value={draftRequirement.objeto}
                    onChange={(e) =>
                      setDraftRequirement({ ...draftRequirement, objeto: e.target.value })
                    }
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label>Origem</Form.Label>
                  <Form.Control
                    value={draftRequirement.origem}
                    onChange={(e) =>
                      setDraftRequirement({ ...draftRequirement, origem: e.target.value })
                    }
                  />
                </Form.Group>
              </div>
              <Form.Group className="mt-3">
                <Form.Label>Descrição</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={draftRequirement.descricao}
                  onChange={(e) =>
                    setDraftRequirement({ ...draftRequirement, descricao: e.target.value })
                  }
                />
              </Form.Group>
            </Form>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeEditRequirement}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={saveRequirement}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
