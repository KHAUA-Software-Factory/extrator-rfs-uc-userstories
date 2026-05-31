import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';
import Navbar from 'react-bootstrap/Navbar';
import Stack from 'react-bootstrap/Stack';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Offcanvas from 'react-bootstrap/Offcanvas';
import Nav from 'react-bootstrap/Nav';
import Card from 'react-bootstrap/Card';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Badge from 'react-bootstrap/Badge';
import Collapse from 'react-bootstrap/Collapse';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';

import { auth, googleProvider } from './firebase';
import {
  extractRequirements,
  generateUseCases,
  generateUserStories,
  type FunctionalRequirement,
  type UseCase,
  type UserStory,
} from './api';
import {
  buildSessionTitleFromDescription,
  createSession,
  deleteSession,
  loadSession,
  listAllSessionsAsAdmin,
  listMySessions,
  loadMySession,
  updateSession,
  type SessionListItem,
  type SessionLoaded,
} from './sessions';
import {
  listAccessUsers,
  removeAccessUser,
  watchMyAccessUser,
  saveAccessUser,
} from './features/access/api/accessRepo';
import { type RequirementLanguage } from './features/analysis/model/language';
import { logError, logEvent } from './lib/logger';
import type { AccessRole, AccessUser } from './features/access/model/types';
import {
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  BaseEdge,
  Background,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type NodeChange,
  type NodeProps,
} from 'reactflow';
import {
  diagramModelToPlantuml,
  buildDiagramModelFromUseCases,
  plantumlToDiagramModel,
  relayoutDiagramModel,
  relayoutDiagramModelWithGraphviz,
  type DiagramModel,
} from './plantumlBridge';
import {
  getRecommendedPhase,
  useAnalysisWizard,
  type PhaseId,
} from './features/analysis/model/useAnalysisWizard';
import { RequirementsStep } from './features/analysis/requirements/ui/RequirementsStep';
import { UseCasesStep } from './features/analysis/useCases/ui/UseCasesStep';
import { UserStoriesStep } from './features/analysis/userStories/ui/UserStoriesStep';
import { AnalysisReport } from './features/analysis/report/ui/AnalysisReport';
import { exportAnalysisPdf } from './features/analysis/report/model/exportAnalysisPdf';
import {
  getUseCaseDiagramPdfPageSize,
  renderUseCaseDiagramImage,
  type DiagramPdfPageSize,
} from './features/analysis/report/model/useCaseDiagramRenderer';
import type { AiProjectScope } from './features/analysis/prompts';
import 'reactflow/dist/style.css';

type NewEdgeKind = 'association' | 'include' | 'extend';
type DiagramViewMode = 'preview' | 'edit';

/** Malha do canvas alinhada ao `snapToGrid` do React Flow (px). */
const DIAGRAM_SNAP_GRID: [number, number] = [16, 16];
const INCLUDE_EDGE_COLOR = '#dc2626';
const EXTEND_EDGE_COLOR = '#0f766e';

/** Dimensões dos nós usadas para alinhar o canvas editável com a versão do PDF. */
const EDITOR_USE_CASE_WIDTH = 248;
const EDITOR_USE_CASE_HEIGHT = 66;
const EDITOR_ACTOR_WIDTH = 132;
const EDITOR_ACTOR_HEIGHT = 112;
const EDITOR_SYSTEM_PADDING_X = 28;
const EDITOR_SYSTEM_PADDING_TOP = 44;
const EDITOR_SYSTEM_PADDING_BOTTOM = 24;
const EDITOR_SYSTEM_NODE_ID = '__system_box__';

type ProcessingState = {
  title: string;
  detail: string;
  step: number;
  total: number;
};

type AutosaveSession = Pick<SessionLoaded, 'uid' | 'id' | 'statusText'>;

const AUTH_STARTUP_FALLBACK_MS = 2500;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  requirements_generated: 'Requisitos gerados',
  requirements_validated: 'Requisitos validados',
  use_cases_generated: 'Casos de uso gerados',
  use_cases_validated: 'Casos de uso validados',
  uml_generated: 'Diagrama gerado',
  uml_validated: 'Diagrama validado',
  user_stories_generated: 'User stories geradas',
  extraction_finished: 'Extração finalizada',
};

function getStatusLabel(statusText: string | undefined) {
  const status = String(statusText || 'draft');
  return STATUS_LABELS[status] || status;
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|load failed|network error|NetworkError/i.test(message)) {
    return 'Falha de rede ao chamar a OpenAI. Verifique conexão, CORS, endpoint e a chave da API.';
  }
  return message;
}

function getSessionKey(session: Pick<SessionLoaded, 'uid' | 'id'> | null) {
  return session ? `${session.uid}:${session.id}` : '';
}

function getAiProjectScope(session: SessionLoaded): AiProjectScope {
  return {
    projectId: session.id,
    projectTitle: session.title,
    ownerUid: session.uid,
  };
}

function readDiagramFromSession(session: SessionLoaded): DiagramModel | null {
  let base: DiagramModel | null = null;

  if (session.diagramModelText) {
    try {
      base = JSON.parse(session.diagramModelText) as DiagramModel;
    } catch {
      // Fallback to PlantUML below.
    }
  }

  if (!base && session.plantumlText.trim()) {
    try {
      base = plantumlToDiagramModel(session.plantumlText);
    } catch {
      return null;
    }
  }

  if (!base) return null;

  // Reaplica apenas as curvas/estilos canônicos. O relayout só entra quando o
  // modelo salvo não possui posições úteis, para não apagar ajustes manuais.
  return normalizeDiagramForDisplay(
    hasUsableNodePositions(base) ? base : relayoutDiagramModel(base),
  );
}

async function prepareDiagramForEditor(session: SessionLoaded): Promise<DiagramModel | null> {
  const base = readDiagramFromSession(session);
  if (!base) return null;
  return normalizeDiagramForDisplay(await relayoutDiagramModelWithGraphviz(base));
}

function relationEdgePatch(relationType: 'include' | 'extend'): Partial<Edge> {
  const edgeColor = relationType === 'include' ? INCLUDE_EDGE_COLOR : EXTEND_EDGE_COLOR;
  return {
    type: 'smoothCurve',
    label: `<<${relationType}>>`,
    data: { relationType },
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 20, height: 20 },
    style: {
      stroke: edgeColor,
      strokeWidth: 2.6,
      strokeDasharray: '6 5',
      opacity: 0.98,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  };
}

function getDiagramRelationType(edge: Edge): 'association' | 'include' | 'extend' {
  const dataType = String(
    (edge.data as { relationType?: unknown } | undefined)?.relationType || '',
  );
  if (dataType === 'include' || dataType === 'extend') return dataType;
  const label = String(edge.label || '').toLowerCase();
  if (label.includes('extend')) return 'extend';
  if (label.includes('include')) return 'include';
  return 'association';
}

function hasUsableNodePositions(model: DiagramModel): boolean {
  return model.nodes.some((node) => {
    const x = Number(node.position?.x);
    const y = Number(node.position?.y);
    return (Number.isFinite(x) && x !== 0) || (Number.isFinite(y) && y !== 0);
  });
}

function isUseCaseNodeId(id: string): boolean {
  return id.startsWith('UC');
}

function normalizeDiagramEdgeEndpoint(edge: Edge): Edge {
  const relationType = getDiagramRelationType(edge);
  if (relationType !== 'association') return edge;

  const source = String(edge.source);
  const target = String(edge.target);
  const sourceIsUseCase = isUseCaseNodeId(source);
  const targetIsUseCase = isUseCaseNodeId(target);
  if (sourceIsUseCase === targetIsUseCase) return edge;

  return {
    ...edge,
    source: sourceIsUseCase ? target : source,
    target: sourceIsUseCase ? source : target,
  };
}

/**
 * Atribui um índice de "faixa" (lane) a cada aresta dentro do grupo de arestas
 * que compartilham o mesmo nó de origem. Edges paralelas (mesma origem)
 * recebem lanes distintas e contíguas, de modo que a curva de cada aresta
 * possa ser deslocada lateralmente em uma quantidade DETERMINÍSTICA e
 * DISTINTA — eliminando sobreposições por construção.
 */
function computeEdgeLanes(edges: Edge[]): Map<string, { index: number; count: number }> {
  const groups = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = String(edge.source);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(edge);
  }
  const result = new Map<string, { index: number; count: number }>();
  for (const group of groups.values()) {
    // Ordenação estável por destino para que a numeração seja consistente
    // entre renders e entre o editor e o renderizador estático (PDF).
    group.sort((a, b) => String(a.target).localeCompare(String(b.target)));
    const count = group.length;
    group.forEach((edge, index) => {
      result.set(String(edge.id), { index, count });
    });
  }
  return result;
}

