export interface IInvitePeoplePayload {
  invitations: Record<string, string[]>;
  groupId: string;
}

export interface IInvitePeopleResponse {
  isSuccess: boolean;
  errors: null | { exceed_limit: string };
}

export interface IResendInvitation {
  email: string;
  groupId: string;
}

export interface IRemoveAccess {
  userIds: string[];
  projectKey: string;
}

export interface IRemoveEnvironmentAccess {
  email: string;
  projectKeys: string[];
  groupId: string;
}

export interface IConfirmInvitation {
  code: string;
}
export interface SharedEnvironment {
  itemId: string;
  tenantId: string;
  isInvitationSent: boolean;
  isInvitationConfirmed: boolean;
  isCreator: boolean;
  /**
   * @deprecated The API historically emits the misspelled key `enviroment`.
   * Read `environment` instead; this is kept so existing payloads still bind.
   */
  enviroment?: string;
  environment?: string;
}

export interface PeopleDetails {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  profileImageUrl: string | null;
  userId: string;
  allowResendActivation: boolean;
}

export interface PeopleGroupedByEnvironments {
  peopleDetails: PeopleDetails;
  /**
   * @deprecated Misspelled wire key; use `sharedEnvironments`. Kept so existing payloads still bind.
   */
  sharedEnviroments?: SharedEnvironment[];
  sharedEnvironments?: SharedEnvironment[];
}

// Legacy interface for backward compatibility
export interface People {
  itemId: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  profileImageUrl: string;
  userId: string;
  tenantId: string;
  role: string;
  isInvitationSent: boolean;
  isInvitationConfirmed: boolean;
  isCreator: boolean;
}
