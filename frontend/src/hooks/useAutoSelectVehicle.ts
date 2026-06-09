import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchVehicles } from "@/api/vehicles";
import { useAppStore } from "@/stores/appStore";
import { useSessionStore } from "@/stores/sessionStore";

/** Select the first vehicle when the user logs in and none is active yet. */
export function useAutoSelectVehicle(): void {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (vehicleId || vehicles.length === 0) return;
    const first = vehicles.find((v) => v.current_revision_id);
    if (first?.current_revision_id) {
      selectVehicle(first.id, first.current_revision_id);
    }
  }, [vehicleId, vehicles, selectVehicle]);
}
