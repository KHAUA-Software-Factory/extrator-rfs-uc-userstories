import { useEffect, useMemo, useState } from 'react';
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
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';

import { auth, googleProvider } from './firebase';
import {
  createDemoAuthUser,
  clearActiveDemoUser,
  DEMO_USERS,
  demoAuthEnabled,
  getActiveDemoUser,
  isDemoAuthUser,
  setActiveDemoUser,
  type AppUser,
  type DemoUserProfile,
} from './demoAuth';
import {
  extractRequirements,
  generateUseCases,
  generateUserStories,
  type FunctionalRequirement,
  type UseCase,
  type UserStory,
} from './api';
import {
  createSession,
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
import 'reactflow/dist/style.css';

type NewEdgeKind = 'association' | 'include' | 'extend';

type ProcessingState = {
  title: string;
  detail: string;
  step: number;
  total: number;
};

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
};

function getStatusLabel(statusText: string | undefined) {
  const status = String(statusText || 'draft');
  return STATUS_LABELS[status] || status;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
      strokeWidth: 2,
      strokeDasharray: '7 5',
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
  const [user, setUser] = useState<AppUser | null>(null);
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
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [generatingStories, setGeneratingStories] = useState(false);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const wizard = useAnalysisWizard(activeSession?.statusText);

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
        const demoProfile = !u && demoAuthEnabled ? getActiveDemoUser() : null;
        const nextUser = u || (demoProfile ? createDemoAuthUser(demoProfile) : null);
        setUser(nextUser);
        setLoading(false);
        if (nextUser) {
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

  function handleDemoLogin(profile: DemoUserProfile) {
    setError('');
    setActiveDemoUser(profile);
    setUser(createDemoAuthUser(profile));
    setLoading(false);
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
  }

  async function handleLogout() {
    setError('');
    showProcessing('Encerrando sessão', 'Saindo da conta atual.', 1, 1);
    try {
      if (isDemoAuthUser(user)) {
        clearActiveDemoUser();
        setUser(null);
        setIsAdmin(false);
        setAccessRole(null);
        setSessions([]);
        setAccessUsers([]);
        setActiveSession(null);
        setActiveView('dashboard');
      } else {
        await signOut(auth);
      }
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
      showProcessing('Salvando acesso', 'Recarregando usuários cadastrados.', 2, 2);
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
      const items = isAdmin ? await listAllSessionsAsAdmin() : await listMySessions();
      setSessions(items);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleSelectSession(item: SessionListItem) {
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
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleSaveDescription() {
    if (!activeSession) return;
    setError('');
    showProcessing('Salvando descrição', 'Registrando o texto inicial da análise.', 1, 1);
    try {
      await updateSession(activeSession.uid, activeSession.id, { descriptionText });
      setActiveSession({ ...activeSession, descriptionText });
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
    return `UC${String(max + 1).padStart(3, '0')}`;
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
    if (!activeSession) return;
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
      const result = await extractRequirements({ text: descriptionText });
      showProcessing('Etapa 1: requisitos funcionais', 'Organizando requisitos retornados.', 3, 4);
      setRequirements(result.requisitos_funcionais);
      setUseCases([]);
      setPlantuml('');
      setDiagram(null);
      setUserStories([]);
      const requirementsText = JSON.stringify(result.requisitos_funcionais);
      showProcessing('Etapa 1: requisitos funcionais', 'Salvando requisitos na sessão.', 4, 4);
      await updateSession(activeSession.uid, activeSession.id, {
        descriptionText,
        requirementsText,
        useCasesText: '',
        plantumlText: '',
        diagramModelText: '',
        userStoriesText: '',
        statusText: 'requirements_generated',
      });
      setActiveSession({
        ...activeSession,
        descriptionText,
        requirementsText,
        useCasesText: '',
        plantumlText: '',
        diagramModelText: '',
        userStoriesText: '',
        statusText: 'requirements_generated',
      });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setExtracting(false);
      setProcessing(null);
    }
  }

  async function handleValidateRequirements() {
    if (!activeSession) return;
    setError('');
    showProcessing('Validando requisitos', 'Salvando requisitos revisados.', 1, 2);
    try {
      const requirementsText = JSON.stringify(requirements);
      await updateSession(activeSession.uid, activeSession.id, {
        requirementsText,
        useCasesText: '',
        plantumlText: '',
        diagramModelText: '',
        userStoriesText: '',
        statusText: 'requirements_validated',
      });
      showProcessing('Validando requisitos', 'Liberando a etapa de casos de uso.', 2, 2);
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
    if (!activeSession) return;
    setError('');
    setGeneratingUseCases(true);
    showProcessing('Etapa 2: casos de uso', 'Enviando requisitos validados para a IA.', 1, 4);
    try {
      const result = await generateUseCases({ requisitos_funcionais: requirements });
      showProcessing('Etapa 2: casos de uso', 'Normalizando casos de uso e relações.', 2, 4);
      const normalizedUseCases = result.casos_de_uso.map(normalizeUseCase);
      setUseCases(normalizedUseCases);
      const useCasesText = JSON.stringify(normalizedUseCases);
      showProcessing('Etapa 2: casos de uso', 'Salvando casos de uso gerados.', 3, 4);
      await updateSession(activeSession.uid, activeSession.id, {
        useCasesText,
        statusText: 'use_cases_generated',
      });
      showProcessing('Etapa 2: casos de uso', 'Atualizando a tela de edição.', 4, 4);
      setActiveSession({ ...activeSession, useCasesText, statusText: 'use_cases_generated' });
      setPhase(2);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setGeneratingUseCases(false);
      setProcessing(null);
    }
  }

  async function handleValidateUseCases() {
    if (!activeSession) return;
    setError('');
    showProcessing('Validando casos de uso', 'Salvando UCs e relações revisadas.', 1, 2);
    try {
      const normalizedUseCases = useCases.map(normalizeUseCase);
      const useCasesText = JSON.stringify(normalizedUseCases);
      await updateSession(activeSession.uid, activeSession.id, {
        useCasesText,
        statusText: 'use_cases_validated',
      });
      showProcessing('Validando casos de uso', 'Liberando a etapa de diagrama.', 2, 2);
      setUseCases(normalizedUseCases);
      setActiveSession({ ...activeSession, useCasesText, statusText: 'use_cases_validated' });
      setPhase(3);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  }

  async function handleGenerateUml() {
    if (!activeSession) return;
    setError('');
    setGeneratingUml(true);
    showProcessing('Etapa 3: diagrama', 'Montando nós a partir dos casos de uso.', 1, 4);
    try {
      const model = buildDiagramModelFromUseCases(useCases, activeSession.title || 'Sistema');
      showProcessing('Etapa 3: diagrama', 'Aplicando associações, include e extend.', 2, 4);
      const nextPlantuml = diagramModelToPlantuml(model);
      setPlantuml(nextPlantuml);
      setDiagram(model);
      const diagramModelText = JSON.stringify(model);
      showProcessing('Etapa 3: diagrama', 'Salvando modelo gráfico e PlantUML.', 3, 4);
      await updateSession(activeSession.uid, activeSession.id, {
        plantumlText: nextPlantuml,
        diagramModelText,
        statusText: 'uml_generated',
      });
      showProcessing('Etapa 3: diagrama', 'Atualizando editor visual.', 4, 4);
      setActiveSession({
        ...activeSession,
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
      const next = updater(current);
      setPlantuml(diagramModelToPlantuml(next));
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
    if (!activeSession) return;
    setError('');
    setSavingDiagram(true);
    showProcessing(
      statusText === 'uml_validated' ? 'Validando diagrama' : 'Salvando diagrama',
      'Convertendo o modelo gráfico para PlantUML.',
      1,
      3,
    );
    try {
      const model = diagram || plantumlToDiagramModel(plantuml);
      const nextPlantuml = diagramModelToPlantuml(model);
      const diagramModelText = JSON.stringify(model);
      const nextStatus = statusText || activeSession.statusText;

      showProcessing(
        statusText === 'uml_validated' ? 'Validando diagrama' : 'Salvando diagrama',
        'Persistindo diagrama na sessão.',
        2,
        3,
      );
      await updateSession(activeSession.uid, activeSession.id, {
        plantumlText: nextPlantuml,
        diagramModelText,
        statusText: nextStatus,
      });

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
        ...activeSession,
        plantumlText: nextPlantuml,
        diagramModelText,
        statusText: nextStatus,
      });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSavingDiagram(false);
      setProcessing(null);
    }
  }

  async function handleSaveDiagramCode() {
    await persistDiagram();
  }

  async function handleValidateUml() {
    await persistDiagram('uml_validated');
    setPhase(4);
  }

  async function handleGenerateUserStories() {
    if (!activeSession) return;
    setError('');
    setGeneratingStories(true);
    showProcessing('Etapa 4: user stories', 'Preparando diagrama validado para a IA.', 1, 4);
    try {
      const sourcePlantuml = plantuml.trim()
        ? plantuml
        : diagram
          ? diagramModelToPlantuml(diagram)
          : '';
      if (!sourcePlantuml) throw new Error('missing_plantuml');
      showProcessing('Etapa 4: user stories', 'Gerando user stories e critérios de aceite.', 2, 4);
      const result = await generateUserStories({ plantuml: sourcePlantuml });
      showProcessing('Etapa 4: user stories', 'Organizando histórias retornadas.', 3, 4);
      setUserStories(result.user_stories);
      const userStoriesText = JSON.stringify(result.user_stories);
      showProcessing('Etapa 4: user stories', 'Salvando user stories na sessão.', 4, 4);
      await updateSession(activeSession.uid, activeSession.id, {
        userStoriesText,
        statusText: 'user_stories_generated',
      });
      setActiveSession({ ...activeSession, userStoriesText, statusText: 'user_stories_generated' });
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

  function handleExportPdf() {
    if (!activeSession || !userStories.length) return;
    const previousTitle = document.title;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };

    setError('');
    document.title = `${activeSession.title || 'Extrator de Engenharia de Software'} - Relatorio`;
    window.addEventListener('afterprint', restoreTitle);
    window.print();
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
        type: 'smoothstep',
        style: {
          stroke: '#64748b',
          strokeWidth: 1.7,
        },
      };
    }

    return {
      ...connection,
      id: `rel:${source}..>${target}:${relationType}:${Date.now()}`,
      type: 'smoothstep',
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
      setDiagram(plantumlToDiagramModel(value));
    } catch {
      // Keep the last valid diagram while the user is editing the code.
    }
  }

  const phaseLocked = wizard.phaseLocked;

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
                    <strong>(admin)</strong>
                  ) : accessRole === 'user' ? (
                    <span>(usuário)</span>
                  ) : (
                    <span>(sem acesso)</span>
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
                  <Nav.Link
                    eventKey="users"
                    onClick={() => {
                      setActiveView('users');
                      setSidebarOpen(false);
                    }}
                    disabled={!isAdmin}
                  >
                    Gestão de usuários
                  </Nav.Link>
                  <Nav.Link
                    eventKey="workspace"
                    onClick={() => {
                      setActiveView('workspace');
                      setSidebarOpen(false);
                    }}
                    disabled={!activeSession}
                  >
                    Workspace
                  </Nav.Link>
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
                                  <div className="mt-2 d-flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline-primary"
                                      onClick={() => handleSelectSession(s)}
                                    >
                                      Editar
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
                        Cadastre Gmail e nível de acesso: admin vê todos, user vê só o próprio.
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
                                  void saveAccessUser(
                                    item.email,
                                    event.target.value as AccessRole,
                                  ).then(refreshAccessUsers);
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
                      <Stack direction="horizontal" gap={2} className="action-bar mb-3">
                        <Button
                          onClick={handleGenerateUml}
                          disabled={
                            generatingUml ||
                            !useCases.length ||
                            activeSession.statusText !== 'use_cases_validated'
                          }
                        >
                          {generatingUml ? 'Gerando…' : 'Gerar diagrama'}
                        </Button>
                        <Button
                          variant="outline-primary"
                          onClick={handleSaveDiagramCode}
                          disabled={savingDiagram || !plantuml.trim()}
                        >
                          {savingDiagram ? 'Salvando…' : 'Salvar código'}
                        </Button>
                        <Button
                          variant="outline-secondary"
                          onClick={handleDownloadDiagramXml}
                          disabled={!diagram}
                        >
                          Baixar XML
                        </Button>
                        <Button
                          variant="success"
                          onClick={handleValidateUml}
                          disabled={savingDiagram || !diagram || !plantuml.trim()}
                        >
                          Validar diagrama
                        </Button>
                        <div className="status-pill text-muted small ms-auto">
                          status: <code>{getStatusLabel(activeSession.statusText)}</code>
                        </div>
                      </Stack>

                      {plantuml.trim() ? (
                        <>
                          {relationRows.length ? (
                            <div className="mb-3">
                              <div className="text-muted small mb-1">
                                Relações include/extend editáveis
                              </div>
                              <Table bordered size="sm" responsive>
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
                                          Remover
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </Table>
                            </div>
                          ) : null}

                          <Row className="g-3">
                            <Col md={6}>
                              <Form.Label>PlantUML salvo no Firestore</Form.Label>
                              <Form.Control
                                as="textarea"
                                rows={12}
                                value={plantuml}
                                onChange={(e) => handlePlantumlChange(e.target.value)}
                              />
                            </Col>
                            <Col md={6}>
                              <Stack direction="horizontal" gap={2} className="action-bar mb-2">
                                <div className="text-muted small">Edição gráfica</div>
                                <Form.Select
                                  size="sm"
                                  className="edge-kind-select ms-auto"
                                  value={newEdgeKind}
                                  onChange={(e) => setNewEdgeKind(e.target.value as NewEdgeKind)}
                                >
                                  <option value="association">Nova conexão: associação</option>
                                  <option value="include">Nova conexão: include</option>
                                  <option value="extend">Nova conexão: extend</option>
                                </Form.Select>
                              </Stack>
                              <div className="diagram-canvas border rounded">
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
                                    fitView
                                  >
                                    <Background />
                                    <Controls />
                                  </ReactFlow>
                                ) : (
                                  <div className="p-3 text-muted">
                                    Gere ou cole PlantUML acima para editar.
                                  </div>
                                )}
                              </div>
                              <div className="text-muted small mt-2">
                                O modelo gráfico fica salvo junto para preservar ajustes manuais de
                                posição.
                              </div>
                            </Col>
                          </Row>
                        </>
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
            {demoAuthEnabled ? (
              <div className="demo-login-panel mt-3">
                <div className="text-muted small mb-2">Acesso demo</div>
                <Stack direction="horizontal" gap={2} className="flex-wrap">
                  {DEMO_USERS.map((profile) => (
                    <Button
                      key={profile.uid}
                      variant={profile.admin ? 'outline-primary' : 'outline-secondary'}
                      onClick={() => handleDemoLogin(profile)}
                    >
                      {profile.displayName} ({profile.admin ? 'admin' : 'user'})
                    </Button>
                  ))}
                </Stack>
              </div>
            ) : null}
          </section>
        )}
      </Container>
    </>
  );
}

export default App;