function normalizeDiagramForDisplay(model: DiagramModel): DiagramModel {
  const normalizedEdges = model.edges.map(normalizeDiagramEdgeEndpoint);
  const laneInfo = computeEdgeLanes(normalizedEdges);
  const relationEdgeCount = normalizedEdges.filter(
    (edge) => getDiagramRelationType(edge) !== 'association',
  ).length;
  const relationLabelsVisible = relationEdgeCount > 0;
  const associationSourceCounts = normalizedEdges.reduce((counts, edge) => {
    if (getDiagramRelationType(edge) !== 'association') return counts;
    const key = String(edge.source);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  const displayEdges: Edge[] = normalizedEdges.map((edge): Edge => {
    const relationType = getDiagramRelationType(edge);
    const lane = laneInfo.get(String(edge.id)) || { index: 0, count: 1 };
    const associationCount = associationSourceCounts.get(String(edge.source)) || 1;

    if (relationType !== 'association') {
      return {
        ...edge,
        ...relationEdgePatch(relationType),
        data: {
          ...(edge.data || {}),
          relationType,
          laneIndex: lane.index,
          laneCount: lane.count,
          labelVisible: relationLabelsVisible,
        },
      };
    }

    return {
      ...edge,
      type: 'smoothCurve',
      label: '',
      data: {
        ...(edge.data || {}),
        relationType,
        laneIndex: lane.index,
        laneCount: lane.count,
        bundledAssociation: false,
      },
      markerEnd: undefined,
      style: {
        stroke: associationCount >= 8 ? '#cbd5e1' : '#94a3b8',
        strokeWidth: associationCount >= 8 ? 1.1 : associationCount >= 4 ? 1.25 : 1.55,
        opacity: associationCount >= 8 ? 0.2 : associationCount >= 4 ? 0.36 : 0.58,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      } satisfies CSSProperties,
    };
  });

  return {
    ...model,
    nodes: model.nodes.map((node) => {
      if (String(node.id).startsWith('UC')) {
        return {
          ...node,
          type: 'useCase',
          className: 'diagram-node diagram-node--usecase',
          style: {
            width: EDITOR_USE_CASE_WIDTH,
            height: EDITOR_USE_CASE_HEIGHT,
            border: 0,
            background: 'transparent',
            padding: 0,
          },
        };
      }
      return {
        ...node,
        type: 'actor',
        className: 'diagram-node diagram-node--actor',
        style: {
          width: EDITOR_ACTOR_WIDTH,
          height: EDITOR_ACTOR_HEIGHT,
          border: 0,
          background: 'transparent',
          padding: 0,
        },
      };
    }),
    edges: displayEdges.sort((a, b) =>
      getDiagramRelationType(a).localeCompare(getDiagramRelationType(b)),
    ),
  };
}

function slugFileName(value: string) {
  const clean = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || 'extrator-engenharia-software';
}

function getAccessRoleLabel(role: AccessRole | null) {
  if (role === 'admin') return 'admin';
  if (role === 'user') return 'user';
  return 'sem acesso';
}

function ActorDiagramNode({ data }: NodeProps<{ label?: string }>) {
  const label = String(data?.label || 'Ator');

  return (
    <div className="diagram-actor-node">
      <Handle type="target" position={Position.Left} className="diagram-actor-node__handle" />
      <svg className="diagram-actor-node__figure" viewBox="0 0 72 86" role="img" aria-hidden="true">
        <circle cx="36" cy="14" r="10" />
        <path d="M36 24v26M18 35h36M36 50 20 76M36 50l16 26" />
      </svg>
      <div className="diagram-actor-node__label">{label}</div>
      <Handle type="source" position={Position.Right} className="diagram-actor-node__handle" />
    </div>
  );
}

function UseCaseDiagramNode({ data }: NodeProps<{ label?: string }>) {
  const label = String(data?.label || 'Caso de uso');

  return (
    <div className="diagram-usecase-node">
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="diagram-usecase-node__handle"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="diagram-usecase-node__handle"
      />
      <svg
        className="diagram-usecase-node__shape"
        viewBox="0 0 248 66"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <ellipse cx="124" cy="33" rx="122" ry="31" />
      </svg>
      <span className="diagram-usecase-node__label">{label}</span>
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="diagram-usecase-node__handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="diagram-usecase-node__handle"
      />
    </div>
  );
}

function SystemBackdropNode({
  data,
}: NodeProps<{ label?: string; width?: number; height?: number }>) {
  const label = String(data?.label || 'Sistema');
  const width = Number(data?.width) || 0;
  const height = Number(data?.height) || 0;

  return (
    <div className="diagram-system-backdrop" style={{ width, height }}>
      <span className="diagram-system-backdrop__label">{label}</span>
    </div>
  );
}

const diagramNodeTypes = {
  actor: ActorDiagramNode,
  useCase: UseCaseDiagramNode,
  systemBackdrop: SystemBackdropNode,
};

/**
 * Curva Bezier com sistema de "lanes" (faixas determinísticas).
 *
 * Cada aresta carrega `laneIndex` / `laneCount` (atribuídos em
 * {@link computeEdgeLanes}) — todas as arestas que compartilham a mesma
 * origem recebem índices contíguos `0..N-1`. A partir desses índices
 * calculamos um deslocamento lateral ÚNICO para cada aresta: a aresta 0
 * fica empurrada de um lado, a N-1 do outro, e as intermediárias se
 * distribuem uniformemente entre eles. Assim, arestas paralelas
 * NUNCA se sobrepõem — por construção, e não por sorte de hash.
 *
 * Os pontos de controle saem perpendicularmente às tangentes das handles
 * (Right, Left, Top, Bottom) — padrão do `getBezierPath` do React Flow —
 * mas com offset ENCURTADO para que a curva comece a "abrir" mais cedo,
 * em vez de andar metade do caminho na horizontal antes de virar.
 */
function buildSmoothCurvePath(
  sourceX: number,
  sourceY: number,
  sourcePosition: Position,
  targetX: number,
  targetY: number,
  targetPosition: Position,
  laneIndex: number,
  laneCount: number,
  relationType: 'association' | 'include' | 'extend',
): { path: string; labelX: number; labelY: number } {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) {
    return {
      path: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
      labelX: sourceX,
      labelY: sourceY,
    };
  }

  const sourceTangent = tangentFromPosition(sourcePosition);
  const targetTangent = tangentFromPosition(targetPosition);

  // Offset tangencial CURTO: as curvas começam a abrir cedo, fazendo arestas
  // paralelas divergirem antes de chegarem à metade do caminho.
  const tangentOffset = Math.max(36, Math.min(150, distance * 0.24));

  // Afastamento lateral canônico: até aresta única ganha curvatura visível,
  // e grupos com mesma origem são distribuídos em faixas determinísticas.
  const lateral = getCurveLateralOffset(distance, laneIndex, laneCount, relationType);

  const perpX = -dy / distance;
  const perpY = dx / distance;

  const c1x = sourceX + sourceTangent.x * tangentOffset + perpX * lateral;
  const c1y = sourceY + sourceTangent.y * tangentOffset + perpY * lateral;
  const c2x = targetX + targetTangent.x * tangentOffset + perpX * lateral;
  const c2y = targetY + targetTangent.y * tangentOffset + perpY * lateral;

  return {
    path: `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`,
    labelX: (sourceX + targetX) / 2 + perpX * lateral * 0.7,
    labelY: (sourceY + targetY) / 2 + perpY * lateral * 0.7,
  };
}

function buildBundledAssociationPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): { path: string; labelX: number; labelY: number } {
  const dx = targetX - sourceX;
  const direction = dx >= 0 ? 1 : -1;
  const distance = Math.max(1, Math.abs(dx));
  const trunkX = sourceX + direction * Math.max(72, Math.min(150, distance * 0.28));
  const turn = Math.max(30, Math.min(82, distance * 0.18));
  const midY = (sourceY + targetY) / 2;

  return {
    path: [
      `M ${sourceX} ${sourceY}`,
      `C ${sourceX + direction * turn} ${sourceY}, ${trunkX - direction * turn * 0.35} ${sourceY}, ${trunkX} ${sourceY}`,
      `C ${trunkX} ${midY}, ${trunkX} ${midY}, ${trunkX} ${targetY}`,
      `C ${trunkX + direction * turn * 0.35} ${targetY}, ${targetX - direction * turn} ${targetY}, ${targetX} ${targetY}`,
    ].join(' '),
    labelX: trunkX,
    labelY: midY,
  };
}

function getCurveLateralOffset(
  distance: number,
  laneIndex: number,
  laneCount: number,
  relationType: 'association' | 'include' | 'extend',
) {
  const spread = Math.max(44, Math.min(150, distance * 0.24));
  const base =
    relationType === 'association'
      ? Math.max(28, Math.min(76, distance * 0.1))
      : Math.max(42, Math.min(104, distance * 0.14));

  if (laneCount <= 1) return base;

  const center = (laneCount - 1) / 2;
  const raw = laneIndex - center;
  if (Math.abs(raw) < 0.001) return base;
  return raw * (spread / Math.max(1, center));
}

function tangentFromPosition(position: Position): { x: number; y: number } {
  switch (position) {
    case Position.Left:
      return { x: -1, y: 0 };
    case Position.Right:
      return { x: 1, y: 0 };
    case Position.Top:
      return { x: 0, y: -1 };
    case Position.Bottom:
      return { x: 0, y: 1 };
    default:
      return { x: 1, y: 0 };
  }
}

type SmoothCurveEdgeData = {
  relationType?: 'association' | 'include' | 'extend';
  laneIndex?: number;
  laneCount?: number;
  bundledAssociation?: boolean;
  labelVisible?: boolean;
};

function SmoothCurveEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  label,
  style,
  markerEnd,
  selected,
}: EdgeProps<SmoothCurveEdgeData>) {
  const laneIndex = typeof data?.laneIndex === 'number' ? data.laneIndex : 0;
  const laneCount = typeof data?.laneCount === 'number' && data.laneCount > 0 ? data.laneCount : 1;
  const relationType = data?.relationType || 'association';
  const { path, labelX, labelY } =
    relationType === 'association' && data?.bundledAssociation
      ? buildBundledAssociationPath(sourceX, sourceY, targetX, targetY)
      : buildSmoothCurvePath(
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          laneIndex,
          laneCount,
          relationType,
        );
  const labelText =
    relationType === 'association' || data?.labelVisible === false
      ? ''
      : label
        ? String(label)
        : '';
  const selectedStyle: CSSProperties = selected
    ? { filter: 'drop-shadow(0 0 4px rgba(37, 99, 235, 0.35))' }
    : {};

  return (
    <>
      {relationType !== 'association' ? (
        <path
          d={path}
          fill="none"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.92}
          strokeWidth={7}
          pointerEvents="none"
        />
      ) : null}
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, ...selectedStyle }} />
      {labelText ? (
        <EdgeLabelRenderer>
          <div
            className={`diagram-edge-label diagram-edge-label--${relationType}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const diagramEdgeTypes = {
  smoothCurve: SmoothCurveEdge,
};

const minimapNodeColor = (node: { id?: unknown }) => {
  const id = String(node.id || '');
  if (id === EDITOR_SYSTEM_NODE_ID) return '#e2e8f0';
  return id.startsWith('UC') ? '#2563eb' : '#64748b';
};

function buildEditorNodes(diagram: DiagramModel | null) {
  if (!diagram) return [];
  const ucNodes = diagram.nodes.filter((node) => String(node.id).startsWith('UC'));
  if (!ucNodes.length) return diagram.nodes;

  const minX = Math.min(...ucNodes.map((node) => node.position.x));
  const minY = Math.min(...ucNodes.map((node) => node.position.y));
  const maxX = Math.max(...ucNodes.map((node) => node.position.x + EDITOR_USE_CASE_WIDTH));
  const maxY = Math.max(...ucNodes.map((node) => node.position.y + EDITOR_USE_CASE_HEIGHT));
  const width = maxX - minX + EDITOR_SYSTEM_PADDING_X * 2;
  const height = maxY - minY + EDITOR_SYSTEM_PADDING_TOP + EDITOR_SYSTEM_PADDING_BOTTOM;

  const backdrop = {
    id: EDITOR_SYSTEM_NODE_ID,
    type: 'systemBackdrop',
    position: { x: minX - EDITOR_SYSTEM_PADDING_X, y: minY - EDITOR_SYSTEM_PADDING_TOP },
    data: { label: diagram.systemName || 'Sistema', width, height },
    draggable: false,
    selectable: false,
    deletable: false,
    focusable: false,
    className: 'diagram-node diagram-node--system',
    style: { width, height, zIndex: -1 },
    zIndex: -1,
  } as DiagramModel['nodes'][number];

  return [backdrop, ...diagram.nodes];
}

function DiagramFitView({ revision }: { revision: number }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      fitView({ padding: 0.12, duration: 240, minZoom: 0.52, maxZoom: 1 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [revision, fitView]);

  return null;
}

function ProcessingStatus({ processing }: { processing: ProcessingState | null }) {
  if (!processing) return null;

  const progress = Math.min(100, Math.max(8, (processing.step / processing.total) * 100));

  return (
    <div className="processing-status" role="status" aria-live="polite">
      <Spinner animation="border" size="sm" className="processing-status__spinner" />
      <div className="processing-status__content">
        <div className="processing-status__topline">
          <strong>{processing.title}</strong>
          <span>
            Passo {processing.step} de {processing.total}
          </span>
        </div>
        <div className="processing-status__detail">{processing.detail}</div>
        <div className="processing-status__track" aria-hidden="true">
          <div className="processing-status__bar" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessRole, setAccessRole] = useState<AccessRole | null>(null);
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessRoleDraft, setAccessRoleDraft] = useState<AccessRole>('user');
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeSession, setActiveSession] = useState<SessionLoaded | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'sessions' | 'users' | 'workspace'>(
    'dashboard',
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [phase, setPhase] = useState<PhaseId>(1);
  const [descriptionText, setDescriptionText] = useState('');
  const [requirements, setRequirements] = useState<FunctionalRequirement[]>([]);
  const [requirementsLanguage, setRequirementsLanguage] = useState<RequirementLanguage>('pt-BR');
  const [extracting, setExtracting] = useState(false);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [generatingUseCases, setGeneratingUseCases] = useState(false);
  const [plantuml, setPlantuml] = useState('');
  const [diagram, setDiagram] = useState<DiagramModel | null>(null);
  const [generatingUml, setGeneratingUml] = useState(false);
  const [savingDiagram, setSavingDiagram] = useState(false);
  const [diagramViewMode, setDiagramViewMode] = useState<DiagramViewMode>('edit');
  const [newEdgeKind, setNewEdgeKind] = useState<NewEdgeKind>('association');
  const [diagramMiniMap, setDiagramMiniMap] = useState(true);
  const [diagramSnapToGrid, setDiagramSnapToGrid] = useState(true);
  const [relationsPanelOpen, setRelationsPanelOpen] = useState(false);
  const [diagramLayoutRevision, setDiagramLayoutRevision] = useState(0);
  const [diagramPreviewUrl, setDiagramPreviewUrl] = useState('');
  const [diagramPreviewLoading, setDiagramPreviewLoading] = useState(false);
  const [diagramPreviewPage, setDiagramPreviewPage] = useState<DiagramPdfPageSize | null>(null);
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [generatingStories, setGeneratingStories] = useState(false);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const wizard = useAnalysisWizard(activeSession?.statusText);

  const activeSessionRef = useRef(activeSession);
  const diagramAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    return () => {
      if (diagramAutosaveTimerRef.current) {
        window.clearTimeout(diagramAutosaveTimerRef.current);
      }
    };
  }, []);

  const clearDiagramAutosaveTimer = useCallback(() => {
    if (diagramAutosaveTimerRef.current) {
      window.clearTimeout(diagramAutosaveTimerRef.current);
      diagramAutosaveTimerRef.current = null;
    }
  }, []);

  const flushDiagramAutosave = useCallback(
    async (s: AutosaveSession, model: DiagramModel, puml: string) => {
      if (!s || !model.nodes.length || !puml.trim()) return;
      try {
        await updateSession(s.uid, s.id, {
          plantumlText: puml,
          diagramModelText: JSON.stringify(model),
          statusText: s.statusText,
        });
        setActiveSession((prev) =>
          prev && prev.id === s.id && prev.uid === s.uid
            ? { ...prev, plantumlText: puml, diagramModelText: JSON.stringify(model) }
            : prev,
        );
      } catch (e) {
        setError(getErrorMessage(e));
      }
    },
    [],
  );

  const scheduleDiagramAutosave = useCallback(
    (model: DiagramModel, puml: string) => {
      const session = activeSessionRef.current;
      if (!session) return;
      const autosaveSession = {
        uid: session.uid,
        id: session.id,
        statusText: session.statusText,
      };
      if (diagramAutosaveTimerRef.current) {
        window.clearTimeout(diagramAutosaveTimerRef.current);
      }
      diagramAutosaveTimerRef.current = window.setTimeout(() => {
        diagramAutosaveTimerRef.current = null;
        void flushDiagramAutosave(autosaveSession, model, puml);
      }, 850);
    },
    [flushDiagramAutosave],
  );

  useEffect(() => {
    let cancelled = false;

    setDiagramPreviewUrl('');
    setDiagramPreviewPage(null);
    if (!diagram) {
      setDiagramPreviewLoading(false);
      return () => {};
    }

    setDiagramPreviewLoading(true);
    renderUseCaseDiagramImage(diagram, {
      maxCanvasPixels: 14_000_000,
      maxCanvasSide: 4096,
    })
      .then((rendered) => {
        if (cancelled) return;
        setDiagramPreviewUrl(rendered.dataUrl);
        setDiagramPreviewPage(getUseCaseDiagramPdfPageSize(rendered.width, rendered.height));
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setDiagramPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [diagram]);

  const diagramPreviewPageStyle = useMemo(
    () =>
      diagramPreviewPage
        ? ({
            '--diagram-pdf-page-ratio': `${diagramPreviewPage.width} / ${diagramPreviewPage.height}`,
          } as CSSProperties)
        : undefined,
    [diagramPreviewPage],
  );

  const isCurrentSession = useCallback(
    (session: SessionLoaded) => getSessionKey(activeSessionRef.current) === getSessionKey(session),
    [],
  );

  useEffect(() => {
    let authStateResolved = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!authStateResolved) setLoading(false);
    }, AUTH_STARTUP_FALLBACK_MS);

    const unsubscribe = onAuthStateChanged(
      auth,
      (u) => {
        authStateResolved = true;
        window.clearTimeout(fallbackTimer);
        logEvent({
          event: 'auth.state.changed',
          persist: true,
          details: { signedIn: Boolean(u), uid: u?.uid || '', email: u?.email || '' },
        });
        setUser(u);
        setLoading(false);
        if (u) {
          // Always land on the dashboard after login (no auto-open workspace).
          setActiveView('dashboard');
          setSidebarOpen(false);
          setPhase(1);
          setActiveSession(null);
          setDescriptionText('');
          setRequirements([]);
          setRequirementsLanguage('pt-BR');
          setUseCases([]);
          setPlantuml('');
          setDiagram(null);
          setUserStories([]);
          setError('');
        } else {
          setAccessRole(null);
          setIsAdmin(false);
          setSessions([]);
          setAccessUsers([]);
          setActiveSession(null);
          setRequirementsLanguage('pt-BR');
        }
      },
      (authError) => {
        authStateResolved = true;
        window.clearTimeout(fallbackTimer);
        logError('auth.state.failed', authError);
        setError(`Falha ao inicializar o login: ${authError.message}`);
        setLoading(false);
      },
    );

    return () => {
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const unsubscribe = watchMyAccessUser(
      (accessUser) => {
        if (cancelled) return;

        setAccessRole(accessUser?.role || null);
        setIsAdmin(accessUser?.role === 'admin');

        if (!accessUser) {
          logEvent({
            event: 'access.revoked',
            level: 'warn',
            persist: true,
            details: { email: user?.email || '', uid: user?.uid || '' },
          });
          clearDiagramAutosaveTimer();
          setSessions([]);
          setAccessUsers([]);
          setActiveSession(null);
          setActiveView('dashboard');
          setPhase(1);
          setError('Seu acesso foi removido. Entre novamente.');
          void signOut(auth);
        }
      },
      (accessError) => {
        if (!cancelled) setError(getErrorMessage(accessError));
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, clearDiagramAutosaveTimer]);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setIsAdmin(false);
      setAccessRole(null);
      setAccessUsers([]);
      setActiveSession(null);
      setActiveView('dashboard');
      setPhase(1);
      return;
    }
    if (!accessRole) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    setSessionsLoading(true);
    (async () => {
      try {
        const items =
          accessRole === 'admin' ? await listAllSessionsAsAdmin() : await listMySessions();
        if (!cancelled) setSessions(items);
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e));
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, accessRole]);

  // Guard: never show Workspace unless a session is selected.
  useEffect(() => {
    if (activeView === 'workspace' && !activeSession) {
      setActiveView('dashboard');
      setPhase(1);
    }
    if (activeView === 'users' && !isAdmin) {
      setActiveView('dashboard');
    }
  }, [activeView, activeSession, isAdmin]);

  useEffect(() => {
    if (activeView !== 'users' || !isAdmin) return;
    let cancelled = false;
    setAccessLoading(true);
    (async () => {
      try {
        const items = await listAccessUsers();
        if (!cancelled) setAccessUsers(items);
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e));
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeView, isAdmin]);

  // UX: user explicitly starts a new analysis (no auto-session on login).

  const displayName = useMemo(() => user?.displayName || user?.email || user?.uid || '', [user]);

  function showProcessing(title: string, detail: string, step: number, total: number) {
    setProcessing({ title, detail, step, total });
  }

  async function refreshSessionsList() {
    if (!accessRole) return;
    const items = accessRole === 'admin' ? await listAllSessionsAsAdmin() : await listMySessions();
    setSessions(items);
  }

  function parseSavedArray<T>(value: string): T[] {
    if (!value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  const editorNodes = useMemo(() => buildEditorNodes(diagram), [diagram]);

  const relationRows = useMemo(() => {
    if (!diagram) return [];
    const nodeNameById = new Map(
      diagram.nodes.map((node) => [
        String(node.id),
        String((node.data as { label?: string })?.label || node.id),
      ]),
    );

    return diagram.edges
      .filter((edge) => getDiagramRelationType(edge) !== 'association')
      .map((edge) => ({
        id: String(edge.id),
        source: nodeNameById.get(String(edge.source)) || String(edge.source),
        target: nodeNameById.get(String(edge.target)) || String(edge.target),
        type: getDiagramRelationType(edge) === 'extend' ? 'extend' : 'include',
      }));
  }, [diagram]);

  async function handleLogin() {
    setError('');
    showProcessing('Autenticando usuário', 'Abrindo o login do Google.', 1, 1);
    logEvent({ event: 'auth.login.started', persist: true });
    try {
      await signInWithPopup(auth, googleProvider);
      logEvent({ event: 'auth.login.succeeded', persist: true });
    } catch (e) {
      logError('auth.login.failed', e);
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleLogout() {
    clearDiagramAutosaveTimer();
    setError('');
    showProcessing('Encerrando sessão', 'Saindo da conta atual.', 1, 1);
    logEvent({ event: 'auth.logout.started', persist: true });
    try {
      await signOut(auth);
      logEvent({ event: 'auth.logout.succeeded', persist: true });
    } catch (e) {
      logError('auth.logout.failed', e);
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function refreshAccessUsers() {
    if (!isAdmin) return;
    setAccessLoading(true);
    try {
      const items = await listAccessUsers();
      setAccessUsers(items);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleSaveAccessUser() {
    setError('');
    showProcessing('Salvando acesso', 'Atualizando nível do Gmail informado.', 1, 2);
    logEvent({
      event: 'ui.access.save.requested',
      details: { email: accessEmail, role: accessRoleDraft },
    });
    try {
      await saveAccessUser(accessEmail, accessRoleDraft);
      setAccessEmail('');
      setAccessRoleDraft('user');
      showProcessing('Salvando acesso', 'Recarregando usuários cadastrados.', 2, 2);
      await refreshAccessUsers();
    } catch (e) {
      logError('ui.access.save.failed', e, { email: accessEmail, role: accessRoleDraft });
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleChangeAccessUserRole(email: string, role: AccessRole) {
    setError('');
    showProcessing('Editando acesso', 'Atualizando nível do Gmail selecionado.', 1, 2);
    logEvent({ event: 'ui.access.role_change.requested', details: { email, role } });
    try {
      await saveAccessUser(email, role);
      showProcessing('Editando acesso', 'Recarregando usuários cadastrados.', 2, 2);
      await refreshAccessUsers();
    } catch (e) {
      logError('ui.access.role_change.failed', e, { email, role });
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleRemoveAccessUser(email: string) {
    setError('');
    showProcessing('Removendo acesso', 'Excluindo Gmail da gestão de usuários.', 1, 2);
    logEvent({ event: 'ui.access.remove.requested', details: { email } });
    try {
      await removeAccessUser(email);
      showProcessing('Removendo acesso', 'Recarregando usuários cadastrados.', 2, 2);
      await refreshAccessUsers();
    } catch (e) {
      logError('ui.access.remove.failed', e, { email });
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleNewAnalysis() {
    clearDiagramAutosaveTimer();
    setError('');
    showProcessing('Criando análise', 'Abrindo uma nova sessão no banco de dados.', 1, 3);
    try {
      const created = await createSession();
      showProcessing('Criando análise', 'Carregando o workspace da nova sessão.', 2, 3);
      const loaded = await loadMySession(created.id);
      setActiveSession(loaded);
      setActiveView('workspace');
      setSidebarOpen(false);
      setPhase(1);
      setDescriptionText(loaded.descriptionText || '');
      setRequirementsLanguage((loaded.requirementsLanguage as RequirementLanguage) || 'pt-BR');
      setRequirements([]);
      setUseCases([]);
      setPlantuml('');
      setDiagram(null);
      setUserStories([]);
      showProcessing('Criando análise', 'Atualizando a lista de análises.', 3, 3);
      await refreshSessionsList();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleSelectSession(item: SessionListItem) {
    clearDiagramAutosaveTimer();
    setError('');
    showProcessing('Abrindo análise', 'Carregando dados salvos da sessão.', 1, 3);
    try {
      const loaded =
        isAdmin && item.uid !== user?.uid
          ? await loadSession(item.uid, item.id)
          : await loadMySession(item.id);
      showProcessing('Abrindo análise', 'Restaurando requisitos e casos de uso.', 2, 3);
      const loadedDiagram = await prepareDiagramForEditor(loaded);
      const loadedPlantuml = loadedDiagram
        ? diagramModelToPlantuml(loadedDiagram)
        : loaded.plantumlText || '';

      showProcessing('Abrindo análise', 'Organizando o diagrama editável.', 3, 3);
      setActiveSession({
        ...loaded,
        plantumlText: loadedPlantuml,
        diagramModelText: loadedDiagram ? JSON.stringify(loadedDiagram) : loaded.diagramModelText,
      });
      setActiveView('workspace');
      setSidebarOpen(false);
      setDescriptionText(loaded.descriptionText || '');
      setRequirementsLanguage((loaded.requirementsLanguage as RequirementLanguage) || 'pt-BR');
      setRequirements(loaded.requirementsText ? JSON.parse(loaded.requirementsText) : []);
      setUseCases(loaded.useCasesText ? JSON.parse(loaded.useCasesText).map(normalizeUseCase) : []);
      setPlantuml(loadedPlantuml);
      setDiagram(loadedDiagram);
      if (loadedDiagram) {
        setDiagramViewMode('edit');
        setDiagramLayoutRevision((value) => value + 1);
      }
      setUserStories(loaded.userStoriesText ? JSON.parse(loaded.userStoriesText) : []);
      setPhase(getRecommendedPhase(loaded.statusText));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleSaveDescription() {
    const session = activeSession;
    if (!session) return;
    const nextTitle = buildSessionTitleFromDescription(descriptionText);
    setError('');
    showProcessing('Salvando descrição', 'Registrando o texto inicial da análise.', 1, 1);
    try {
      await updateSession(session.uid, session.id, { title: nextTitle, descriptionText });
      if (!isCurrentSession(session)) return;
      setActiveSession({ ...session, title: nextTitle, descriptionText });
      await refreshSessionsList();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  function nextRequirementId(items: FunctionalRequirement[]) {
    const max = items.reduce((currentMax, requirement) => {
      const match = String(requirement.id || '').match(/^RF(\d+)$/i);
      return match ? Math.max(currentMax, Number(match[1])) : currentMax;
    }, 0);
    return `RF${String(max + 1).padStart(3, '0')}`;
  }

  function createBlankRequirement(items: FunctionalRequirement[]): FunctionalRequirement {
    return {
      id: nextRequirementId(items),
      descricao: '',
      ator: 'Usuario',
      acao: '',
      objeto: '',
      prioridade: 'Media',
      origem: 'manual',
    };
  }

  function handleChangeRequirements(next: FunctionalRequirement[]) {
    setRequirements(next);
    if (!activeSession) return;

    const requirementsText = JSON.stringify(next);
    setUseCases([]);
    setPlantuml('');
    setDiagram(null);
    setUserStories([]);
    setActiveSession({
      ...activeSession,
      requirementsText,
      useCasesText: '',
      plantumlText: '',
      diagramModelText: '',
      userStoriesText: '',
      statusText: 'requirements_generated',
    });
  }

  function handleAddRequirement() {
    handleChangeRequirements([...requirements, createBlankRequirement(requirements)]);
  }

  function handleRemoveRequirement(index: number) {
    handleChangeRequirements(requirements.filter((_, idx) => idx !== index));
  }

  function normalizeUseCase(value: UseCase): UseCase {
    return {
      ...value,
      relacoes: Array.isArray(value.relacoes)
        ? value.relacoes.map((relacao) => ({
            tipo: relacao.tipo === 'extend' ? 'extend' : 'include',
            destino: String(relacao.destino || ''),
            condicao: String(relacao.condicao || ''),
          }))
        : [],
    };
  }

  function nextUseCaseId(items: UseCase[]) {
    const max = items.reduce((currentMax, useCase) => {
      const match = String(useCase.id || '').match(/^UC(\d+)$/i);
      return match ? Math.max(currentMax, Number(match[1])) : currentMax;
    }, 0);
    const next = max + 1;
    const width = Math.max(3, String(next).length);
    return `UC${String(next).padStart(width, '0')}`;
  }

  function createBlankUseCase(items: UseCase[]): UseCase {
    return {
      id: nextUseCaseId(items),
      nome: '',
      ator_principal: 'Usuario',
      objetivo: '',
      relacoes: [],
    };
  }

  function handleChangeUseCases(next: UseCase[]) {
    const normalized = next.map(normalizeUseCase);
    setUseCases(normalized);
    if (!activeSession) return;

    const useCasesText = JSON.stringify(normalized);
    setPlantuml('');
    setDiagram(null);
    setUserStories([]);
    setActiveSession({
      ...activeSession,
      useCasesText,
      plantumlText: '',
      diagramModelText: '',
      userStoriesText: '',
      statusText: 'use_cases_generated',
    });
  }

  function handleAddUseCase() {
    handleChangeUseCases([...useCases, createBlankUseCase(useCases)]);
  }

  function handleRemoveUseCase(index: number) {
    const removedId = useCases[index]?.id;
    handleChangeUseCases(
      useCases
        .filter((_, idx) => idx !== index)
        .map((useCase) => ({
          ...useCase,
          relacoes: (useCase.relacoes || []).filter((relacao) => relacao.destino !== removedId),
        })),
    );
  }

  function handleChangeUserStories(next: UserStory[]) {
    setUserStories(next);
    if (!activeSession) return;

    const userStoriesText = JSON.stringify(next);
    setActiveSession({
      ...activeSession,
      userStoriesText,
      statusText: 'user_stories_generated',
    });
  }

  function handleRemoveUserStory(index: number) {
    handleChangeUserStories(userStories.filter((_, idx) => idx !== index));
  }

  function handleChangeRequirementsLanguage(nextLanguage: RequirementLanguage) {
    setRequirementsLanguage(nextLanguage);
    logEvent({
      event: 'ui.requirements.language_changed',
      details: { language: nextLanguage },
    });
    if (activeSession) {
      void updateSession(activeSession.uid, activeSession.id, {
        requirementsLanguage: nextLanguage,
      });
      setActiveSession({ ...activeSession, requirementsLanguage: nextLanguage });
    }
  }

  async function handleExtractRequirements() {
    const session = activeSession;
    if (!session) return;
    const sourceDescription = descriptionText;
    const nextTitle = buildSessionTitleFromDescription(sourceDescription);
    const project = { ...getAiProjectScope(session), projectTitle: nextTitle };
    setError('');
    setExtracting(true);
    showProcessing('Etapa 1: requisitos funcionais', 'Preparando o texto para análise.', 1, 4);
    try {
      // Ensure the user is actually looking at Phase 1 when results arrive.
      setActiveView('workspace');
      setPhase(1);
      showProcessing(
        'Etapa 1: requisitos funcionais',
        'Enviando o texto para extração com IA.',
        2,
        4,
      );
      const result = await extractRequirements({
        text: sourceDescription,
        project,
        language: requirementsLanguage,
      });
      if (!isCurrentSession(session)) return;
      showProcessing('Etapa 1: requisitos funcionais', 'Organizando requisitos retornados.', 3, 4);
      setRequirements(result.requisitos_funcionais);
      setUseCases([]);
      setPlantuml('');
      setDiagram(null);
      setUserStories([]);
      const requirementsText = JSON.stringify(result.requisitos_funcionais);
      showProcessing('Etapa 1: requisitos funcionais', 'Salvando requisitos na sessão.', 4, 4);
      await updateSession(session.uid, session.id, {
        title: nextTitle,
        descriptionText: sourceDescription,
        requirementsLanguage,
        requirementsText,
        useCasesText: '',
        plantumlText: '',
        diagramModelText: '',
        userStoriesText: '',
        statusText: 'requirements_generated',
      });
      if (!isCurrentSession(session)) return;
      setActiveSession({
        ...session,
        title: nextTitle,
        descriptionText: sourceDescription,
        requirementsLanguage,
        requirementsText,
        useCasesText: '',
        plantumlText: '',
        diagramModelText: '',
        userStoriesText: '',
        statusText: 'requirements_generated',
      });
      await refreshSessionsList();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setExtracting(false);
      setProcessing(null);
    }
  }

  async function handleValidateRequirements() {
    const session = activeSession;
    if (!session) return;
    const nextRequirements = requirements;
    setError('');
    showProcessing('Validando requisitos', 'Salvando requisitos revisados.', 1, 2);
    try {
      const requirementsText = JSON.stringify(nextRequirements);
      await updateSession(session.uid, session.id, {
        requirementsText,
        useCasesText: '',
        plantumlText: '',
        diagramModelText: '',
        userStoriesText: '',
        statusText: 'requirements_validated',
      });
      if (!isCurrentSession(session)) return;
      showProcessing('Validando requisitos', 'Liberando a etapa de casos de uso.', 2, 2);
      setUseCases([]);
      setPlantuml('');
      setDiagram(null);
      setUserStories([]);
      setActiveSession({
        ...session,
        requirementsText,
        useCasesText: '',
        plantumlText: '',
        diagramModelText: '',
        userStoriesText: '',
        statusText: 'requirements_validated',
      });
      setPhase(2);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleGenerateUseCases() {
    const session = activeSession;
    if (!session) return;
    const project = getAiProjectScope(session);
    const sourceRequirements = requirements;
    setError('');
    setGeneratingUseCases(true);
    showProcessing('Etapa 2: casos de uso', 'Enviando requisitos validados para a IA.', 1, 4);
    try {
      const result = await generateUseCases({
        requisitos_funcionais: sourceRequirements,
        project,
        language: session.requirementsLanguage as RequirementLanguage,
      });
      if (!isCurrentSession(session)) return;
      showProcessing('Etapa 2: casos de uso', 'Normalizando casos de uso e relações.', 2, 4);
      const normalizedUseCases = result.casos_de_uso.map(normalizeUseCase);
      setUseCases(normalizedUseCases);
      const useCasesText = JSON.stringify(normalizedUseCases);
      showProcessing('Etapa 2: casos de uso', 'Salvando casos de uso gerados.', 3, 4);
      await updateSession(session.uid, session.id, {
        useCasesText,
        statusText: 'use_cases_generated',
      });
      if (!isCurrentSession(session)) return;
      showProcessing('Etapa 2: casos de uso', 'Atualizando a tela de edição.', 4, 4);
      setActiveSession({ ...session, useCasesText, statusText: 'use_cases_generated' });
      setPhase(2);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setGeneratingUseCases(false);
      setProcessing(null);
    }
  }

  async function handleValidateUseCases() {
    const session = activeSession;
    if (!session) return;
    const sourceUseCases = useCases;
    setError('');
    showProcessing('Validando casos de uso', 'Salvando UCs e relações revisadas.', 1, 2);
    try {
      const normalizedUseCases = sourceUseCases.map(normalizeUseCase);
      const useCasesText = JSON.stringify(normalizedUseCases);
      await updateSession(session.uid, session.id, {
        useCasesText,
        statusText: 'use_cases_validated',
      });
      if (!isCurrentSession(session)) return;
      showProcessing('Validando casos de uso', 'Liberando a etapa de diagrama.', 2, 2);
      setUseCases(normalizedUseCases);
      setActiveSession({ ...session, useCasesText, statusText: 'use_cases_validated' });
      setPhase(3);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleGenerateUml() {
    const session = activeSession;
    if (!session) return;
    const sourceUseCases = useCases;
    setError('');
    setGeneratingUml(true);
    showProcessing('Etapa 3: diagrama', 'Montando nós a partir dos casos de uso.', 1, 4);
    try {
      const baseModel = buildDiagramModelFromUseCases(sourceUseCases, session.title || 'Sistema');
      showProcessing('Etapa 3: diagrama', 'Calculando layout legível para o canvas.', 2, 4);
      const model = normalizeDiagramForDisplay(await relayoutDiagramModelWithGraphviz(baseModel));
      const nextPlantuml = diagramModelToPlantuml(model);
      if (!isCurrentSession(session)) return;
      setPlantuml(nextPlantuml);
      setDiagram(model);
      setDiagramViewMode('edit');
      setDiagramLayoutRevision((value) => value + 1);
      const diagramModelText = JSON.stringify(model);
      showProcessing('Etapa 3: diagrama', 'Salvando modelo gráfico e PlantUML.', 3, 4);
      await updateSession(session.uid, session.id, {
        plantumlText: nextPlantuml,
        diagramModelText,
        statusText: 'uml_generated',
      });
      if (!isCurrentSession(session)) return;
      showProcessing('Etapa 3: diagrama', 'Atualizando editor visual.', 4, 4);
      setActiveSession({
        ...session,
        plantumlText: nextPlantuml,
        diagramModelText,
        statusText: 'uml_generated',
      });
      setPhase(3);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setGeneratingUml(false);
      setProcessing(null);
    }
  }

  function syncDiagram(updater: (current: DiagramModel) => DiagramModel) {
    setDiagram((current) => {
      if (!current) return current;
      const next = normalizeDiagramForDisplay(updater(current));
      const nextPuml = diagramModelToPlantuml(next);
      setPlantuml(nextPuml);
      scheduleDiagramAutosave(next, nextPuml);
      return next;
    });
  }

  function updateRelationType(edgeId: string, relationType: 'include' | 'extend') {
    syncDiagram((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        String(edge.id) === edgeId
          ? {
              ...edge,
              ...relationEdgePatch(relationType),
              data: { ...(edge.data || {}), relationType },
            }
          : edge,
      ),
    }));
  }

  function removeDiagramEdge(edgeId: string) {
    syncDiagram((current) => ({
      ...current,
      edges: current.edges.filter((edge) => String(edge.id) !== edgeId),
    }));
  }

  async function persistDiagram(statusText?: string) {
    const session = activeSession;
    if (!session) return false;
    const sourceDiagram = diagram;
    const sourcePlantuml = plantuml;
    clearDiagramAutosaveTimer();
    setError('');
    setSavingDiagram(true);
    showProcessing(
      statusText === 'uml_validated' ? 'Validando diagrama' : 'Salvando diagrama',
      'Convertendo o modelo gráfico para PlantUML.',
      1,
      3,
    );
    try {
      const model = normalizeDiagramForDisplay(
        sourceDiagram || plantumlToDiagramModel(sourcePlantuml),
      );
      const nextPlantuml = diagramModelToPlantuml(model);
      const diagramModelText = JSON.stringify(model);
      const nextStatus = statusText || session.statusText;

      showProcessing(
        statusText === 'uml_validated' ? 'Validando diagrama' : 'Salvando diagrama',
        'Persistindo diagrama na sessão.',
        2,
        3,
      );
      await updateSession(session.uid, session.id, {
        plantumlText: nextPlantuml,
        diagramModelText,
        statusText: nextStatus,
      });
      if (!isCurrentSession(session)) return false;

      showProcessing(
        statusText === 'uml_validated' ? 'Validando diagrama' : 'Salvando diagrama',
        statusText === 'uml_validated'
          ? 'Liberando a etapa de user stories.'
          : 'Atualizando editor do diagrama.',
        3,
        3,
      );
      setPlantuml(nextPlantuml);
      setDiagram(model);
      setActiveSession({
        ...session,
        plantumlText: nextPlantuml,
        diagramModelText,
        statusText: nextStatus,
      });
      return true;
    } catch (e) {
      setError(getErrorMessage(e));
      return false;
    } finally {
      setSavingDiagram(false);
      setProcessing(null);
    }
  }

  async function handleSaveDiagramCode() {
    await persistDiagram();
  }

  async function handleValidateUml() {
    if (await persistDiagram('uml_validated')) {
      setPhase(4);
    }
  }

  async function handleGenerateUserStories() {
    const session = activeSession;
    if (!session) return;
    const project = getAiProjectScope(session);
    const sourceDiagram = diagram;
    const sourcePlantumlText = plantuml;
    setError('');
    setGeneratingStories(true);
    showProcessing('Etapa 4: user stories', 'Preparando diagrama validado para a IA.', 1, 4);
    try {
      const sourcePlantuml = sourcePlantumlText.trim()
        ? sourcePlantumlText
        : sourceDiagram
          ? diagramModelToPlantuml(sourceDiagram)
          : '';
      if (!sourcePlantuml) throw new Error('missing_plantuml');
      showProcessing('Etapa 4: user stories', 'Gerando user stories e critérios de aceite.', 2, 4);
      const result = await generateUserStories({
        plantuml: sourcePlantuml,
        project,
        language: session.requirementsLanguage as RequirementLanguage,
      });
      if (!isCurrentSession(session)) return;
      showProcessing('Etapa 4: user stories', 'Organizando histórias retornadas.', 3, 4);
      setUserStories(result.user_stories);
      const userStoriesText = JSON.stringify(result.user_stories);
      showProcessing('Etapa 4: user stories', 'Salvando user stories na sessão.', 4, 4);
      await updateSession(session.uid, session.id, {
        userStoriesText,
        statusText: 'user_stories_generated',
      });
      if (!isCurrentSession(session)) return;
      setActiveSession({ ...session, userStoriesText, statusText: 'user_stories_generated' });
      setPhase(4);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setGeneratingStories(false);
      setProcessing(null);
    }
  }

  async function handleExportPdf() {
    if (!activeSession || !userStories.length) return;
    setError('');
    showProcessing('Gerando PDF', 'Montando relatorio para download.', 1, 1);
    try {
      await exportAnalysisPdf({
        title: activeSession.title || 'Analise de requisitos',
        statusLabel: getStatusLabel(activeSession.statusText),
        descriptionText,
        requirements,
        useCases,
        diagram,
        userStories,
        language: (activeSession.requirementsLanguage as RequirementLanguage) || 'pt-BR',
        filename: `${slugFileName(activeSession.title || 'relatorio')}.pdf`,
      });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleExportSessionPdf(item: SessionListItem, event?: MouseEvent<HTMLElement>) {
    event?.stopPropagation();
    if (!item.hasUserStories) return;

    setError('');
    showProcessing('Gerando PDF', 'Carregando análise salva.', 1, 2);
    try {
      const loaded =
        isAdmin && item.uid !== user?.uid
          ? await loadSession(item.uid, item.id)
          : await loadMySession(item.id);
      const loadedRequirements = parseSavedArray<FunctionalRequirement>(loaded.requirementsText);
      const loadedUseCases = parseSavedArray<UseCase>(loaded.useCasesText).map(normalizeUseCase);
      const loadedUserStories = parseSavedArray<UserStory>(loaded.userStoriesText);

      showProcessing('Gerando PDF', 'Montando relatório para download.', 2, 2);
      await exportAnalysisPdf({
        title: loaded.title || item.title || 'Analise de requisitos',
        statusLabel: getStatusLabel(loaded.statusText),
        descriptionText: loaded.descriptionText,
        requirements: loadedRequirements,
        useCases: loadedUseCases,
        diagram: await prepareDiagramForEditor(loaded),
        userStories: loadedUserStories,
        language: (loaded.requirementsLanguage as RequirementLanguage) || 'pt-BR',
        filename: `${slugFileName(loaded.title || item.title || 'relatorio')}.pdf`,
      });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleDeleteSession(item: SessionListItem, event?: MouseEvent<HTMLElement>) {
    event?.stopPropagation();
    const title = item.title || 'esta análise';
    if (!window.confirm(`Excluir "${title}"? Esta ação não pode ser desfeita.`)) return;

    clearDiagramAutosaveTimer();
    setError('');
    showProcessing('Excluindo análise', 'Removendo sessão do Firestore.', 1, 2);
    try {
      await deleteSession(item.uid, item.id);
      if (activeSession?.uid === item.uid && activeSession.id === item.id) {
        setActiveSession(null);
        setActiveView('dashboard');
        setPhase(1);
        setDescriptionText('');
        setRequirements([]);
        setUseCases([]);
        setPlantuml('');
        setDiagram(null);
        setUserStories([]);
      }
      showProcessing('Excluindo análise', 'Atualizando lista de análises.', 2, 2);
      await refreshSessionsList();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleFinishExtraction() {
    const session = activeSession;
    if (!session || !userStories.length) return;

    setError('');
    showProcessing('Finalizando extração', 'Marcando a análise como finalizada.', 1, 2);
    try {
      const userStoriesText = JSON.stringify(userStories);
      await updateSession(session.uid, session.id, {
        userStoriesText,
        statusText: 'extraction_finished',
      });
      if (!isCurrentSession(session)) return;
      setActiveSession({ ...session, userStoriesText, statusText: 'extraction_finished' });
      showProcessing('Finalizando extração', 'Atualizando lista de análises.', 2, 2);
      await refreshSessionsList();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  function buildEdgeFromConnection(connection: Connection) {
    if (!connection.source || !connection.target) return null;

    const source = String(connection.source);
    const target = String(connection.target);
    const sourceIsUseCase = isUseCaseNodeId(source);
    const targetIsUseCase = isUseCaseNodeId(target);

    if (sourceIsUseCase && targetIsUseCase) {
      const relationType = newEdgeKind === 'extend' ? 'extend' : 'include';
      return {
        ...connection,
        id: `rel:${source}..>${target}:${relationType}:${Date.now()}`,
        ...relationEdgePatch(relationType),
      };
    }

    if (sourceIsUseCase !== targetIsUseCase) {
      const actor = sourceIsUseCase ? target : source;
      const useCase = sourceIsUseCase ? source : target;
      return {
        id: `assoc:${actor}--${useCase}:${Date.now()}`,
        source: actor,
        target: useCase,
        label: '',
        data: { relationType: 'association' },
        type: 'smoothCurve',
        style: {
          stroke: '#94a3b8',
          strokeWidth: 1.5,
          opacity: 0.85,
        },
      };
    }

    return null;
  }

  function onConnect(connection: Connection) {
    const edge = buildEdgeFromConnection(connection);
    if (!edge) return;
    syncDiagram((current) => ({
      ...current,
      edges: addEdge(edge, current.edges),
    }));
  }

  async function handleRelayoutDiagram() {
    const current = diagram;
    if (!current) return;

    setError('');
    showProcessing('Reorganizando diagrama', 'Calculando posições com base nas relações.', 1, 1);
    try {
      const next = normalizeDiagramForDisplay(await relayoutDiagramModelWithGraphviz(current));
      const nextPlantuml = diagramModelToPlantuml(next);
      setDiagram(next);
      setPlantuml(nextPlantuml);
      scheduleDiagramAutosave(next, nextPlantuml);
      setDiagramLayoutRevision((value) => value + 1);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  function handleFitDiagramView() {
    setDiagramLayoutRevision((value) => value + 1);
  }

  const phaseLocked = wizard.phaseLocked;
  const activeStatus = activeSession?.statusText || '';
  const canGenerateDiagram = activeStatus === 'use_cases_validated' && useCases.length > 0;
  const canSaveDiagram = Boolean(diagram);
  const canValidateDiagram = Boolean(diagram);

  return (
    <>
      <Navbar bg="light" className="app-navbar border-bottom">
        <Container>
          <Stack direction="horizontal" gap={2} className="app-navbar__left">
            {user ? (
              <Button
                variant="outline-secondary"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menu"
                className="menu-button"
              >
                ☰
              </Button>
            ) : null}
            <Navbar.Brand className="app-brand mb-0">
              <span>Extrator de Engenharia de Software</span>
              <span className="app-brand__suffix"> – Dashboard</span>
            </Navbar.Brand>
          </Stack>
          <Stack direction="horizontal" gap={2} className="app-navbar__right">
            {user ? (
              <>
                <div className="user-chip text-muted small">
                  {displayName}{' '}
                  {isAdmin ? (
                    <strong>({getAccessRoleLabel(accessRole)})</strong>
                  ) : (
                    <span>({getAccessRoleLabel(accessRole)})</span>
                  )}
                </div>
                <Button variant="outline-secondary" onClick={handleLogout} className="auth-action">
                  Sair
                </Button>
              </>
            ) : (
              <Button onClick={handleLogin} className="auth-action">
                Entrar com Google
              </Button>
            )}
          </Stack>
        </Container>
      </Navbar>

      <Container className="py-4">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <ProcessingStatus processing={processing} />
        {loading ? (
          <div className="d-flex align-items-center gap-2 text-muted">
            <Spinner size="sm" /> carregando…
          </div>
        ) : user ? (
          <>
            <Offcanvas show={sidebarOpen} onHide={() => setSidebarOpen(false)} placement="start">
              <Offcanvas.Header closeButton>
                <Offcanvas.Title>Menu</Offcanvas.Title>
              </Offcanvas.Header>
              <Offcanvas.Body>
                <Nav className="flex-column" variant="pills" activeKey={activeView}>
                  <Nav.Link
                    eventKey="dashboard"
                    onClick={() => {
                      setActiveView('dashboard');
                      setSidebarOpen(false);
                    }}
                  >
                    Dashboard
                  </Nav.Link>
                  <Nav.Link
                    eventKey="sessions"
                    onClick={() => {
                      setActiveView('sessions');
                      setSidebarOpen(false);
                    }}
                  >
                    Sessões
                  </Nav.Link>
                  {isAdmin ? (
                    <Nav.Link
                      eventKey="users"
                      onClick={() => {
                        setActiveView('users');
                        setSidebarOpen(false);
                      }}
                    >
                      Gestão de usuários
                    </Nav.Link>
                  ) : null}
                  {activeSession ? (
                    <Nav.Link
                      eventKey="workspace"
                      onClick={() => {
                        setActiveView('workspace');
                        setSidebarOpen(false);
                      }}
                    >
                      Workspace
                    </Nav.Link>
                  ) : null}
                </Nav>
                <hr />
                <div className="text-muted small">
                  {isAdmin
                    ? 'Admin vê todas as sessões e gerencia usuários.'
                    : 'User vê apenas as próprias sessões.'}
                </div>
              </Offcanvas.Body>
            </Offcanvas>

            {activeView === 'dashboard' ? (
              <Row className="g-3">
                <Col md={4}>
                  <Card className="h-100">
                    <Card.Body>
                      <Card.Title>NOVA ANÁLISE</Card.Title>
                      <Card.Text className="text-muted">
                        Criar uma nova sessão e abrir o formulário para iniciar a análise.
                      </Card.Text>
                      <Button onClick={handleNewAnalysis}>Abrir formulário</Button>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={8}>
                  <Card className="h-100">
                    <Card.Body>
                      <Card.Title>Análises</Card.Title>
                      <Card.Text className="text-muted mb-3">
                        Abra uma análise existente para editar ou crie uma nova.
                      </Card.Text>
                      {sessionsLoading ? (
                        <div className="d-flex align-items-center gap-2 text-muted">
                          <Spinner size="sm" /> carregando análises…
                        </div>
                      ) : sessions.length ? (
                        <Row className="g-2">
                          {sessions.slice(0, 6).map((s) => (
                            <Col md={6} key={`${s.uid}:${s.id}`}>
                              <Card className="h-100">
                                <Card.Body>
                                  <div className="d-flex justify-content-between align-items-start gap-2">
                                    <div>
                                      <Card.Title className="h6 mb-1">
                                        {s.title || 'Sem título'}
                                      </Card.Title>
                                      <div className="text-muted small">
                                        status: <code>{getStatusLabel(s.statusText)}</code>
                                      </div>
                                      <div className="text-muted small">
                                        atualizado: {s.updatedAtText || '-'}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-2 d-flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline-primary"
                                      onClick={() => handleSelectSession(s)}
                                    >
                                      Editar
                                    </Button>
                                    {s.hasUserStories ? (
                                      <Button
                                        size="sm"
                                        variant="outline-success"
                                        onClick={(event) => handleExportSessionPdf(s, event)}
                                      >
                                        PDF
                                      </Button>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      variant="outline-danger"
                                      onClick={(event) => handleDeleteSession(s, event)}
                                    >
                                      Excluir
                                    </Button>
                                  </div>
                                </Card.Body>
                              </Card>
                            </Col>
                          ))}
                        </Row>
                      ) : (
                        <Alert variant="secondary" className="mb-0">
                          Nenhuma análise ainda. Clique em <strong>NOVA ANÁLISE</strong>.
                        </Alert>
                      )}
                      {sessions.length > 6 ? (
                        <div className="mt-3">
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => setActiveView('sessions')}
                          >
                            Ver todas
                          </Button>
                        </div>
                      ) : null}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            ) : null}

            {activeView === 'sessions' ? (
              <>
                <Stack direction="horizontal" className="mb-3" gap={2}>
                  <Button onClick={handleNewAnalysis}>Nova análise</Button>
                  <div className="text-muted small ms-auto">
                    {isAdmin ? 'Visão admin: todas as sessões' : 'Visão user: só as suas sessões'}
                  </div>
                </Stack>

                {sessionsLoading ? (
                  <div className="d-flex align-items-center gap-2 text-muted">
                    <Spinner size="sm" /> carregando sessões…
                  </div>
                ) : sessions.length ? (
                  <Table bordered hover size="sm">
                    <thead>
                      <tr>
                        {isAdmin ? <th>UID</th> : null}
                        <th>Título</th>
                        <th>Status</th>
                        <th>Atualizado</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr
                          key={`${s.uid}:${s.id}`}
                          role="button"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleSelectSession(s)}
                        >
                          {isAdmin ? <td className="text-muted">{s.uid}</td> : null}
                          <td>{s.title}</td>
                          <td className="text-muted">{getStatusLabel(s.statusText)}</td>
                          <td className="text-muted">{s.updatedAtText}</td>
                          <td>
                            <Stack direction="horizontal" gap={2}>
                              <Button
                                size="sm"
                                variant="outline-primary"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleSelectSession(s);
                                }}
                              >
                                Editar
                              </Button>
                              {s.hasUserStories ? (
                                <Button
                                  size="sm"
                                  variant="outline-success"
                                  onClick={(event) => handleExportSessionPdf(s, event)}
                                >
                                  PDF
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={(event) => handleDeleteSession(s, event)}
                              >
                                Excluir
                              </Button>
                            </Stack>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <Alert variant="secondary">Nenhuma sessão ainda. Clique em “Nova análise”.</Alert>
                )}
              </>
            ) : null}

            {activeView === 'users' ? (
              isAdmin ? (
                <>
                  <Stack direction="horizontal" className="mb-3" gap={2}>
                    <div>
                      <h5 className="mb-1">Gestão de usuários</h5>
                      <div className="text-muted small">
                        Insira, edite ou remova Gmails. Admin vê todos; user vê só o próprio.
                      </div>
                    </div>
                    <Button
                      variant="outline-secondary"
                      className="ms-auto"
                      onClick={refreshAccessUsers}
                      disabled={accessLoading}
                    >
                      Atualizar
                    </Button>
                  </Stack>

                  <Card className="mb-3">
                    <Card.Body>
                      <Form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleSaveAccessUser();
                        }}
                      >
                        <Row className="g-2 align-items-end">
                          <Col md={7}>
                            <Form.Label>Gmail do usuário</Form.Label>
                            <Form.Control
                              type="email"
                              value={accessEmail}
                              onChange={(event) => setAccessEmail(event.target.value)}
                              placeholder="nome@gmail.com"
                            />
                          </Col>
                          <Col md={3}>
                            <Form.Label>Nível</Form.Label>
                            <Form.Select
                              value={accessRoleDraft}
                              onChange={(event) =>
                                setAccessRoleDraft(event.target.value as AccessRole)
                              }
                            >
                              <option value="user">user</option>
                              <option value="admin">admin</option>
                            </Form.Select>
                          </Col>
                          <Col md={2}>
                            <Button type="submit" className="w-100" disabled={!accessEmail.trim()}>
                              Salvar
                            </Button>
                          </Col>
                        </Row>
                      </Form>
                    </Card.Body>
                  </Card>

                  {accessLoading ? (
                    <div className="d-flex align-items-center gap-2 text-muted">
                      <Spinner size="sm" /> carregando usuários…
                    </div>
                  ) : accessUsers.length ? (
                    <Table bordered hover size="sm" responsive>
                      <thead>
                        <tr>
                          <th>Gmail</th>
                          <th>Nível</th>
                          <th>Atualizado</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accessUsers.map((item) => (
                          <tr key={item.email}>
                            <td>{item.email}</td>
                            <td>
                              <Form.Select
                                size="sm"
                                value={item.role}
                                onChange={(event) => {
                                  void handleChangeAccessUserRole(
                                    item.email,
                                    event.target.value as AccessRole,
                                  );
                                }}
                              >
                                <option value="user">user</option>
                                <option value="admin">admin</option>
                              </Form.Select>
                            </td>
                            <td className="text-muted">{item.updatedAtText || '-'}</td>
                            <td>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => handleRemoveAccessUser(item.email)}
                              >
                                Remover
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  ) : (
                    <Alert variant="secondary">Nenhum Gmail cadastrado ainda.</Alert>
                  )}
                </>
              ) : (
                <Alert variant="secondary">Apenas admin pode acessar a gestão de usuários.</Alert>
              )
            ) : null}

            {activeView === 'workspace' ? (
              activeSession ? (
                <section className="workspace-panel">
                  <div className="workspace-header mb-3">
                    <div>
                      <div className="text-muted small">Fase atual</div>
                      <strong>
                        {phase}.{' '}
                        {phase === 1
                          ? 'RFs'
                          : phase === 2
                            ? 'UCs'
                            : phase === 3
                              ? 'Diagrama'
                              : 'US'}
                      </strong>
                    </div>
                    <div className="phase-tabs">
                      <Button
                        size="sm"
                        variant={phase === 1 ? 'primary' : 'outline-primary'}
                        onClick={() => setPhase(1)}
                      >
                        1. RFs
                      </Button>
                      <Button
                        size="sm"
                        variant={phase === 2 ? 'primary' : 'outline-primary'}
                        onClick={() => setPhase(2)}
                        disabled={phaseLocked(2)}
                      >
                        2. UCs
                      </Button>
                      <Button
                        size="sm"
                        variant={phase === 3 ? 'primary' : 'outline-primary'}
                        onClick={() => setPhase(3)}
                        disabled={phaseLocked(3)}
                      >
                        3. Diagrama
                      </Button>
                      <Button
                        size="sm"
                        variant={phase === 4 ? 'primary' : 'outline-primary'}
                        onClick={() => setPhase(4)}
                        disabled={phaseLocked(4)}
                      >
                        4. US
                      </Button>
                    </div>
                  </div>

                  <RequirementsStep
                    phase={phase}
                    statusLabel={getStatusLabel(activeSession.statusText)}
                    descriptionText={descriptionText}
                    extracting={extracting}
                    requirements={requirements}
                    language={requirementsLanguage}
                    onChangeDescription={setDescriptionText}
                    onChangeLanguage={handleChangeRequirementsLanguage}
                    onSaveDescription={handleSaveDescription}
                    onExtract={handleExtractRequirements}
                    onValidate={handleValidateRequirements}
                    onChangeRequirements={handleChangeRequirements}
                    onAddRequirement={handleAddRequirement}
                    onRemoveRequirement={handleRemoveRequirement}
                  />

                  <UseCasesStep
                    phase={phase}
                    statusText={activeSession.statusText}
                    statusLabel={getStatusLabel(activeSession.statusText)}
                    generating={generatingUseCases}
                    requirementsCount={requirements.length}
                    useCases={useCases}
                    onGenerate={handleGenerateUseCases}
                    onValidate={handleValidateUseCases}
                    onChangeUseCases={handleChangeUseCases}
                    onAddUseCase={handleAddUseCase}
                    onRemoveUseCase={handleRemoveUseCase}
                  />

                  {phase === 3 ? (
                    <section className="diagram-stage" aria-labelledby="diagram-stage-title">
                      <header className="diagram-stage__header">
                        <div className="diagram-stage__heading">
                          <span className="diagram-stage__eyebrow">Etapa 3</span>
                          <h3 id="diagram-stage-title" className="diagram-stage__title">
                            Diagrama de casos de uso
                          </h3>
                          <p className="diagram-stage__lede">
                            Edite visualmente, valide as relações e exporte para o PDF final.
                          </p>
                        </div>
                        <div className="diagram-stage__meta">
                          <Badge
                            bg="light"
                            text="dark"
                            className="diagram-stage__status"
                            title="Estado atual desta análise"
                          >
                            <span className="diagram-stage__status-dot" aria-hidden="true" />
                            {getStatusLabel(activeSession.statusText)}
                          </Badge>
                          <div
                            className="diagram-stage__primary-actions"
                            role="group"
                            aria-label="Ações primárias do diagrama"
                          >
                            {canGenerateDiagram && !diagram ? (
                              <Button
                                variant="primary"
                                onClick={handleGenerateUml}
                                disabled={generatingUml}
                              >
                                {generatingUml ? 'Gerando…' : 'Gerar diagrama'}
                              </Button>
                            ) : null}
                            {canSaveDiagram || savingDiagram ? (
                              <Button
                                variant="outline-primary"
                                onClick={handleSaveDiagramCode}
                                disabled={savingDiagram}
                              >
                                {savingDiagram ? 'Salvando…' : 'Salvar diagrama'}
                              </Button>
                            ) : null}
                            {canValidateDiagram ? (
                              <Button
                                variant="primary"
                                onClick={handleValidateUml}
                                disabled={savingDiagram}
                              >
                                Validar diagrama
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </header>

                      {diagram || plantuml.trim() ? (
                        <div className="diagram-stage-fullwidth">
                          <Card className="diagram-editor-card mb-3">
                            <Card.Header className="diagram-card-header">
                              <div
                                className="diagram-view-tabs"
                                role="tablist"
                                aria-label="Modo de visualização do diagrama"
                              >
                                <button
                                  type="button"
                                  role="tab"
                                  aria-selected={diagramViewMode === 'edit'}
                                  className={`diagram-view-tabs__tab${
                                    diagramViewMode === 'edit'
                                      ? ' diagram-view-tabs__tab--active'
                                      : ''
                                  }`}
                                  onClick={() => setDiagramViewMode('edit')}
                                >
                                  Editar diagrama
                                </button>
                                <button
                                  type="button"
                                  role="tab"
                                  aria-selected={diagramViewMode === 'preview'}
                                  className={`diagram-view-tabs__tab${
                                    diagramViewMode === 'preview'
                                      ? ' diagram-view-tabs__tab--active'
                                      : ''
                                  }`}
                                  onClick={() => setDiagramViewMode('preview')}
                                >
                                  Prévia do PDF
                                </button>
                              </div>
                              <div className="diagram-card-header__actions">
                                {canGenerateDiagram || generatingUml ? (
                                  <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    onClick={handleGenerateUml}
                                    disabled={generatingUml}
                                    title="Gera o diagrama a partir dos casos de uso validados"
                                  >
                                    {generatingUml ? 'Gerando…' : 'Gerar diagrama'}
                                  </Button>
                                ) : null}
                              </div>
                            </Card.Header>
                            <Card.Body className="p-0">
                              {diagram && diagramViewMode === 'edit' ? (
                                <div className="diagram-toolbar">
                                  <div
                                    className="diagram-toolbar__group"
                                    aria-label="Controles de layout"
                                  >
                                    <span className="diagram-toolbar__label">Layout</span>
                                    <ButtonGroup size="sm">
                                      <Button
                                        variant="outline-secondary"
                                        onClick={handleRelayoutDiagram}
                                        title="Recalcula a organização dos nós minimizando cruzamentos"
                                      >
                                        Reorganizar
                                      </Button>
                                      <Button
                                        variant="outline-secondary"
                                        onClick={handleFitDiagramView}
                                        title="Recalcula o enquadramento do diagrama na área"
                                      >
                                        Encaixar
                                      </Button>
                                    </ButtonGroup>
                                  </div>
                                  <div
                                    className="diagram-toolbar__group"
                                    aria-label="Tipo de nova conexão"
                                  >
                                    <span className="diagram-toolbar__label">Nova conexão</span>
                                    <Form.Select
                                      size="sm"
                                      className="edge-kind-select"
                                      value={newEdgeKind}
                                      onChange={(e) =>
                                        setNewEdgeKind(e.target.value as NewEdgeKind)
                                      }
                                      aria-label="Tipo de nova conexão entre nós"
                                    >
                                      <option value="association">Associação (ator–UC)</option>
                                      <option value="include">Include (UC–UC)</option>
                                      <option value="extend">Extend (UC–UC)</option>
                                    </Form.Select>
                                  </div>
                                  <div
                                    className="diagram-toolbar__group diagram-toolbar__group--end"
                                    aria-label="Exibição do canvas"
                                  >
                                    <Form.Check
                                      type="switch"
                                      id="diagram-snap-grid"
                                      className="diagram-snap-switch mb-0"
                                      checked={diagramSnapToGrid}
                                      onChange={(e) => setDiagramSnapToGrid(e.target.checked)}
                                      title="Ao arrastar, os nós alinham à malha de 16x16 px"
                                      label="Grade magnética"
                                    />
                                    <Button
                                      size="sm"
                                      variant={diagramMiniMap ? 'secondary' : 'outline-secondary'}
                                      onClick={() => setDiagramMiniMap((value) => !value)}
                                      title="Alterna o mini-mapa do canvas"
                                    >
                                      Mini-mapa
                                    </Button>
                                  </div>
                                </div>
                              ) : null}

                              {relationRows.length ? (
                                <div className="diagram-relations-panel">
                                  <button
                                    type="button"
                                    className="diagram-relations-panel__toggle"
                                    onClick={() => setRelationsPanelOpen((value) => !value)}
                                    aria-expanded={relationsPanelOpen}
                                    aria-controls="diagram-relations-panel-body"
                                  >
                                    <span
                                      className={`diagram-relations-panel__chevron${
                                        relationsPanelOpen
                                          ? ' diagram-relations-panel__chevron--open'
                                          : ''
                                      }`}
                                      aria-hidden="true"
                                    />
                                    <span className="diagram-relations-panel__title">
                                      Relações include / extend
                                    </span>
                                    <Badge bg="secondary" pill className="ms-2">
                                      {relationRows.length}
                                    </Badge>
                                  </button>
                                  <Collapse in={relationsPanelOpen}>
                                    <div id="diagram-relations-panel-body">
                                      <div className="diagram-relations-panel__body">
                                        <Table
                                          bordered
                                          size="sm"
                                          responsive
                                          className="mb-0 bg-white"
                                        >
                                          <thead>
                                            <tr>
                                              <th>Origem</th>
                                              <th>Tipo</th>
                                              <th>Destino</th>
                                              <th>Ação</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {relationRows.map((row) => (
                                              <tr key={row.id}>
                                                <td>{row.source}</td>
                                                <td>
                                                  <Form.Select
                                                    value={row.type}
                                                    onChange={(e) =>
                                                      updateRelationType(
                                                        row.id,
                                                        e.target.value as 'include' | 'extend',
                                                      )
                                                    }
                                                    aria-label={`Tipo da relação ${row.source} → ${row.target}`}
                                                  >
                                                    <option value="include">include</option>
                                                    <option value="extend">extend</option>
                                                  </Form.Select>
                                                </td>
                                                <td>{row.target}</td>
                                                <td>
                                                  <Button
                                                    size="sm"
                                                    variant="outline-danger"
                                                    onClick={() => removeDiagramEdge(row.id)}
                                                  >
                                                    Remover aresta
                                                  </Button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </Table>
                                      </div>
                                    </div>
                                  </Collapse>
                                </div>
                              ) : null}

                              {diagramViewMode === 'preview' ? (
                                <div className="diagram-pdf-preview border-top">
                                  {diagram ? (
                                    <div
                                      className="diagram-pdf-preview__page"
                                      style={diagramPreviewPageStyle}
                                      aria-live="polite"
                                    >
                                      {diagramPreviewLoading ? (
                                        <div className="diagram-pdf-preview__placeholder text-muted">
                                          Renderizando a prévia final…
                                        </div>
                                      ) : null}
                                      {diagramPreviewUrl ? (
                                        <img
                                          src={diagramPreviewUrl}
                                          alt="Prévia final do diagrama de casos de uso"
                                        />
                                      ) : null}
                                      {!diagramPreviewLoading && !diagramPreviewUrl ? (
                                        <div className="diagram-pdf-preview__placeholder text-muted">
                                          Não foi possível renderizar a prévia final.
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="p-3 text-muted">
                                      Gere o diagrama novamente para restaurar a prévia final.
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="diagram-canvas diagram-canvas--expanded border-top">
                                  {diagram ? (
                                    <ReactFlow
                                      nodes={editorNodes}
                                      edges={diagram.edges}
                                      nodeTypes={diagramNodeTypes}
                                      edgeTypes={diagramEdgeTypes}
                                      fitView
                                      fitViewOptions={{ padding: 0.12, minZoom: 0.52, maxZoom: 1 }}
                                      onNodesChange={(changes) => {
                                        const filtered = (changes as NodeChange[]).filter(
                                          (change) =>
                                            !('id' in change) ||
                                            change.id !== EDITOR_SYSTEM_NODE_ID,
                                        );
                                        if (!filtered.length) return;
                                        syncDiagram((current) => ({
                                          ...current,
                                          nodes: applyNodeChanges(filtered, current.nodes),
                                        }));
                                      }}
                                      onEdgesChange={(changes) => {
                                        syncDiagram((current) => ({
                                          ...current,
                                          edges: applyEdgeChanges(
                                            changes as EdgeChange[],
                                            current.edges,
                                          ),
                                        }));
                                      }}
                                      onConnect={onConnect}
                                      elevateEdgesOnSelect
                                      minZoom={0.1}
                                      maxZoom={2.2}
                                      preventScrolling={false}
                                      zoomOnScroll={false}
                                      panOnScroll={false}
                                      deleteKeyCode={['Backspace', 'Delete']}
                                      connectionLineStyle={{ strokeWidth: 2 }}
                                      snapToGrid={diagramSnapToGrid}
                                      snapGrid={DIAGRAM_SNAP_GRID}
                                    >
                                      <DiagramFitView revision={diagramLayoutRevision} />
                                      <Background
                                        gap={diagramSnapToGrid ? DIAGRAM_SNAP_GRID[0] : 20}
                                      />
                                      <Controls />
                                      {diagramMiniMap ? (
                                        <MiniMap
                                          zoomable
                                          pannable
                                          nodeColor={minimapNodeColor}
                                          maskColor="rgba(15, 23, 42, 0.12)"
                                          style={{ height: 120, width: 180 }}
                                        />
                                      ) : null}
                                    </ReactFlow>
                                  ) : (
                                    <div className="p-3 text-muted">
                                      Gere o diagrama novamente para restaurar o canvas.
                                    </div>
                                  )}
                                </div>
                              )}
                            </Card.Body>
                          </Card>
                        </div>
                      ) : (
                        <Alert variant="secondary">
                          Valide as UCs (Etapa 2) para liberar a geração do diagrama.
                        </Alert>
                      )}
                    </section>
                  ) : null}

                  <UserStoriesStep
                    phase={phase}
                    statusText={activeSession.statusText}
                    statusLabel={getStatusLabel(activeSession.statusText)}
                    generating={generatingStories}
                    plantuml={plantuml}
                    userStories={userStories}
                    onGenerate={handleGenerateUserStories}
                    onExportPdf={handleExportPdf}
                    onFinishExtraction={handleFinishExtraction}
                    onChangeUserStories={handleChangeUserStories}
                    onRemoveUserStory={handleRemoveUserStory}
                  />

                  <AnalysisReport
                    title={activeSession.title || 'Analise de requisitos'}
                    statusLabel={getStatusLabel(activeSession.statusText)}
                    descriptionText={descriptionText}
                    requirements={requirements}
                    useCases={useCases}
                    diagram={diagram}
                    userStories={userStories}
                    language={(activeSession.requirementsLanguage as RequirementLanguage) || 'pt-BR'}
                  />
                </section>
              ) : (
                <Alert variant="secondary">
                  Abra uma análise no Dashboard ou no menu de Sessões para acessar o workspace.
                </Alert>
              )
            ) : null}
          </>
        ) : (
          <section className="signed-out-panel">
            <div className="signed-out-panel__eyebrow">Engenharia de software</div>
            <h1 className="signed-out-panel__title">
              Extrator de elementos de engenharia de software
            </h1>
            <p className="signed-out-panel__copy">
              Entre para criar sessões, revisar requisitos, organizar casos de uso e continuar o
              trabalho de onde parou.
            </p>
            <Button onClick={handleLogin} className="signed-out-panel__action">
              Entrar com Google
            </Button>
          </section>
        )}
      </Container>
    </>
  );
}

export default App;
