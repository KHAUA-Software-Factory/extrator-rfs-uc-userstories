import type { FunctionalRequirement } from '../../model/types';

import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';

type Props = {
  phase: number;
  statusLabel: string;
  descriptionText: string;
  extracting: boolean;
  requirements: FunctionalRequirement[];
  onChangeDescription: (text: string) => void;
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
    onChangeDescription,
    onSaveDescription,
    onExtract,
    onValidate,
    onChangeRequirements,
    onAddRequirement,
    onRemoveRequirement,
  } = props;

  if (phase !== 1) return null;

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
          <Col md={12}>
            <Stack direction="horizontal" gap={2} className="action-bar">
              <Button type="button" variant="outline-secondary" onClick={onSaveDescription}>
                Salvar descrição
              </Button>
              <Button
                type="button"
                onClick={onExtract}
                disabled={!descriptionText.trim() || extracting}
              >
                {extracting ? 'Extraindo…' : 'Extrair requisitos com IA'}
              </Button>
              <Button
                type="button"
                variant="success"
                onClick={onValidate}
                disabled={!requirements.length}
              >
                Validar requisitos
              </Button>
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
          <Table bordered size="sm" responsive>
            <thead>
              <tr>
                <th>ID</th>
                <th>Ator</th>
                <th>Ação</th>
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
                  <td>
                    <Form.Control
                      value={r.id}
                      onChange={(e) => {
                        const next = [...requirements];
                        next[idx] = { ...next[idx], id: e.target.value };
                        onChangeRequirements(next);
                      }}
                    />
                  </td>
                  <td>
                    <Form.Control
                      value={r.ator}
                      onChange={(e) => {
                        const next = [...requirements];
                        next[idx] = { ...next[idx], ator: e.target.value };
                        onChangeRequirements(next);
                      }}
                    />
                  </td>
                  <td>
                    <Form.Control
                      value={r.acao}
                      onChange={(e) => {
                        const next = [...requirements];
                        next[idx] = { ...next[idx], acao: e.target.value };
                        onChangeRequirements(next);
                      }}
                    />
                  </td>
                  <td>
                    <Form.Control
                      value={r.objeto}
                      onChange={(e) => {
                        const next = [...requirements];
                        next[idx] = { ...next[idx], objeto: e.target.value };
                        onChangeRequirements(next);
                      }}
                    />
                  </td>
                  <td>
                    <Form.Select
                      value={r.prioridade}
                      onChange={(e) => {
                        const next = [...requirements];
                        next[idx] = {
                          ...next[idx],
                          prioridade: e.target.value as FunctionalRequirement['prioridade'],
                        };
                        onChangeRequirements(next);
                      }}
                    >
                      <option value="Alta">Alta</option>
                      <option value="Media">Média</option>
                      <option value="Baixa">Baixa</option>
                    </Form.Select>
                  </td>
                  <td>
                    <Form.Control
                      value={r.descricao}
                      onChange={(e) => {
                        const next = [...requirements];
                        next[idx] = { ...next[idx], descricao: e.target.value };
                        onChangeRequirements(next);
                      }}
                    />
                  </td>
                  <td>
                    <Form.Control
                      value={r.origem}
                      onChange={(e) => {
                        const next = [...requirements];
                        next[idx] = { ...next[idx], origem: e.target.value };
                        onChangeRequirements(next);
                      }}
                    />
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => onRemoveRequirement(idx)}
                    >
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Alert variant="secondary">Nenhum requisito ainda. Extraia com IA acima.</Alert>
        )}
      </div>
    </>
  );
}
