import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRevisions } from "@/api/revisions";
import { fetchVehicles } from "@/api/vehicles";
import { useAppStore } from "@/stores/appStore";

/**
 * Keep the design workspace on the vehicle head when admin (or another tab) advances it.
 * Only moves forward (higher revision number) so publish races don't snap backward.
 */
export function useSyncVehicleRevision(): void {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
    enabled: Boolean(vehicleId),
  });

  const { data: revisionsData } = useQuery({
    queryKey: ["revisions", vehicleId],
    queryFn: () => fetchRevisions(vehicleId!),
    enabled: Boolean(vehicleId),
  });

  useEffect(() => {
    if (!vehicleId || !vehicles.length || !revisionsData) return;

    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle?.current_revision_id || vehicle.current_revision_number == null) return;
    if (vehicle.current_revision_id === revisionId) return;

    const selected = revisionsData.revisions.find((r) => r.id === revisionId);
    const selectedNumber = selected?.revision_number ?? 0;
    if (vehicle.current_revision_number > selectedNumber) {
      selectVehicle(vehicleId, vehicle.current_revision_id);
    }
  }, [vehicleId, revisionId, vehicles, revisionsData, selectVehicle]);
}
