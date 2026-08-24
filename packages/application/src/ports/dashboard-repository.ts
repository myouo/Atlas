import type {
  DashboardDraftInput,
  DashboardRevisionIdentity,
  DashboardRevisionOperation,
  DashboardRevisionPage,
  DashboardRevisionSnapshot,
  DashboardSlug,
  DashboardSnapshot,
  DashboardStateKind
} from "@nivalis/domain";

export interface CreateDraftRevisionCommand {
  readonly expectedRevisionId: string;
  readonly input: DashboardDraftInput;
  readonly now: Date;
  readonly operation: DashboardRevisionOperation;
  readonly restoredFromRevisionId?: string;
}

export type RevisionMutationResult =
  | { readonly kind: "success"; readonly dashboard: DashboardSnapshot }
  | { readonly kind: "conflict"; readonly current: DashboardRevisionIdentity };

export interface DashboardRepository {
  createDraftRevisionForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    command: CreateDraftRevisionCommand
  ): Promise<RevisionMutationResult>;
  getCurrentBySlug(
    dashboardSlug: DashboardSlug,
    state: DashboardStateKind
  ): Promise<DashboardSnapshot | null>;
  getCurrentForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    state: DashboardStateKind
  ): Promise<DashboardSnapshot | null>;
  getRevisionForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    revisionId: string
  ): Promise<DashboardRevisionSnapshot | null>;
  listRevisionsForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    options: { readonly beforeRevisionNumber?: number; readonly limit: number }
  ): Promise<DashboardRevisionPage>;
  ping(): Promise<void>;
  publishCurrentDraftForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    expectedRevisionId: string,
    now: Date
  ): Promise<RevisionMutationResult>;
}

export type DashboardConfigurationReader = Pick<
  DashboardRepository,
  "getCurrentBySlug" | "getCurrentForOwner"
>;

export interface DashboardUnitOfWork {
  run<T>(work: (repository: DashboardRepository) => Promise<T>): Promise<T>;
}

export interface Clock {
  now(): Date;
}
