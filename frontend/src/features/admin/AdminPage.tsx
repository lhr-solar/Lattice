import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import clsx from "clsx";
import {
  clearVehicleData,
  createUser,
  createUsersBulk,
  createVehicle,
  deleteUser,
  deleteUsersBulk,
  deleteVehicle,
  fetchConnectedCount,
  fetchDefaultPassword,
  fetchUsers,
  updateDefaultPassword,
  updateUserPassword,
  updateUsersPasswordBulk,
  updateVehicleName,
} from "@/api/admin";
import { fetchVehicles } from "@/api/vehicles";
import { ApiError } from "@/api/client";
import { logout } from "@/api/auth";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmModal, Modal, PromptModal } from "@/components/ui/Modal";
import { PasswordModeField } from "@/components/ui/PasswordModeField";
import { EyeVisibilityIcon } from "@/components/ui/PasswordInput";
import { usePresenceStore } from "@/stores/presenceStore";
import { useSessionStore } from "@/stores/sessionStore";

interface AdminPageProps {
  onBack: () => void;
}

export function AdminPage({ onBack }: AdminPageProps) {
  const queryClient = useQueryClient();
  const username = useSessionStore((s) => s.username);
  const userId = useSessionStore((s) => s.userId);
  const isAdmin = useSessionStore((s) => s.isAdmin);
  const clearSession = useSessionStore((s) => s.clearSession);

  const [newUsername, setNewUsername] = useState("");
  const [singlePassword, setSinglePassword] = useState("");
  const [singleUseDefaultPassword, setSingleUseDefaultPassword] = useState(true);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkUsernames, setBulkUsernames] = useState("");
  const [bulkPassword, setBulkPassword] = useState("");
  const [bulkUseDefaultPassword, setBulkUseDefaultPassword] = useState(true);
  const [showDefaultPassword, setShowDefaultPassword] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkPasswordOpen, setBulkPasswordOpen] = useState(false);
  const [bulkPasswordValue, setBulkPasswordValue] = useState("");
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [passwordEditTarget, setPasswordEditTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [passwordEditValue, setPasswordEditValue] = useState("");
  const [defaultPasswordEditOpen, setDefaultPasswordEditOpen] = useState(false);
  const [defaultPasswordEditValue, setDefaultPasswordEditValue] = useState("");
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

  const { data: defaultPasswordData } = useQuery({
    queryKey: ["admin-default-password"],
    queryFn: fetchDefaultPassword,
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

  const selectedCount = selectedUserIds.size;
  const allVisibleSelected =
    visibleUsers.length > 0 && visibleUsers.every((u) => selectedUserIds.has(u.id));

  function toggleUserSelection(id: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        for (const user of visibleUsers) next.delete(user.id);
        return next;
      });
      return;
    }
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      for (const user of visibleUsers) next.add(user.id);
      return next;
    });
  }

  const selectedDeletableIds = [...selectedUserIds].filter((id) => {
    const user = usersWithPresence.find((u) => u.id === id);
    return user && !user.is_admin && id !== userId;
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
    enabled: isAdmin,
  });

  function parseUsernames(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const name = line.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  }

  const createSingleUserMutation = useMutation({
    mutationFn: () =>
      createUser(newUsername.trim(), singleUseDefaultPassword ? undefined : singlePassword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setNewUsername("");
      setSinglePassword("");
      setSingleUseDefaultPassword(true);
      setUserError(null);
      setUserSuccess("User created");
    },
    onError: (err) => {
      setUserSuccess(null);
      setUserError(err instanceof ApiError ? err.message : "Failed to create user");
    },
  });

  const createUsersMutation = useMutation({
    mutationFn: () => {
      const usernames = parseUsernames(bulkUsernames);
      if (!usernames.length) throw new Error("Enter at least one username");
      return createUsersBulk(usernames, bulkUseDefaultPassword ? undefined : bulkPassword);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setBulkAddOpen(false);
      setBulkUsernames("");
      setBulkPassword("");
      setBulkUseDefaultPassword(true);
      setUserError(null);
      const parts: string[] = [];
      if (result.created.length) parts.push(`Created ${result.created.length} user(s)`);
      if (result.skipped_usernames.length) {
        parts.push(`Skipped ${result.skipped_usernames.length} existing username(s)`);
      }
      setUserSuccess(parts.join(". ") || "No users created");
    },
    onError: (err) => {
      setUserSuccess(null);
      setUserError(err instanceof ApiError ? err.message : "Failed to create users");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteUsersBulk(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setSelectedUserIds(new Set());
      setBulkDeleteConfirmOpen(false);
      setUserError(null);
      setUserSuccess(
        result.failed
          ? `Deleted ${result.succeeded} user(s). ${result.failed} could not be deleted.`
          : `Deleted ${result.succeeded} user(s)`,
      );
    },
    onError: (err) => {
      setUserSuccess(null);
      setUserError(err instanceof ApiError ? err.message : "Failed to delete users");
    },
  });

  const bulkPasswordMutation = useMutation({
    mutationFn: ({ ids, password }: { ids: string[]; password: string }) =>
      updateUsersPasswordBulk(ids, password),
    onSuccess: (result) => {
      setBulkPasswordOpen(false);
      setBulkPasswordValue("");
      setSelectedUserIds(new Set());
      setUserError(null);
      setUserSuccess(`Updated password for ${result.succeeded} user(s)`);
    },
    onError: (err) => {
      setUserSuccess(null);
      setUserError(err instanceof ApiError ? err.message : "Failed to update passwords");
    },
  });

  const updateUserPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      updateUserPassword(userId, password),
    onSuccess: () => {
      setPasswordEditTarget(null);
      setPasswordEditValue("");
      setUserError(null);
    },
    onError: (err) =>
      setUserError(err instanceof ApiError ? err.message : "Failed to update password"),
  });

  const updateDefaultPasswordMutation = useMutation({
    mutationFn: (password: string) => updateDefaultPassword(password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-default-password"] });
      setDefaultPasswordEditOpen(false);
      setDefaultPasswordEditValue("");
      setUserError(null);
    },
    onError: (err) =>
      setUserError(err instanceof ApiError ? err.message : "Failed to update default password"),
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
      <div className="flex h-screen flex-col overflow-hidden bg-tesla-bg">
        <header className="flex h-12 shrink-0 items-center gap-4 border-b border-tesla-border bg-tesla-surface px-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded px-2 py-1 text-sm text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
          >
            ← Back
          </button>
          <span className="font-medium text-tesla-text">Admin</span>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto text-tesla-muted">
          Admin access required.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-tesla-bg">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-tesla-border bg-tesla-surface px-4">
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

      <main className="mx-auto min-h-0 w-full max-w-4xl flex-1 space-y-8 overflow-y-auto p-6">
        <section className="rounded-lg border border-tesla-border bg-tesla-surface p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-tesla-border bg-tesla-bg px-3 py-2">
            <span className="text-sm text-tesla-muted">Default password for new users:</span>
            {showDefaultPassword ? (
              <span className="font-mono text-sm text-tesla-text">
                {defaultPasswordData?.password ?? "…"}
              </span>
            ) : (
              <span className="font-mono text-sm tracking-widest text-tesla-muted">••••••</span>
            )}
            <button
              type="button"
              onClick={() => setShowDefaultPassword((v) => !v)}
              className="rounded p-1 text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
              aria-label={showDefaultPassword ? "Hide default password" : "Show default password"}
            >
              <span className="block h-4 w-4">
                <EyeVisibilityIcon hidden={showDefaultPassword} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDefaultPasswordEditValue(defaultPasswordData?.password ?? "");
                setDefaultPasswordEditOpen(true);
              }}
              className="rounded px-2 py-1 text-xs text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
            >
              Edit default password
            </button>
          </div>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="mb-1 text-lg font-medium text-tesla-text">User management</h2>
              <p className="text-sm text-tesla-muted">
                Add, edit, and remove users individually or in bulk.
              </p>
            </div>
            <div className="rounded-md border border-tesla-border bg-tesla-bg px-3 py-2 text-sm">
              <span className="font-medium text-tesla-text">{connectedCount}</span>
              <span className="text-tesla-muted">
                {" "}
                user{connectedCount === 1 ? "" : "s"} connected
              </span>
            </div>
          </div>
          <div className="mb-4">
            <Checkbox
              checked={connectedOnly}
              onChange={setConnectedOnly}
              label="Show connected users only"
            />
          </div>
          <form
            className="mb-4 rounded border border-tesla-border bg-tesla-bg p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newUsername.trim()) return;
              if (!singleUseDefaultPassword && singlePassword.length < 6) return;
              createSingleUserMutation.mutate();
            }}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex w-40 flex-col gap-1.5">
                <label className="text-xs text-tesla-muted">Username</label>
                <input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="h-8 rounded border border-tesla-border bg-tesla-surface px-3 text-sm outline-none focus:border-tesla-accent"
                />
              </div>
              <PasswordModeField
                useDefault={singleUseDefaultPassword}
                onModeChange={setSingleUseDefaultPassword}
                password={singlePassword}
                onPasswordChange={setSinglePassword}
                defaultPassword={defaultPasswordData?.password ?? ""}
                inputClassName="bg-tesla-surface"
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-tesla-muted opacity-0 select-none" aria-hidden>
                  Actions
                </span>
                <div className="flex h-8 items-center gap-3">
                <button
                  type="submit"
                  disabled={
                    createSingleUserMutation.isPending ||
                    !newUsername.trim() ||
                    (!singleUseDefaultPassword && singlePassword.length < 6)
                  }
                  className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  {createSingleUserMutation.isPending ? "Creating…" : "Add user"}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAddOpen(true)}
                  className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
                >
                  Bulk add…
                </button>
                </div>
              </div>
            </div>
          </form>
          {userError && <p className="mb-3 text-sm text-red-400">{userError}</p>}
          {userSuccess && <p className="mb-3 text-sm text-emerald-400">{userSuccess}</p>}
          {selectedCount > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-tesla-accent/40 bg-tesla-accent/10 px-3 py-2 text-sm">
              <span className="text-tesla-text">{selectedCount} selected</span>
              <button
                type="button"
                onClick={() => setBulkPasswordOpen(true)}
                className="rounded px-2 py-1 text-xs text-tesla-text transition hover:bg-tesla-border"
              >
                Set password…
              </button>
              <button
                type="button"
                onClick={() => setBulkDeleteConfirmOpen(true)}
                disabled={selectedDeletableIds.length === 0}
                className="rounded px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
              >
                Delete selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedUserIds(new Set())}
                className="ml-auto rounded px-2 py-1 text-xs text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
              >
                Clear selection
              </button>
            </div>
          )}
          <ul className="divide-y divide-tesla-border rounded border border-tesla-border">
            <li className="flex items-center gap-3 px-3 py-2 text-xs text-tesla-muted">
              <Checkbox
                checked={allVisibleSelected}
                onChange={() => toggleSelectAllVisible()}
                size="sm"
              />
              <span className="flex-1">Select all visible</span>
            </li>
            {visibleUsers.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-tesla-text">
                  <Checkbox
                    checked={selectedUserIds.has(user.id)}
                    onChange={() => toggleUserSelection(user.id)}
                    size="sm"
                  />
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
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordEditTarget({ id: user.id, username: user.username });
                      setPasswordEditValue("");
                    }}
                    className="text-xs text-tesla-muted hover:text-tesla-text"
                  >
                    Edit password
                  </button>
                  {!user.is_admin && (
                    <button
                      type="button"
                      onClick={() => setDeleteUserTarget({ id: user.id, username: user.username })}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  )}
                </span>
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

      <PromptModal
        open={Boolean(passwordEditTarget)}
        title={
          passwordEditTarget ? `Change password for ${passwordEditTarget.username}` : "Change password"
        }
        message="Enter a new password (min 6 characters). Active sessions for this user will be signed out."
        value={passwordEditValue}
        inputType="password"
        submitLabel={updateUserPasswordMutation.isPending ? "Saving…" : "Save"}
        disabled={passwordEditValue.length < 6 || updateUserPasswordMutation.isPending}
        onChange={setPasswordEditValue}
        onCancel={() => {
          setPasswordEditTarget(null);
          setPasswordEditValue("");
        }}
        onSubmit={() => {
          if (!passwordEditTarget || passwordEditValue.length < 6) return;
          updateUserPasswordMutation.mutate({
            userId: passwordEditTarget.id,
            password: passwordEditValue,
          });
        }}
      />
      <Modal
        open={bulkAddOpen}
        title="Bulk add users"
        onClose={() => setBulkAddOpen(false)}
        panelClassName="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setBulkAddOpen(false)}
              className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                createUsersMutation.isPending ||
                !parseUsernames(bulkUsernames).length ||
                (!bulkUseDefaultPassword && bulkPassword.length < 6)
              }
              onClick={() => createUsersMutation.mutate()}
              className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition disabled:opacity-40"
            >
              {createUsersMutation.isPending ? "Adding…" : "Add users"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p>Enter one username per line. All users receive the same password.</p>
          <textarea
            value={bulkUsernames}
            onChange={(e) => setBulkUsernames(e.target.value)}
            rows={6}
            placeholder={"tech1\ntech2\ntech3"}
            className="w-full rounded border border-tesla-border bg-tesla-bg px-3 py-2 text-sm text-tesla-text outline-none focus:border-tesla-accent"
          />
          <PasswordModeField
            useDefault={bulkUseDefaultPassword}
            onModeChange={setBulkUseDefaultPassword}
            password={bulkPassword}
            onPasswordChange={setBulkPassword}
            defaultPassword={defaultPasswordData?.password ?? ""}
            label="Password for all users"
          />
        </div>
      </Modal>
      <PromptModal
        open={bulkPasswordOpen}
        title={`Set password for ${selectedCount} user(s)`}
        message="All selected users will receive this password. Active sessions will be signed out."
        value={bulkPasswordValue}
        inputType="password"
        submitLabel={bulkPasswordMutation.isPending ? "Saving…" : "Apply to selected"}
        disabled={bulkPasswordValue.length < 6 || bulkPasswordMutation.isPending}
        onChange={setBulkPasswordValue}
        onCancel={() => {
          setBulkPasswordOpen(false);
          setBulkPasswordValue("");
        }}
        onSubmit={() => {
          if (bulkPasswordValue.length < 6 || selectedCount === 0) return;
          bulkPasswordMutation.mutate({
            ids: [...selectedUserIds],
            password: bulkPasswordValue,
          });
        }}
      />
      <ConfirmModal
        open={bulkDeleteConfirmOpen}
        title="Delete selected users"
        message={`Delete ${selectedDeletableIds.length} user(s)? Admin accounts and your own account are skipped.`}
        confirmLabel={bulkDeleteMutation.isPending ? "Deleting…" : "Delete"}
        destructive
        disabled={bulkDeleteMutation.isPending || selectedDeletableIds.length === 0}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => bulkDeleteMutation.mutate(selectedDeletableIds)}
      />
      <PromptModal
        open={defaultPasswordEditOpen}
        title="Edit default password"
        message="New users created with “Use default password” will receive this password."
        value={defaultPasswordEditValue}
        inputType="password"
        submitLabel={updateDefaultPasswordMutation.isPending ? "Saving…" : "Save"}
        disabled={
          defaultPasswordEditValue.length < 6 || updateDefaultPasswordMutation.isPending
        }
        onChange={setDefaultPasswordEditValue}
        onCancel={() => {
          setDefaultPasswordEditOpen(false);
          setDefaultPasswordEditValue("");
        }}
        onSubmit={() => {
          if (defaultPasswordEditValue.length < 6) return;
          updateDefaultPasswordMutation.mutate(defaultPasswordEditValue);
        }}
      />
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
