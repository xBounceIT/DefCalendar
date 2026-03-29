import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppUpdateStatus } from "@shared/schemas";
import { useEffect } from "react";

const QUERY_KEY = ["app-update-status"] as const;

export function useUpdater() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryFn: () => globalThis.calendarApi.updates.getStatus(),
    queryKey: QUERY_KEY,
  });

  useEffect(
    () =>
      globalThis.calendarApi.updates.onStatus((status) => {
        queryClient.setQueryData<AppUpdateStatus>(QUERY_KEY, status);
      }),
    [queryClient],
  );

  const checkMutation = useMutation({
    mutationFn: () => globalThis.calendarApi.updates.check(),
    onSuccess: (status) => {
      queryClient.setQueryData<AppUpdateStatus>(QUERY_KEY, status);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: () => globalThis.calendarApi.updates.download(),
    onSuccess: (status) => {
      queryClient.setQueryData<AppUpdateStatus>(QUERY_KEY, status);
    },
  });

  function check(): void {
    checkMutation.mutate();
  }

  function download(): void {
    downloadMutation.mutate();
  }

  return {
    check,
    download,
    install: () => {
      void globalThis.calendarApi.updates.install();
    },
    isChecking: checkMutation.isPending,
    isDownloading: downloadMutation.isPending,
    status: statusQuery.data ?? null,
    statusError: statusQuery.error ?? null,
    statusLoading: statusQuery.isLoading,
  };
}

export default useUpdater;
