import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
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
  getMyAccessUser,
  listAccessUsers,
  removeAccessUser,
  saveAccessUser,
} from './features/access/api/accessRepo';
import type { AccessRole, AccessUser } from './features/access/model/types';
import {
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from 'reactflow';
import {
  diagramModelToDrawioXml,
  diagramModelToPlantuml,
  buildDiagramModelFromUseCases,
  plantumlToDiagramModel,
  relayoutDiagramModel,
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
import type { AiProjectScope } from './features/analysis/prompts';
import 'reactflow/dist/style.css';

type NewEdgeKind = 'association' | 'include' | 'extend';

/** Malha do canvas alinhada ao `snapToGrid` do React Flow (px). */
const DIAGRAM_SNAP_GRID: [number, number] = [16, 16];

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
  return error instanceof Error ? error.message : String(error);
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
  if (session.diagramModelText) {
    try {
      return JSON.parse(session.diagramModelText) as DiagramModel;
    } catch {
      // Fallback to PlantUML below.
    }
  }

  if (!session.plantumlText.trim()) return null;
  try {
    return plantumlToDiagramModel(session.plantumlText);
  } catch {
    return null;
  }
}

function relationEdgePatch(relationType: 'include' | 'extend'): Partial<Edge> {
  return {
    type: 'default',
    pathOptions: { curvature: 0.22 },
    label: `<<${relationType}>>`,
    data: { relationType },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
    labelStyle: {
      fill: relationType === 'include' ? '#1d4ed8' : '#6d28d9',
      fontWeight: 700,
    },
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      stroke: relationType === 'include' ? '#2563eb' : '#7c3aed',
      strokeWidth: 1.35,
      strokeDasharray: '7 5',
      opacity: 0.42,
    },
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

function downloadTextFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getAccessRoleLabel(role: AccessRole | null) {
  if (role === 'admin') return 'admin';
  if (role === 'user') return 'user';
  return 'sem acesso';
}

const minimapNodeColor = (node: { id?: unknown }) =>
  String(node.id || '').startsWith('UC') ? '#2563eb' : '#64748b';

function DiagramFitView({ revision }: { revision: number }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 240 });
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
  const [extracting, setExtracting] = useState(false);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [generatingUseCases, setGeneratingUseCases] = useState(false);
  const [plantuml, setPlantuml] = useState('');
  const [diagram, setDiagram] = useState<DiagramModel | null>(null);
  const [generatingUml, setGeneratingUml] = useState(false);
  const [savingDiagram, setSavingDiagram] = useState(false);
  const [newEdgeKind, setNewEdgeKind] = useState<NewEdgeKind>('association');
  const [diagramMiniMap, setDiagramMiniMap] = useState(true);
  const [diagramSnapToGrid, setDiagramSnapToGrid] = useState(true);
  const [diagramLayoutRevision, setDiagramLayoutRevision] = useState(0);
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

  const flushDiagramAutosave = useCallback(async (s: AutosaveSession, model: DiagramModel, puml: string) => {
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
  }, []);

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
        }
      },
      (authError) => {
        authStateResolved = true;
        window.clearTimeout(fallbackTimer);
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
    (async () => {
      try {
        const accessUser = await getMyAccessUser();
        if (!cancelled) {
          setAccessRole(accessUser?.role || null);
          setIsAdmin(accessUser?.role === 'admin');
          if (!accessUser) {
            setError('Seu Gmail ainda não está cadastrado na gestão de usuários.');
          }
        }
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const relationRows = useMemo(() => {
    if (!diagram) return [];
    const nodeNameById = new Map(
      diagram.nodes.map((node) => [
        String(node.id),
        String((node.data as { label?: string })?.label || node.id),
      ]),
    );

    return diagram.edges
      .filter((edge) => String(edge.label || '').includes('<<'))
      .map((edge) => ({
        id: String(edge.id),
        source: nodeNameById.get(String(edge.source)) || String(edge.source),
        target: nodeNameById.get(String(edge.target)) || String(edge.target),
        type: String(edge.label || '')
          .toLowerCase()
          .includes('extend')
          ? 'extend'
          : 'include',
      }));
  }, [diagram]);

  async function handleLogin() {
    setError('');
    showProcessing('Autenticando usuário', 'Abrindo o login do Google.', 1, 1);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleLogout() {
    clearDiagramAutosaveTimer();
    setError('');
    showProcessing('Encerrando sessão', 'Saindo da conta atual.', 1, 1);
    try {
      await signOut(auth);
    } catch (e) {
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
    try {
      await saveAccessUser(accessEmail, accessRoleDraft);
      setAccessEmail('');
      setAccessRoleDraft('user');
      showProcessing('Salvando acesso', 'Recarregando usuários cadastrados.', 2, 2);
      await refreshAccessUsers();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleChangeAccessUserRole(email: string, role: AccessRole) {
    setError('');
    showProcessing('Editando acesso', 'Atualizando nível do Gmail selecionado.', 1, 2);
    try {
      await saveAccessUser(email, role);
      showProcessing('Editando acesso', 'Recarregando usuários cadastrados.', 2, 2);
      await refreshAccessUsers();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleRemoveAccessUser(email: string) {
    setError('');
    showProcessing('Removendo acesso', 'Excluindo Gmail da gestão de usuários.', 1, 2);
    try {
      await removeAccessUser(email);
      showProcessing('Removendo acesso', 'Recarregando usuários cadastrados.', 2, 2);
      await refreshAccessUsers();
    } catch (e) {
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
    showProcessing('Abrindo análise', 'Carregando dados salvos da sessão.', 1, 2);
    try {
      const loaded =
        isAdmin && item.uid !== user?.uid
          ? await loadSession(item.uid, item.id)
          : await loadMySession(item.id);
      showProcessing('Abrindo análise', 'Restaurando requisitos, casos de uso e diagrama.', 2, 2);
      setActiveSession(loaded);
      setActiveView('workspace');
      setSidebarOpen(false);
      setDescriptionText(loaded.descriptionText || '');
      setRequirements(loaded.requirementsText ? JSON.parse(loaded.requirementsText) : []);
      setUseCases(loaded.useCasesText ? JSON.parse(loaded.useCasesText).map(normalizeUseCase) : []);
      setPlantuml(loaded.plantumlText || '');
      setDiagram(readDiagramFromSession(loaded));
      setUserStories(loaded.userStoriesText ? JSON.parse(loaded.userStoriesText) : []);
      setPhase(getRecommendedPhase(loaded.statusText));
      setDiagramLayoutRevision((value) => value + 1);
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
      const result = await extractRequirements({ text: sourceDescription, project });
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
      const model = buildDiagramModelFromUseCases(sourceUseCases, session.title || 'Sistema');
      showProcessing('Etapa 3: diagrama', 'Aplicando associações, include e extend.', 2, 4);
      const nextPlantuml = diagramModelToPlantuml(model);
      if (!isCurrentSession(session)) return;
      setPlantuml(nextPlantuml);
      setDiagram(model);
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
      setDiagramLayoutRevision((value) => value + 1);
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
      const next = updater(current);
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
      const model = sourceDiagram || plantumlToDiagramModel(sourcePlantuml);
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
      const result = await generateUserStories({ plantuml: sourcePlantuml, project });
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

  function handleDownloadDiagramXml() {
    if (!diagram || !activeSession) return;
    const filename = `${slugFileName(activeSession.title || 'diagrama')}.drawio`;
    downloadTextFile(filename, diagramModelToDrawioXml(diagram), 'application/xml;charset=utf-8');
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
        filename: `${slugFileName(activeSession.title || 'relatorio')}.pdf`,
      });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleExportSessionPdf(
    item: SessionListItem,
    event?: MouseEvent<HTMLElement>,
  ) {
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
        diagram: readDiagramFromSession(loaded),
        userStories: loadedUserStories,
        filename: `${slugFileName(loaded.title || item.title || 'relatorio')}.pdf`,
      });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleDeleteSession(
    item: SessionListItem,
    event?: MouseEvent<HTMLElement>,
  ) {
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
      await updateSession(session.uid, session.id, { statusText: 'extraction_finished' });
      if (!isCurrentSession(session)) return;
      setActiveSession({ ...session, statusText: 'extraction_finished' });
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
    const relationAllowed = source.startsWith('UC') && target.startsWith('UC');
    const relationType =
      relationAllowed && newEdgeKind !== 'association' ? newEdgeKind : 'association';

    if (relationType === 'association') {
      return {
        ...connection,
        id: `assoc:${source}--${target}:${Date.now()}`,
        label: '',
        data: { relationType: 'association' },
        type: 'straight',
        style: {
          stroke: '#64748b',
          strokeWidth: 1.15,
          opacity: 0.38,
        },
      };
    }

    return {
      ...connection,
      id: `rel:${source}..>${target}:${relationType}:${Date.now()}`,
      ...relationEdgePatch(relationType),
    };
  }

  function onConnect(connection: Connection) {
    const edge = buildEdgeFromConnection(connection);
    if (!edge) return;
    syncDiagram((current) => ({
      ...current,
      edges: addEdge(edge, current.edges),
    }));
  }

  function handlePlantumlChange(value: string) {
    setPlantuml(value);
    try {
      const next = plantumlToDiagramModel(value);
      setDiagram(next);
      scheduleDiagramAutosave(next, value);
    } catch {
      // Keep the last valid diagram while the user is editing the code.
    }
  }

  function handleRelayoutDiagram() {
    syncDiagram((current) => relayoutDiagramModel(current));
    setDiagramLayoutRevision((value) => value + 1);
  }

  function handleFitDiagramView() {
    setDiagramLayoutRevision((value) => value + 1);
  }

  const phaseLocked = wizard.phaseLocked;
  const activeStatus = activeSession?.statusText || '';
  const canGenerateDiagram = activeStatus === 'use_cases_validated' && useCases.length > 0;
  const canSaveDiagram = Boolean(plantuml.trim());
  const canDownloadDiagram = Boolean(diagram);
  const canValidateDiagram = Boolean(diagram && plantuml.trim());

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
                    onChangeDescription={setDescriptionText}
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
                    <>
                      <h5 className="mb-3">Etapa 3 – Diagrama</h5>
                      <Stack direction="horizontal" gap={3} className="action-bar mb-3 flex-wrap">
                        {canGenerateDiagram || generatingUml ? (
                          <Button
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
                            variant="success"
                            onClick={handleValidateUml}
                            disabled={savingDiagram}
                          >
                            Validar diagrama
                          </Button>
                        ) : null}
                        {canDownloadDiagram ? (
                          <Button
                            variant="outline-secondary"
                            onClick={handleDownloadDiagramXml}
                          >
                            Baixar draw.io
                          </Button>
                        ) : null}
                        <div className="status-pill text-muted small ms-md-auto">
                          status: <code>{getStatusLabel(activeSession.statusText)}</code>
                        </div>
                      </Stack>

                      {plantuml.trim() ? (
                        <div className="diagram-stage-fullwidth">
                          <Card className="diagram-editor-card mb-3">
                            <Card.Header className="py-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
                              <div>
                                <strong>Editor visual</strong>
                                <div className="text-muted small fw-normal">
                                  Arraste nós, conecte com o tipo escolhido e use as ferramentas à
                                  direita. A grade magnética (opcional) alinha ao soltar.
                                </div>
                              </div>
                              <div className="text-muted small">
                                Atalhos: controles no canto inferior esquerdo; mini-mapa opcional.
                              </div>
                            </Card.Header>
                            <Card.Body className="p-0">
                              {diagram ? (
                                <div className="diagram-toolbar border-bottom px-3 py-2 d-flex flex-wrap align-items-center gap-2">
                                  <span className="text-muted small me-1">Nova conexão</span>
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
                                  <Form.Check
                                    type="switch"
                                    id="diagram-snap-grid"
                                    className="diagram-snap-switch mb-0"
                                    checked={diagramSnapToGrid}
                                    onChange={(e) => setDiagramSnapToGrid(e.target.checked)}
                                    title="Ao arrastar, os nós alinham à malha de 16x16 px"
                                    label="Grade magnética"
                                  />
                                  <ButtonGroup size="sm" className="ms-md-auto flex-wrap">
                                    <Button
                                      variant="outline-secondary"
                                      onClick={handleFitDiagramView}
                                      title="Recalcula o enquadramento do diagrama na área"
                                    >
                                      Encaixar na tela
                                    </Button>
                                    <Button
                                      variant="outline-secondary"
                                      onClick={handleRelayoutDiagram}
                                      title="Reposiciona nós com base nas relações include/extend"
                                    >
                                      Reorganizar layout
                                    </Button>
                                    <Button
                                      variant={diagramMiniMap ? 'secondary' : 'outline-secondary'}
                                      onClick={() => setDiagramMiniMap((value) => !value)}
                                    >
                                      {diagramMiniMap ? 'Ocultar mini-mapa' : 'Mostrar mini-mapa'}
                                    </Button>
                                  </ButtonGroup>
                                </div>
                              ) : null}

                              {relationRows.length ? (
                                <div className="px-3 py-3 border-bottom bg-body-tertiary">
                                  <div className="text-muted small mb-2 fw-semibold">
                                    Relações include / extend (edição rápida)
                                  </div>
                                  <Table bordered size="sm" responsive className="mb-0 bg-white">
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
                              ) : null}

                              <div className="diagram-canvas diagram-canvas--expanded border-top">
                                {diagram ? (
                                  <ReactFlow
                                    nodes={diagram.nodes}
                                    edges={diagram.edges}
                                    onNodesChange={(changes) => {
                                      syncDiagram((current) => ({
                                        ...current,
                                        nodes: applyNodeChanges(
                                          changes as NodeChange[],
                                          current.nodes,
                                        ),
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
                                    minZoom={0.12}
                                    maxZoom={1.85}
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
                                    <Panel
                                      position="top-right"
                                      className="diagram-floating-panel m-2"
                                    >
                                      <div className="text-muted small text-end bg-white border rounded shadow-sm px-2 py-1">
                                        Arraste para mover · Delete remove aresta selecionada ·
                                        Arestas ficam atrás dos nós; selecione uma para destacar
                                        {diagramSnapToGrid ? (
                                          <> · Malha {DIAGRAM_SNAP_GRID[0]} px</>
                                        ) : null}
                                      </div>
                                    </Panel>
                                  </ReactFlow>
                                ) : (
                                  <div className="p-3 text-muted">
                                    Ajuste o PlantUML abaixo até o preview voltar a ser válido.
                                  </div>
                                )}
                              </div>
                            </Card.Body>
                          </Card>

                          <div className="diagram-code-block mb-2">
                            <Form.Label className="fw-semibold">
                              PlantUML (código — largura total)
                            </Form.Label>
                            <Form.Control
                              as="textarea"
                              rows={14}
                              value={plantuml}
                              onChange={(e) => handlePlantumlChange(e.target.value)}
                              spellCheck={false}
                              className="diagram-plantuml-input font-monospace"
                              aria-label="Código PlantUML do diagrama"
                            />
                            <div className="text-muted small mt-2">
                              Alterações no canvas ou no PlantUML são{' '}
                              <strong>gravadas automaticamente</strong> na sessão após cerca de 1 s
                              (sem mudar o status da etapa). <strong>Salvar código</strong> força
                              gravação imediata com o mesmo conteúdo. No PDF, o diagrama usa uma
                              página dedicada em tela cheia. Use <strong>Reorganizar layout</strong>{' '}
                              para recomputar posições.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <Alert variant="secondary">
                          Valide as UCs (Etapa 2) para liberar a geração do diagrama.
                        </Alert>
                      )}
                    </>
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
                  />

                  <AnalysisReport
                    title={activeSession.title || 'Analise de requisitos'}
                    statusLabel={getStatusLabel(activeSession.statusText)}
                    descriptionText={descriptionText}
                    requirements={requirements}
                    useCases={useCases}
                    diagram={diagram}
                    userStories={userStories}
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
