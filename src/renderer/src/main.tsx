import "./styles.css";
import "./i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./app";
import React from "react";
import ReactDOM from "react-dom/client";
import { createMockCalendarApi } from "../../preload/mock-calendar-api";

if (
  import.meta.env.DEV &&
  window.location.search.includes("mockData=1") &&
  !globalThis.calendarApi
) {
  globalThis.calendarApi = createMockCalendarApi();
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Renderer root element was not found.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
