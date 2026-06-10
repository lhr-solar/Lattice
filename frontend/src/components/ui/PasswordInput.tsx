import { useState } from "react";
import clsx from "clsx";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function EyeVisibilityIcon({ hidden, className }: { hidden: boolean; className?: string }) {
  if (hidden) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={clsx("h-full w-full", className)}
        aria-hidden
      >
        <path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M14.12 14.12a3 3 0 1 1-4.24-4.24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={clsx("h-full w-full", className)}
      aria-hidden
    >
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
  autoFocus,
  autoComplete,
  disabled = false,
  size = "md",
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const compact = size === "sm";

  return (
    <div className={clsx("relative", className)}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        disabled={disabled}
        className={clsx(
          "w-full rounded border border-tesla-border bg-tesla-bg text-tesla-text outline-none transition focus:border-tesla-accent disabled:cursor-not-allowed disabled:opacity-50",
          compact ? "px-2 py-1 pr-7 text-xs" : "px-3 py-1.5 pr-10 text-sm",
          inputClassName,
        )}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        className={clsx(
          "absolute top-1/2 -translate-y-1/2 rounded text-tesla-muted transition hover:text-tesla-text disabled:cursor-not-allowed disabled:opacity-40",
          compact ? "right-1 h-3.5 w-3.5 p-0" : "right-2 h-4 w-4 p-0.5",
        )}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        <EyeVisibilityIcon hidden={visible} />
      </button>
    </div>
  );
}
