export type ProjectionLevel = "vehicle" | "enclosure" | "node" | "connector" | "pin";

export interface DesignNodeDto {
  id: string;
  kind: string;
  label: string;
  parent_id?: string | null;
  position?: { x: number; y: number } | null;
  data: Record<string, unknown>;
}

export interface DesignEdgeDto {
  id: string;
  source: string;
  target: string;
  kind: string;
  label?: string | null;
  data: Record<string, unknown>;
}

export interface DesignGraphProjectionDto {
  revision_id: string;
  level: ProjectionLevel;
  view_key: string;
  nodes: DesignNodeDto[];
  edges: DesignEdgeDto[];
  bus_groups: Array<{
    id: string;
    label: string;
    signal_ids: string[];
    edge_ids: string[];
    collapsed: boolean;
  }>;
  meta: Record<string, unknown>;
}

export interface Vehicle {
  id: string;
  name: string;
  description: string | null;
  current_revision_id: string | null;
  current_revision_number?: number | null;
  current_revision_label?: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface User {
  id: string;
  username: string;
  is_admin: boolean;
}

export interface AdminUser extends User {
  is_connected: boolean;
}

export interface AuthResponse {
  user: User;
}
