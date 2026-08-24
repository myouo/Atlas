export type ActorRole = "owner" | "viewer";

export interface Actor {
  readonly id: string;
  readonly role: ActorRole;
}

export interface AuthenticatedSession {
  readonly actor: Actor;
  readonly expiresAt: Date;
  readonly id: string;
}

export interface ExternalIdentity {
  readonly provider: "github";
  readonly subject: string;
}
