import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import clsx from "clsx";
import {
  clearVehicleData,
  createUser,
  createVehicle,
  deleteUser,
  deleteVehicle,
  fetchConnectedCount,
  fetchUsers,
  updateVehicleName,
} from "@/api/admin";
import { fetchVehicles } from "@/api/vehicles";
import { ApiError } from "@/api/client";
import { logout } from "@/api/auth";
import { ConfirmModal, PromptModal } from "@/components/ui/Modal";
import { usePresenceStore } from "@/stores/presenceStore";
import { useSessionStore } from "@/stores/sessionStore";

interface AdminPageProps {
  onBack: () => void;
}

export function AdminPage({ onBack }: AdminPageProps) {
  const queryClient = useQueryClient();
  const username = useSessionStore((s) => s.username);
  const isAdmin = useSessionStore((s) => s.isAdmin);
  const clearSession = useSessionStore((s) => s.clearSession);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [userError, setUserError] = useState<string | null>(null);
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<{ id: string; username: string } | null>(
    null,
  );

  const [renameTarget, setRenameTarget] = useState<{ id: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteVehicleTarget, setDeleteVehicleTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [clearVehicleTarget, setClearVehicleTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers,
    enabled: isAdmin,
    staleTime: 0,
  });

  const { data: connectedCountData } = useQuery({
    queryKey: ["admin-connected-count"],
    queryFn: fetchConnectedCount,
    enabled: isAdmin,
    staleTime: 0,
  });

  const hasPresenceSnapshot = usePresenceStore((s) => s.hasSnapshot);
  const liveConnectedIds = usePresenceStore((s) => s.connectedUserIds);
  const liveConnectedCount = usePresenceStore((s) => s.connectedCount);

  const usersWithPresence = users.map((user) => ({
    ...user,
    is_connected: hasPresenceSnapshot
      ? liveConnectedIds.includes(user.id)
      : user.is_connected || liveConnectedIds.includes(user.id),
  }));

  const connectedCount = hasPresenceSnapshot
    ? liveConnectedCount
    : Math.max(
        connectedCountData?.count ?? 0,
        liveConnectedCount,
        usersWithPresence.filter((u) => u.is_connected).length,
      );

  const visibleUsers = connectedOnly
    ? usersWithPresence.filter((u) => u.is_connected)
    : usersWithPresence;

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
    enabled: isAdmin,
  });

  const createUserMutation = useMutation({
    mutationFn: () => createUser(newUsername.trim(), newPassword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setNewUsername("");
      setNewPassword("");
      setUserError(null);
    },
    onError: (err) => setUserError(err instanceof ApiError ? err.message : "Failed to create user"),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteUserTarget(null);
    },
  });

  const createVehicleMutation = useMutation({
    mutationFn: () => createVehicle(`Vehicle ${vehicles.length + 1}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
    onError: (err) =>
      setVehicleError(err instanceof ApiError ? err.message : "Failed to create vehicle"),
  });

  const renameVehicleMutation = useMutation({
    mutationFn: ({ vehicleId, name }: { vehicleId: string; name: string }) =>
      updateVehicleName(vehicleId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setRenameTarget(null);
      setRenameValue("");
    },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: (vehicleId: string) => deleteVehicle(vehicleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setDeleteVehicleTarget(null);
    },
  });

  const clearVehicleMutation = useMutation({
    mutationFn: (vehicleId: string) => clearVehicleData(vehicleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setClearVehicleTarget(null);
    },
  });

  async function handleSignOut() {
    try {
      await logout();
    } catch {
      // clear local state regardless
    }
    clearSession();
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col bg-tesla-bg">
        <header className="flex h-12 items-center gap-4 border-b border-tesla-border bg-tesla-surface px-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded px-2 py-1 text-sm text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
          >
            ← Back
          </button>
          <span className="font-medium text-tesla-text">Admin</span>
        </header>
        <div className="flex flex-1 items-center justify-center text-tesla-muted">
          Admin access required.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-tesla-bg">
      <header className="flex h-12 items-center gap-4 border-b border-tesla-border bg-tesla-surface px-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded px-2 py-1 text-sm text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
        >
          ← Back to app
        </button>
        <span className="font-medium text-tesla-text">Admin</span>
        <div className="ml-auto flex items-center gap-3 text-sm text-tesla-muted">
          <span>{username}</span>
          <button
            type="button"
            onClick={() => setShowSignOutConfirm(true)}
            className="rounded px-2 py-1 transition hover:bg-tesla-border hover:text-tesla-text"
          >
            Sign out
          </button>
        </div>
      </header>

      <ConfirmModal
        open={showSignOutConfirm}
        title="Sign out"
        message="Sign out of Lattice? You will need to log in again to continue."
        confirmLabel="Sign out"
        destructive
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={() => {
          setShowSignOutConfirm(false);
          void handleSignOut();
        }}
      />

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 p-6">
        <section className="rounded-lg border border-tesla-border bg-tesla-surface p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="mb-1 text-lg font-medium text-tesla-text">User management</h2>
              <p className="text-sm text-tesla-muted">Create and remove user accounts.</p>
            </div>
            <div className="rounded-md border border-tesla-border bg-tesla-bg px-3 py-2 text-sm">
              <span className="font-medium text-tesla-text">{connectedCount}</span>
              <span className="text-tesla-muted">
                {" "}
                user{connectedCount === 1 ? "" : "s"} connected
              </span>
            </div>
          </div>
          <label className="mb-4 flex items-center gap-2 text-sm text-tesla-muted">
            <input
              type="checkbox"
              checked={connectedOnly}
              onChange={(e) => setConnectedOnly(e.target.checked)}
              className="rounded border-tesla-border"
            />
            Show connected users only
          </label>
          <form
            className="mb-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newUsername.trim() || newPassword.length < 6) return;
              createUserMutation.mutate();
            }}
          >
            <div>
              <label className="mb-1 block text-xs text-tesla-muted">Username</label>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="rounded border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-tesla-muted">Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
              />
            </div>
            <button
              type="submit"
              disabled={
                createUserMutation.isPending || !newUsername.trim() || newPassword.length < 6
              }
              className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {createUserMutation.isPending ? "Creating…" : "Create user"}
            </button>
          </form>
          {userError && <p className="mb-3 text-sm text-red-400">{userError}</p>}
          <ul className="divide-y divide-tesla-border rounded border border-tesla-border">
            {visibleUsers.map((user) => (
              <li key={user.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-tesla-text">
                  <span
                    className={clsx(
                      "h-2 w-2 shrink-0 rounded-full",
                      user.is_connected ? "bg-emerald-400" : "bg-tesla-border",
                    )}
                    title={user.is_connected ? "Connected" : "Offline"}
                  />
                  {user.username}
                  <span className="text-xs text-tesla-muted">
                    {user.is_connected ? "Connected" : "Offline"}
                  </span>
                  {user.is_admin && (
                    <span className="text-xs text-tesla-muted">(admin)</span>
                  )}
                </span>
                {!user.is_admin && (
                  <button
                    type="button"
                    onClick={() => setDeleteUserTarget({ id: user.id, username: user.username })}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
            {visibleUsers.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-tesla-muted">
                {connectedOnly ? "No users connected right now." : "No users yet."}
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-tesla-border bg-tesla-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-tesla-text">Vehicle management</h2>
              <p className="text-sm text-tesla-muted">Add, rename, and delete vehicles.</p>
            </div>
            <button
              type="button"
              onClick={() => createVehicleMutation.mutate()}
              disabled={createVehicleMutation.isPending}
              className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {createVehicleMutation.isPending ? "Creating…" : "+ New vehicle"}
            </button>
          </div>
          {vehicleError && <p className="mb-3 text-sm text-red-400">{vehicleError}</p>}
          <ul className="divide-y divide-tesla-border rounded border border-tesla-border">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-tesla-text">{vehicle.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setRenameTarget({ id: vehicle.id, currentName: vehicle.name });
                    setRenameValue(vehicle.name);
                  }}
                  className="rounded px-2 py-0.5 text-xs text-tesla-muted hover:bg-tesla-border hover:text-tesla-text"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteVehicleTarget({ id: vehicle.id, name: vehicle.name })}
                  className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-tesla-border"
                >
                  Delete
                </button>
              </li>
            ))}
            {vehicles.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-tesla-muted">No vehicles yet.</li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-tesla-border bg-tesla-surface p-5">
          <h2 className="mb-1 text-lg font-medium text-tesla-text">Database management</h2>
          <p className="mb-4 text-sm text-tesla-muted">
            Permanently delete all data for a vehicle, including revisions, topology, and library
            items.
          </p>
          <ul className="divide-y divide-tesla-border rounded border border-tesla-border">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-tesla-text">{vehicle.name}</span>
                <button
                  type="button"
                  onClick={() => setClearVehicleTarget({ id: vehicle.id, name: vehicle.name })}
                  className={clsx(
                    "rounded border border-red-500/50 px-2 py-0.5 text-xs text-red-300",
                    "hover:bg-red-500/10",
                  )}
                >
                  Clear all data
                </button>
              </li>
            ))}
            {vehicles.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-tesla-muted">No vehicles.</li>
            )}
          </ul>
        </section>
      </main>

      <ConfirmModal
        open={Boolean(deleteUserTarget)}
        title="Delete user"
        message={
          deleteUserTarget ? `Delete user "${deleteUserTarget.username}"?` : ""
        }
        confirmLabel={deleteUserMutation.isPending ? "Deleting…" : "Delete"}
        destructive
        disabled={deleteUserMutation.isPending}
        onCancel={() => setDeleteUserTarget(null)}
        onConfirm={() => {
          if (!deleteUserTarget) return;
          deleteUserMutation.mutate(deleteUserTarget.id);
        }}
      />
      <PromptModal
        open={Boolean(renameTarget)}
        title="Rename vehicle"
        message="Enter a new vehicle name."
        value={renameValue}
        submitLabel={renameVehicleMutation.isPending ? "Saving…" : "Save"}
        disabled={
          !renameTarget ||
          !renameValue.trim() ||
          renameValue.trim() === renameTarget.currentName ||
          renameVehicleMutation.isPending
        }
        onChange={setRenameValue}
        onCancel={() => {
          setRenameTarget(null);
          setRenameValue("");
        }}
        onSubmit={() => {
          if (!renameTarget) return;
          const trimmed = renameValue.trim();
          if (!trimmed || trimmed === renameTarget.currentName) return;
          renameVehicleMutation.mutate({ vehicleId: renameTarget.id, name: trimmed });
        }}
      />
      <ConfirmModal
        open={Boolean(deleteVehicleTarget)}
        title="Delete vehicle"
        message={
          deleteVehicleTarget
            ? `Delete vehicle "${deleteVehicleTarget.name}"? This removes its revisions and instances.`
            : ""
        }
        confirmLabel={deleteVehicleMutation.isPending ? "Deleting…" : "Delete"}
        destructive
        disabled={deleteVehicleMutation.isPending}
        onCancel={() => setDeleteVehicleTarget(null)}
        onConfirm={() => {
          if (!deleteVehicleTarget) return;
          deleteVehicleMutation.mutate(deleteVehicleTarget.id);
        }}
      />
      <ConfirmModal
        open={Boolean(clearVehicleTarget)}
        title="Clear vehicle data"
        message={
          clearVehicleTarget
            ? `Delete all design data and library items tied to vehicle "${clearVehicleTarget.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel={clearVehicleMutation.isPending ? "Clearing…" : "Clear vehicle"}
        destructive
        disabled={clearVehicleMutation.isPending}
        onCancel={() => setClearVehicleTarget(null)}
        onConfirm={() => {
          if (!clearVehicleTarget) return;
          clearVehicleMutation.mutate(clearVehicleTarget.id);
        }}
      />
    </div>
  );
}
