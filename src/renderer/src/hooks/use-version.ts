import { useQuery } from "@tanstack/react-query";

export function useVersion(): {
  error: Error | null;
  isLoading: boolean;
  version: string | null;
} {
  const { data, error, isLoading } = useQuery({
    queryFn: () => globalThis.calendarApi.app.getVersion(),
    queryKey: ["app-version"],
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    error: error ?? null,
    isLoading,
    version: data ?? null,
  };
}

export default useVersion;
