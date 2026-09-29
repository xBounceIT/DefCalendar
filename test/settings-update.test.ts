import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import createSettingsUpdater from "../src/renderer/src/settings-update";
import { createDefaultSettings } from "../src/shared/schemas";

describe("settings update ordering", () => {
  it("serializes pending saves and uses the last confirmed settings for rollback", async () => {
    expect.hasAssertions();
    const defaults = createDefaultSettings();
    const client = new QueryClient();
    client.setQueryData(["settings"], defaults);
    let finishFirst: (settings: typeof defaults) => void = () => undefined;
    const firstResponse = new Promise<typeof defaults>((resolve) => {
      finishFirst = resolve;
    });
    const update = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockRejectedValueOnce(new Error("Save failed"))
      .mockResolvedValueOnce({ ...defaults, theme: "dark", spellcheckLanguages: ["it"] });
    const save = createSettingsUpdater(client, update, defaults);
    const first = save({ theme: "dark" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    const second = save({ spellcheckLanguages: ["fr"] });
    expect(update).toHaveBeenCalledOnce();
    finishFirst({ ...defaults, theme: "dark" });
    await first;
    await expect(second).resolves.toBe(false);
    expect(client.getQueryData(["settings"])).toMatchObject({
      theme: "dark",
      spellcheckLanguages: ["en-US", "it"],
    });
    await save({ spellcheckLanguages: ["it"] });
    expect(client.getQueryData(["settings"])).toMatchObject({
      theme: "dark",
      spellcheckLanguages: ["it"],
    });
  });

  it("only acknowledges onboarding after a successful save", async () => {
    expect.hasAssertions();
    const defaults = createDefaultSettings();
    const client = new QueryClient();
    client.setQueryData(["settings"], defaults);
    let finish: (settings: typeof defaults) => void = () => undefined;
    const response = new Promise<typeof defaults>((resolve) => {
      finish = resolve;
    });
    const save = createSettingsUpdater(client, vi.fn().mockReturnValue(response), defaults);
    const pending = save({ spellcheckOnboardingSeen: true }, false);
    await Promise.resolve();
    expect(client.getQueryData(["settings"])).toMatchObject({ spellcheckOnboardingSeen: false });
    finish({ ...defaults, spellcheckOnboardingSeen: true });
    await expect(pending).resolves.toBe(true);
    expect(client.getQueryData(["settings"])).toMatchObject({ spellcheckOnboardingSeen: true });
  });
});
