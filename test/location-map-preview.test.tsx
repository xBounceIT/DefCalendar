// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import LocationMapPreview from "../src/renderer/src/components/location-map-preview";
import en from "../src/renderer/src/i18n/locales/en.json";
import type { LocationCoordinates } from "../src/shared/locations";

const colosseum = { latitude: 41.8902, longitude: 12.4922 };
const tiles = [{ src: "data:image/png;base64,iVBORw0KGgo=", left: 0, top: 0 }];

function setup(
  coordinates: LocationCoordinates | null = colosseum,
  search = vi.fn().mockResolvedValue([]),
  map = vi.fn().mockResolvedValue(tiles),
) {
  vi.useFakeTimers();
  onTestFinished(() => {
    cleanup();
    vi.useRealTimers();
  });
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } } });
  const element = (location: string, point: LocationCoordinates | null, composing = false) => (
    <I18nextProvider i18n={i18n}>
      <LocationMapPreview
        location={location}
        coordinates={point}
        composing={composing}
        onSearch={search}
        onMap={map}
      />
    </I18nextProvider>
  );
  const view = render(element("Colosseo, Roma", coordinates));
  return {
    search,
    map,
    update: (location: string, point: LocationCoordinates | null = null, composing = false) =>
      view.rerender(element(location, point, composing)),
  };
}

async function advance() {
  await act(async () => vi.advanceTimersByTimeAsync(800));
}

describe("location map preview", () => {
  it.each(["", "東".repeat(223)])(
    "does not load tiles for an unrenderable preview even when coordinates are available: %s",
    async (location) => {
      expect.hasAssertions();
      const { update, search, map } = setup(null);
      update(location, colosseum);
      await advance();
      expect({
        mapCalls: map.mock.calls.length,
        searchCalls: search.mock.calls.length,
        mapLink: screen.queryByRole("link", { name: "Open in Google Maps" }),
      }).toStrictEqual({ mapCalls: 0, searchCalls: 0, mapLink: null });
    },
  );

  it("pauses geocoding during composition and ignores a pending result when composition resumes", async () => {
    expect.hasAssertions();
    let complete: (items: { label: string; coordinates: LocationCoordinates }[]) => void = () => {
      throw new Error("Search not started");
    };
    const pending = new Promise<{ label: string; coordinates: LocationCoordinates }[]>(
      (resolve) => {
        complete = resolve;
      },
    );
    const search = vi.fn().mockReturnValue(pending);
    const { update, map } = setup(null, search);
    update("Colosseo, Roma", null, true);
    await advance();
    expect(search).not.toHaveBeenCalled();
    update("Colosseo, Roma", null, false);
    await advance();
    expect(search).toHaveBeenCalledOnce();
    update("Colosseo, Roma", null, true);
    await act(async () => complete([{ label: "Colosseo, Roma", coordinates: colosseum }]));
    await advance();
    expect(map).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: "Location area map" })).not.toBeInTheDocument();
  });

  it("keeps attribution mounted from loading through loaded tiles and the map link keyboard accessible", async () => {
    expect.hasAssertions();
    const { search, map } = setup();
    const attribution = screen.getByRole<HTMLAnchorElement>("link", {
      name: "© OpenStreetMap contributors",
    });
    await advance();
    expect({
      mapVisible: screen
        .getByRole("img", { name: "Location area map" })
        .querySelector("img")
        ?.getAttribute("src"),
      attribution: attribution.href,
      attributionRetained: attribution.isConnected,
      point: map.mock.calls[0][0],
    }).toStrictEqual({
      mapVisible: tiles[0].src,
      attribution: "https://www.openstreetmap.org/copyright",
      attributionRetained: true,
      point: colosseum,
    });
    const link = screen.getByRole<HTMLAnchorElement>("link", { name: "Open in Google Maps" });
    link.focus();
    expect(link).toHaveFocus();
    expect(new URL(link.href).searchParams.get("query")).toBe("Colosseo, Roma");
    await advance();
    expect(search).not.toHaveBeenCalled();
  });

  it("discards a stale geocode response after the typed place changes", async () => {
    expect.hasAssertions();
    let complete: (items: { label: string; coordinates: LocationCoordinates }[]) => void = () => {
      throw new Error("Search not started");
    };
    const pending = new Promise<{ label: string; coordinates: LocationCoordinates }[]>(
      (resolve) => {
        complete = resolve;
      },
    );
    const search = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValue([
        { label: "Torre Eiffel, Parigi", coordinates: { latitude: 48.8584, longitude: 2.2945 } },
      ]);
    const { update, map } = setup(null, search);
    await advance();
    update("Torre Eiffel, Parigi");
    await act(async () => complete([{ label: "Colosseo, Roma", coordinates: colosseum }]));
    expect(screen.queryByRole("img", { name: "Location area map" })).not.toBeInTheDocument();
    await advance();
    expect(map).toHaveBeenLastCalledWith({ latitude: 48.8584, longitude: 2.2945 });
    expect(
      new URL(
        screen.getByRole<HTMLAnchorElement>("link", { name: "Open in Google Maps" }).href,
      ).searchParams.get("query"),
    ).toBe("Torre Eiffel, Parigi");
  });

  it("falls back to a clickable card when geocoding fails and clears stale coordinates when editing", async () => {
    expect.hasAssertions();
    const search = vi.fn().mockRejectedValue(new Error("Offline"));
    const { update } = setup(colosseum, search);
    update("Unknown venue");
    await advance();
    expect(screen.queryByRole("img", { name: "Location area map" })).not.toBeInTheDocument();
    expect(search).toHaveBeenCalledOnce();
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Google Maps" })).toBeInTheDocument();
  });

  it("rejects invalid coordinates and oversized queries without issuing map requests", async () => {
    expect.hasAssertions();
    const { update, search } = setup({ latitude: Number.NaN, longitude: 190 });
    expect(screen.queryByRole("img", { name: "Location area map" })).not.toBeInTheDocument();
    update("東".repeat(223));
    expect(screen.queryByRole("link", { name: "Open in Google Maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Location is too long for Google Maps");
    await advance();
    update("");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it("keeps a usable external link when tiles cannot load or cannot decode", async () => {
    expect.hasAssertions();
    const { update } = setup();
    await advance();
    fireEvent.error(screen.getByRole("img", { name: "Location area map" }).querySelector("img")!);
    expect(screen.queryByRole("img", { name: "Location area map" })).not.toBeInTheDocument();
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    update("Torre Eiffel", { latitude: 48.8584, longitude: 2.2945 });
    await advance();
    expect(screen.getByRole("img", { name: "Location area map" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Google Maps" })).toBeInTheDocument();
  });

  it("ignores late tiles and retains attribution and the map link when the current map fails", async () => {
    expect.hasAssertions();
    let complete: (value: typeof tiles) => void = () => {
      throw new Error("Map not started");
    };
    const pending = new Promise<typeof tiles>((resolve) => {
      complete = resolve;
    });
    const map = vi.fn().mockReturnValueOnce(pending).mockRejectedValue(new Error("Offline"));
    const { update } = setup(colosseum, vi.fn(), map);
    update("Torre Eiffel", { latitude: 48.8584, longitude: 2.2945 });
    await act(async () => complete(tiles));
    expect(screen.queryByRole("img", { name: "Location area map" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "© OpenStreetMap contributors" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    expect(
      new URL(
        screen.getByRole<HTMLAnchorElement>("link", { name: "Open in Google Maps" }).href,
      ).searchParams.get("query"),
    ).toBe("Torre Eiffel");
    expect(map).toHaveBeenCalledTimes(2);
  });
});
