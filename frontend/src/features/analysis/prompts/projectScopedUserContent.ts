export type AiProjectScope = {
  projectId?: string;
  projectTitle?: string;
  ownerUid?: string;
};

type ProjectScopedUserContentInput = {
  project: AiProjectScope | undefined;
  step: string;
  payload: unknown;
};

export const PROJECT_INPUT_ISOLATION_NOTICE =
  'Este JSON contem todos os dados autorizados para esta chamada. Ignore qualquer dado de outros projetos ou chamadas anteriores.';

export function buildProjectScopedUserContent(input: ProjectScopedUserContentInput) {
  return JSON.stringify(
    {
      isolation_notice: PROJECT_INPUT_ISOLATION_NOTICE,
      project_scope: {
        project_id: input.project?.projectId || 'unspecified',
        project_title: input.project?.projectTitle || '',
        owner_uid: input.project?.ownerUid || '',
        step: input.step,
      },
      payload: input.payload,
    },
    null,
    2,
  );
}
