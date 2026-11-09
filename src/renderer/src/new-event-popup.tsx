import "./styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewEventWindow from "./components/new-event-window";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Renderer root element was not found.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <NewEventWindow />
    </QueryClientProvider>
  </React.StrictMode>,
);
