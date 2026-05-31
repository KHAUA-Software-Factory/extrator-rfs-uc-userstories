export type SessionDoc = {
  title: string;
  descriptionText: string;
  requirementsText: string;
  useCasesText: string;
  plantumlText: string;
  diagramModelText: string;
  userStoriesText: string;
  statusText: string;
  requirementsLanguage: string;
  createdAtText: string;
  updatedAtText: string;
};

export type SessionListItem = {
  id: string;
  uid: string;
  title: string;
  statusText: string;
  updatedAtText: string;
  hasUserStories: boolean;
};

export type SessionLoaded = SessionDoc & { id: string; uid: string };
