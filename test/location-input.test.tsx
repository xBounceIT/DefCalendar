// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import React, { useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import LocationInput from "../src/renderer/src/components/location-input";
import en from "../src/renderer/src/i18n/locales/en.json";
import itTranslations from "../src/renderer/src/i18n/locales/it.json";
import type { LocationSuggestion, SearchLocationsArgs } from "../src/shared/locations";

const rome = [{ label: "Roma, Italia" }];

function deferred() {
  let complete: (items: LocationSuggestion[]) => void = () => {
    throw new Error("Search not started");
  };
  const promise = new Promise<LocationSuggestion[]>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: complete };
}

function setup(
  search = vi
    .fn<(args: SearchLocationsArgs) => Promise<LocationSuggestion[]>>()
    .mockResolvedValue(rome),
  physical = true,
) {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  onTestFinished(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: en }, it: { translation: itTranslations } },
  });
  const resetToken = {};
  function Form() {
    const [value, setValue] = useState("");
    return (
      <I18nextProvider i18n={i18n}>
        <LocationInput
          disabled={false}
          physical={physical}
          value={value}
          onChange={setValue}
          onSearch={search}
          resetToken={resetToken}
        />
        <button type="button">Other field</button>
      </I18nextProvider>
    );
  }
  render(<Form />);
  return { search, i18n, input: screen.getByRole("combobox", { name: "Location" }) };
}

async function advance(milliseconds = 500) {
  await act(async () => vi.advanceTimersByTimeAsync(milliseconds));
}

