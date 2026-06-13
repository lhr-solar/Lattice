interface InstanceRenameFieldsProps {
  draft: string;
  libraryName: string;
  placeholder?: string;
  disabled?: boolean;
  onDraftChange: (value: string) => void;
  onUseLibraryName: () => void;
}

export function InstanceRenameFields({
  draft,
  libraryName,
  placeholder,
  disabled,
  onDraftChange,
  onUseLibraryName,
}: InstanceRenameFieldsProps) {
  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1 text-xs text-tesla-muted">
        Custom name
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={placeholder ?? libraryName}
          className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm text-tesla-text outline-none focus:border-tesla-accent disabled:opacity-40"
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={onUseLibraryName}
        title={`Revert to library name: ${libraryName}`}
        className="w-full truncate rounded border border-tesla-border px-2 py-1.5 text-left text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
      >
        <span className="whitespace-nowrap">Use library name → </span>
        <span className="italic">{libraryName}</span>
      </button>
    </div>
  );
}
