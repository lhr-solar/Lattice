import { useQuery } from "@tanstack/react-query";
import { fetchVehicles } from "@/api/vehicles";
import { useAppStore } from "@/stores/appStore";
import { useState, useRef, useEffect } from "react";
import clsx from "clsx";

export function VehicleRevisionSelector() {
  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
  });

  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentVehicle = vehicles.find((v) => v.id === vehicleId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading && vehicles.length === 0) {
    return <div className="h-9 w-40 animate-pulse rounded bg-tesla-border/50" />;
  }

  const revisionBadge =
    currentVehicle?.current_revision_number != null
      ? `R${currentVehicle.current_revision_number}`
      : null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 min-w-[12rem] items-center gap-3 rounded-md border border-tesla-border bg-tesla-bg px-3 text-sm font-medium transition hover:border-tesla-accent"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-tesla-text">
            {currentVehicle ? currentVehicle.name : "Select Vehicle"}
          </span>
          {currentVehicle && revisionBadge && (
            <span className="flex shrink-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-tesla-accent"
                aria-hidden
              />
              <span className="text-xs font-normal text-tesla-muted">{revisionBadge}</span>
            </span>
          )}
        </div>
        <span
          className={clsx(
            "shrink-0 text-tesla-muted transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-tesla-border bg-tesla-surface shadow-xl">
          <div className="border-b border-tesla-border px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-tesla-muted">
              Vehicles
            </span>
          </div>
          <ul className="max-h-60 overflow-y-auto p-1">
            {vehicles.map((v) => {
              const revisionBadge =
                v.current_revision_number != null ? `R${v.current_revision_number}` : null;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    disabled={!v.current_revision_id}
                    onClick={() => {
                      if (v.current_revision_id) {
                        selectVehicle(v.id, v.current_revision_id);
                        setIsOpen(false);
                      }
                    }}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40",
                      vehicleId === v.id
                        ? "bg-tesla-accent/15 text-tesla-text"
                        : "text-tesla-muted hover:bg-tesla-border/50 hover:text-tesla-text"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    {v.current_revision_id && revisionBadge && (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-tesla-accent"
                          aria-hidden
                        />
                        <span className="text-xs text-tesla-muted">{revisionBadge}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
