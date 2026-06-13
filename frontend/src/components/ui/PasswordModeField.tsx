import clsx from "clsx";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const PASSWORD_MODE_OPTIONS = [
  { value: "default" as const, label: "Default" },
  { value: "custom" as const, label: "Custom" },
];

interface PasswordModeFieldProps {
  useDefault: boolean;
  onModeChange: (useDefault: boolean) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  defaultConfigured: boolean;
  label?: string;
  inputClassName?: string;
  fieldWidthClass?: string;
}

export function PasswordModeField({
  useDefault,
  onModeChange,
  password,
  onPasswordChange,
  defaultConfigured,
  label = "Password",
  inputClassName,
  fieldWidthClass = "w-44",
}: PasswordModeFieldProps) {
  function handleModeChange(mode: "default" | "custom") {
    const nextUseDefault = mode === "default";
    onModeChange(nextUseDefault);
    if (nextUseDefault) {
      onPasswordChange("");
    } else {
      onPasswordChange("");
    }
  }

  return (
    <div className={clsx("flex flex-col gap-1.5", fieldWidthClass)}>
      {label ? <span className="text-xs text-tesla-muted">{label}</span> : null}
      <PasswordInput
        value={useDefault ? "" : password}
        onChange={onPasswordChange}
        placeholder={
          useDefault
            ? defaultConfigured
              ? "Uses saved default password"
              : "Uses system admin password"
            : "Min 6 characters"
        }
        size="sm"
        disabled={useDefault}
        inputClassName={clsx("h-8", inputClassName)}
      />
      <SegmentedControl
        value={useDefault ? "default" : "custom"}
        onChange={handleModeChange}
        options={PASSWORD_MODE_OPTIONS}
        ariaLabel="Password type"
        className="w-full"
      />
    </div>
  );
}