describe("location suggestion continuity", () => {
  it.each(["", "ab", "x".repeat(201)])(
    "leaves Escape and arrow keys native when the physical query cannot show suggestions: %s",
    async (value) => {
      expect.hasAssertions();
      const { input, search } = setup();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value } });
      expect({
        escapeAllowed: fireEvent.keyDown(input, { key: "Escape" }),
        arrowAllowed: fireEvent.keyDown(input, { key: "ArrowDown" }),
        popup: screen.queryByRole("listbox"),
      }).toStrictEqual({ escapeAllowed: true, arrowAllowed: true, popup: null });
      await advance();
      expect(search).not.toHaveBeenCalled();
    },
  );

  it("does not intercept Escape or arrow navigation in a nonphysical location", async () => {
    expect.hasAssertions();
    const { input, search } = setup(vi.fn().mockResolvedValue([]), false);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Microsoft Teams Meeting" } });
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(true);
    await advance(1000);
    expect(search).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-autocomplete", "none");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes visible suggestions with Escape and reopens them with ArrowDown without another request", async () => {
    expect.hasAssertions();
    const { input, search } = setup();
    fireEvent.change(input, { target: { value: "Roma" } });
    await advance();
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(false);
    expect(screen.getByRole("option", { name: "Roma, Italia" })).toBeEnabled();
    expect(search).toHaveBeenCalledOnce();
  });

  it("keeps the popup mounted while typing and prevents stale selections", async () => {
    expect.hasAssertions();
    const search = vi
      .fn()
      .mockResolvedValueOnce(rome)
      .mockResolvedValue([{ label: "Roma Termini, Italia" }]);
    const { input } = setup(search);
    fireEvent.change(input, { target: { value: "Roma" } });
    await advance();
    const popup = screen.getByRole("listbox").parentElement;
    fireEvent.keyDown(input, { key: "ArrowDown" });
    for (const value of ["Roma T", "Roma Te", "Roma Ter"]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole("listbox").parentElement).toBe(popup);
      expect(screen.getByRole("option", { name: "Roma, Italia" })).toBeDisabled();
      expect(input).toHaveAttribute("aria-busy", "true");
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(input).toHaveValue(value);
    }
    expect(search).toHaveBeenCalledOnce();
    await advance();
    expect(screen.getByRole("listbox").parentElement).toBe(popup);
    expect(screen.getByRole("option", { name: "Roma Termini, Italia" })).toBeEnabled();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("preserves the popup and pending search across native window focus loss", async () => {
    expect.hasAssertions();
    const request = deferred();
    const search = vi.fn().mockReturnValue(request.promise);
    const { input } = setup(search);
    fireEvent.change(input, { target: { value: "Roma" } });
    await advance();
    const popup = screen.getByRole("listbox").parentElement;
    vi.mocked(document.hasFocus).mockReturnValue(false);
    fireEvent.blur(input, { relatedTarget: null });
    expect(screen.getByRole("listbox").parentElement).toBe(popup);
    await act(async () => request.resolve(rome));
    vi.mocked(document.hasFocus).mockReturnValue(true);
    fireEvent.focus(input);
    expect(screen.getByRole("option", { name: "Roma, Italia" })).toBeEnabled();
    await advance(1000);
    expect(search).toHaveBeenCalledOnce();
  });

  it("reopens cached queries immediately after internal blur or editing back", async () => {
    expect.hasAssertions();
    const { input, search } = setup();
    fireEvent.change(input, { target: { value: "Roma" } });
    await advance();
    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "Other field" }) });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.focus(input);
    expect(screen.getByRole("option", { name: "Roma, Italia" })).toBeEnabled();
    fireEvent.change(input, { target: { value: "Roma Termini" } });
    fireEvent.change(input, { target: { value: " ROMA " } });
    expect(screen.getByRole("option", { name: "Roma, Italia" })).toBeEnabled();
    expect(input).toHaveAttribute("aria-busy", "false");
    await advance(1000);
    expect(search).toHaveBeenCalledOnce();
  });

  it("reuses a pending request after internal blur and refocus", async () => {
    expect.hasAssertions();
    const request = deferred();
    const search = vi.fn().mockReturnValue(request.promise);
    const { input } = setup(search);
    fireEvent.change(input, { target: { value: "Roma" } });
    await advance();
    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "Other field" }) });
    fireEvent.focus(input);
    await advance(1000);
    expect(search).toHaveBeenCalledOnce();
    await act(async () => request.resolve(rome));
    expect(screen.getByRole("option", { name: "Roma, Italia" })).toBeEnabled();
  });

  it("caches empty responses, expires cached queries and separates languages", async () => {
    expect.hasAssertions();
    const { input, search, i18n } = setup(vi.fn().mockResolvedValue([]));
    const other = screen.getByRole("button", { name: "Other field" });
    fireEvent.change(input, { target: { value: "Roma" } });
    await advance();
    fireEvent.blur(input, { relatedTarget: other });
    fireEvent.focus(input);
    expect(screen.getByRole("status")).toHaveTextContent("No places found");
    await advance(1000);
    expect(search).toHaveBeenCalledOnce();
    await act(async () => i18n.changeLanguage("it"));
    await advance();
    expect(search).toHaveBeenLastCalledWith({ query: "Roma", language: "it" });
    await advance(300_001);
    fireEvent.blur(input, { relatedTarget: other });
    fireEvent.focus(input);
    await advance();
    expect(search).toHaveBeenCalledTimes(3);
  });

  it("retries a query whose previous request was superseded instead of caching cancellation", async () => {
    expect.hasAssertions();
    const requests = Array.from({ length: 3 }, () => deferred());
    const search = vi
      .fn()
      .mockReturnValueOnce(requests[0].promise)
      .mockReturnValueOnce(requests[1].promise)
      .mockReturnValueOnce(requests[2].promise);
    const { input } = setup(search);
    fireEvent.change(input, { target: { value: "Roma" } });
    await advance();
    fireEvent.change(input, { target: { value: "Milano" } });
    await advance();
    fireEvent.change(input, { target: { value: "Roma" } });
    await act(async () => requests[0].resolve([]));
    await advance();
    expect(search).toHaveBeenCalledTimes(3);
    await act(async () => requests[2].resolve(rome));
    await act(async () => requests[1].resolve([]));
    expect(screen.getByRole("option", { name: "Roma, Italia" })).toBeEnabled();
  });
});
