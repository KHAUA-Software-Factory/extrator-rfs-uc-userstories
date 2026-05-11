import type { UserStory } from '../../model/types';

import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';

type Props = {
  phase: number;
  statusText: string;
  statusLabel: string;
  generating: boolean;
  plantuml: string;
  userStories: UserStory[];
  onGenerate: () => void;
  onExportPdf: () => void;
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
  } = props;

  if (phase !== 4) return null;

  const canGenerate = Boolean(plantuml.trim()) && statusText === 'uml_validated';
  const hasUserStories = userStories.length > 0;

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
        <Table bordered size="sm" responsive>
          <thead>
            <tr>
              <th>ID</th>
              <th>Papel</th>
              <th>Quero</th>
              <th>Para</th>
              <th>Critérios</th>
              <th>UC(s)</th>
            </tr>
          </thead>
          <tbody>
            {userStories.map((s) => (
              <tr key={s.id}>
                <td className="text-muted">{s.id}</td>
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
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Alert variant="secondary">Valide o diagrama (Etapa 3) para liberar a geração.</Alert>
      )}
    </>
  );
}
