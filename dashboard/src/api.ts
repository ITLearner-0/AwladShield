export type AgeBand = "7-10" | "11-14" | "15-17";

export interface SetupStatus {
  needsSetup: boolean;
}

export interface Enrollment {
  parentId: string;
  otpauthUrl: string;
  backupCodes: string[];
}

export interface Parent {
  parentId: string;
  displayName: string;
}

export interface Child {
  id: string;
  displayName: string;
  ageBand: AgeBand;
}

export interface Device {
  id: string;
  childId: string;
  name: string;
  os: string;
  lastSeenAt: string | null;
  online: boolean;
}

export interface PairingCode {
  code: string;
  expiresAt: string;
}

export interface Credentials {
  email: string;
  password: string;
  totp: string;
}

export interface NewParent {
  email: string;
  displayName: string;
  password: string;
}

export interface NewChild {
  displayName: string;
  ageBand: AgeBand;
}

/** Erreur d'API : ne porte qu'un code HTTP, jamais le détail serveur. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`api_error_${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError(0);
  }
  if (!res.ok) throw new ApiError(res.status);
  const text = await res.text();
  return (text ? (JSON.parse(text) as T) : (undefined as T));
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request<SetupStatus>("/api/setup/status");
}

export function setup(input: NewParent): Promise<Enrollment> {
  return request<Enrollment>("/api/setup", { method: "POST", body: JSON.stringify(input) });
}

export function confirmSetup(parentId: string, token: string): Promise<void> {
  return request<void>("/api/setup/confirm", { method: "POST", body: JSON.stringify({ parentId, token }) });
}

export function login(credentials: Credentials): Promise<Parent> {
  return request<Parent>("/api/auth/login", { method: "POST", body: JSON.stringify(credentials) });
}

export function logout(): Promise<void> {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function getChildren(): Promise<Child[]> {
  return request<Child[]>("/api/children");
}

export function createChild(input: NewChild): Promise<{ id: string }> {
  return request<{ id: string }>("/api/children", { method: "POST", body: JSON.stringify(input) });
}

export function createPairingCode(input: { childId: string; deviceName: string }): Promise<PairingCode> {
  return request<PairingCode>("/api/pairing/code", { method: "POST", body: JSON.stringify(input) });
}

export function getDevices(): Promise<Device[]> {
  return request<Device[]>("/api/devices");
}

export function addParent(input: NewParent): Promise<Enrollment> {
  return request<Enrollment>("/api/parents", { method: "POST", body: JSON.stringify(input) });
}
