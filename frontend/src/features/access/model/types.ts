export type AccessRole = 'admin' | 'user';

export type AccessUser = {
  email: string;
  role: AccessRole;
  createdAtText: string;
  updatedAtText: string;
  createdByUid: string;
};
