import type { DiagramModel } from '../../../../plantumlBridge';
import type { FunctionalRequirement, UseCase, UserStory } from '../../model/types';

type Props = {
  title: string;
  statusLabel: string;
  descriptionText: string;
  requirements: FunctionalRequirement[];
  useCases: UseCase[];
  diagram: DiagramModel | null;
  userStories: UserStory[];
};

type NodeBox = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isUseCase: boolean;
};

const ACTOR_WIDTH = 172;
const ACTOR_HEIGHT = 54;
const USE_CASE_WIDTH = 248;
const USE_CASE_HEIGHT = 66;

export function AnalysisReport(props: Props) {
  const { title, statusLabel, descriptionText, requirements, useCases, diagram, userStories } =
    props;

  return (
    <section className="print-report" aria-label="Relatorio da analise">
      <header className="print-report__header">
        <div>
          <p className="print-report__eyebrow">Extrator de elementos de engenharia de software</p>
          <h1>{title || 'Analise de requisitos'}</h1>
        </div>
        <div className="print-report__meta">
          <div>Status: {statusLabel}</div>
          <div>Gerado em: {new Date().toLocaleString('pt-BR')}</div>
        </div>
      </header>

      <section>
        <h2>Descricao inicial</h2>
        <p className="print-report__text">{descriptionText || 'Sem descricao registrada.'}</p>
      </section>

      <section>
        <h2>Requisitos funcionais</h2>
        <table className="print-report__table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Descricao</th>
              <th>Ator</th>
              <th>Prioridade</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((requirement) => (
              <tr key={requirement.id}>
                <td>{requirement.id}</td>
                <td>{requirement.descricao}</td>
                <td>{requirement.ator}</td>
                <td>{requirement.prioridade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Casos de uso</h2>
        <table className="print-report__table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome</th>
              <th>Ator</th>
              <th>Objetivo</th>
              <th>Relacoes</th>
            </tr>
          </thead>
          <tbody>
            {useCases.map((useCase) => (
              <tr key={useCase.id}>
                <td>{useCase.id}</td>
                <td>{useCase.nome}</td>
                <td>{useCase.ator_principal}</td>
                <td>{useCase.objetivo}</td>
                <td>{formatUseCaseRelations(useCase)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="print-report__diagram-section print-report__diagram-page">
        <h2>Diagrama de casos de uso</h2>
        <StaticDiagram diagram={diagram} />
      </section>

      <section>
        <h2>User stories</h2>
        <table className="print-report__table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Story</th>
              <th>Criterios de aceitacao</th>
              <th>UCs</th>
            </tr>
          </thead>
          <tbody>
            {userStories.map((story) => (
              <tr key={story.id}>
                <td>{story.id}</td>
                <td>
                  Como {story.papel}, eu quero {story.quero} para {story.para}.
                </td>
                <td>{(story.criterios_de_aceitacao || []).join(' | ')}</td>
                <td>{(story.casos_de_uso_relacionados || []).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function StaticDiagram({ diagram }: { diagram: DiagramModel | null }) {
  if (!diagram || !diagram.nodes.length) {
    return <p className="print-report__text">Diagrama indisponivel.</p>;
  }

  const boxes = buildNodeBoxes(diagram);
  const useCaseBoxes = boxes.filter((box) => box.isUseCase);
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  const padding = 36;
  const offsetX = padding - minX;
  const offsetY = padding - minY;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const boxById = new Map(boxes.map((box) => [box.id, shiftBox(box, offsetX, offsetY)]));
  const systemBounds = getSystemBounds(useCaseBoxes.map((box) => shiftBox(box, offsetX, offsetY)));

  return (
    <svg
      className="print-report__diagram"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
    >
      <defs>
        <marker
          id="report-diagram-arrow"
          markerHeight="8"
          markerWidth="8"
          orient="auto"
          refX="8"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" />
        </marker>
      </defs>

      {systemBounds ? (
        <>
          <rect
            className="print-report__system-box"
            x={systemBounds.x}
            y={systemBounds.y}
            width={systemBounds.width}
            height={systemBounds.height}
          />
          <text
            className="print-report__system-label"
            x={systemBounds.x + 16}
            y={systemBounds.y + 24}
          >
            {diagram.systemName || 'Sistema'}
          </text>
        </>
      ) : null}

      {diagram.edges.map((edge) => {
        const source = boxById.get(String(edge.source));
        const target = boxById.get(String(edge.target));
        if (!source || !target) return null;
        const relationType = getRelationType(edge);
        const path = edgePath(source, target);
        const labelPoint = getLabelPoint(source, target);

        return (
          <g key={String(edge.id)}>
            <path
              className={
                relationType === 'association'
                  ? 'print-report__edge print-report__edge--association'
                  : 'print-report__edge print-report__edge--relation'
              }
              d={path}
              markerEnd={relationType === 'association' ? undefined : 'url(#report-diagram-arrow)'}
            />
            {relationType === 'association' ? null : (
              <text
                className="print-report__edge-label"
                x={labelPoint.x}
                y={labelPoint.y - 6}
                textAnchor="middle"
              >
                {`<<${relationType}>>`}
              </text>
            )}
          </g>
        );
      })}

      {[...boxById.values()].map((box) => (
        <g key={box.id}>
          {box.isUseCase ? (
            <ellipse
              className="print-report__node print-report__node--usecase"
              cx={box.x + box.width / 2}
              cy={box.y + box.height / 2}
              rx={box.width / 2}
              ry={box.height / 2}
            />
          ) : (
            <rect
              className="print-report__node print-report__node--actor"
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx="8"
            />
          )}
          <text
            className="print-report__node-label"
            x={box.x + box.width / 2}
            y={box.y + box.height / 2 - (wrapText(box.label).length - 1) * 8}
            textAnchor="middle"
          >
            {wrapText(box.label).map((line, index) => (
              <tspan x={box.x + box.width / 2} dy={index === 0 ? 0 : 16} key={line}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}
    </svg>
  );
}

function buildNodeBoxes(diagram: DiagramModel): NodeBox[] {
  return diagram.nodes.map((node) => {
    const isUseCase = String(node.id).startsWith('UC');
    return {
      id: String(node.id),
      label: String((node.data as { label?: unknown } | undefined)?.label || node.id),
      x: node.position.x,
      y: node.position.y,
      width: isUseCase ? USE_CASE_WIDTH : ACTOR_WIDTH,
      height: isUseCase ? USE_CASE_HEIGHT : ACTOR_HEIGHT,
      isUseCase,
    };
  });
}

function shiftBox(box: NodeBox, offsetX: number, offsetY: number): NodeBox {
  return {
    ...box,
    x: box.x + offsetX,
    y: box.y + offsetY,
  };
}

function getSystemBounds(boxes: NodeBox[]) {
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return {
    x: minX - 24,
    y: minY - 36,
    width: maxX - minX + 48,
    height: maxY - minY + 60,
  };
}

function edgePath(source: NodeBox, target: NodeBox) {
  const sourceCenter = center(source);
  const targetCenter = center(target);

  if (Math.abs(sourceCenter.x - targetCenter.x) < 40) {
    const sourceAbove = sourceCenter.y < targetCenter.y;
    const start = {
      x: sourceCenter.x,
      y: sourceAbove ? source.y + source.height : source.y,
    };
    const end = {
      x: targetCenter.x,
      y: sourceAbove ? target.y : target.y + target.height,
    };
    const controlY = (start.y + end.y) / 2;
    return `M ${start.x} ${start.y} C ${start.x} ${controlY}, ${end.x} ${controlY}, ${end.x} ${end.y}`;
  }

  const sourceOnLeft = sourceCenter.x < targetCenter.x;
  const start = {
    x: sourceOnLeft ? source.x + source.width : source.x,
    y: sourceCenter.y,
  };
  const end = {
    x: sourceOnLeft ? target.x : target.x + target.width,
    y: targetCenter.y,
  };
  const curve = Math.max(60, Math.abs(end.x - start.x) * 0.42);
  const direction = sourceOnLeft ? 1 : -1;
  return `M ${start.x} ${start.y} C ${start.x + curve * direction} ${start.y}, ${end.x - curve * direction} ${end.y}, ${end.x} ${end.y}`;
}

function getLabelPoint(source: NodeBox, target: NodeBox) {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  return {
    x: (sourceCenter.x + targetCenter.x) / 2,
    y: (sourceCenter.y + targetCenter.y) / 2,
  };
}

function center(box: NodeBox) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function getRelationType(edge: DiagramModel['edges'][number]) {
  const dataType = String(
    (edge.data as { relationType?: unknown } | undefined)?.relationType || '',
  );
  if (dataType === 'include' || dataType === 'extend') return dataType;
  const label = String(edge.label || '').toLowerCase();
  if (label.includes('extend')) return 'extend';
  if (label.includes('include')) return 'include';
  return 'association';
}

function wrapText(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 24 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function formatUseCaseRelations(useCase: UseCase) {
  const relations = useCase.relacoes || [];
  if (!relations.length) return '-';
  return relations
    .map((relation) => {
      const condition = relation.condicao ? ` (${relation.condicao})` : '';
      return `${relation.tipo} ${relation.destino}${condition}`;
    })
    .join('; ');
}
