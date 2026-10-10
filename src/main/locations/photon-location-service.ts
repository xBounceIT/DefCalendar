import { z } from "zod";
import {
  locationSuggestionSchema,
  locationCoordinatesSchema,
  searchLocationsArgsSchema,
  getLocationSearchKey,
  LOCATION_CACHE_TTL_MS,
  MAX_CACHED_LOCATION_SEARCHES,
  type LocationSuggestion,
  type SearchLocationsArgs,
} from "@shared/locations";

const text = z.string().trim().max(300).optional();
const propertiesSchema = z.object({
  name: text,
  street: text,
  housenumber: text,
  postcode: text,
  city: text,
  district: text,
  county: text,
  state: text,
  country: text,
});
const responseSchema = z.object({ features: z.array(z.unknown()).max(100) });
const featureSchema = z.object({ properties: propertiesSchema, geometry: z.unknown().optional() });
const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});
const MAX_RESPONSE_BYTES = 1_000_000;

async function readResponse(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Location response is too large.");
  }
  if (!response.body) {
    throw new Error("Location response is empty.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        throw new Error("Location response is too large.");
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(body + decoder.decode());
}

function parseAddress(query: string) {
  const parts = query.split(",").map((part) => part.trim());
  const road =
    /^(?:via|viale|piazza|piazzale|corso|largo|vicolo|strada|lungomare|lungotevere|contrada|salita|discesa)\s+\S/i;
  const englishRoad = /\s(?:street|road|avenue|lane|drive|boulevard|st|rd|ave)$/i;
  const house = String.raw`\d+[a-z]?(?:\s*[/\-]\s*[\da-z]+)?`;
  const trailing = parts[0].match(new RegExp(String.raw`^(.+?)\s+(${house})$`, "i"));
  const leading = parts[0].match(
    new RegExp(
      String.raw`^(${house})\s+(.+(?:street|road|avenue|lane|drive|boulevard|st|rd|ave))$`,
      "i",
    ),
  );
  let street: string | undefined = undefined;
  let housenumber: string | undefined = undefined;
  let cityIndex = 1;
  if (trailing && (road.test(trailing[1]) || englishRoad.test(trailing[1]))) {
    street = trailing[1];
    housenumber = trailing[2];
  } else if (leading) {
    street = leading[2];
    housenumber = leading[1];
  } else if (road.test(parts[0]) && new RegExp(`^${house}$`, "i").test(parts[1] ?? "")) {
    street = parts[0];
    housenumber = parts[1];
    cityIndex = 2;
  }
  return street && housenumber
    ? { street, housenumber, city: parts[cityIndex] || undefined }
    : null;
}

function normalizeHouseNumber(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function normalizeStreet(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

class PhotonLocationService {
  private readonly cache = new Map<string, { expires: number; items: LocationSuggestion[] }>();
  private active: {
    key: string;
    controller: AbortController;
    promise: Promise<LocationSuggestion[]>;
  } | null = null;
  private nextRequestAt = 0;
  private unavailableUntil = 0;

  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }

  search(input: SearchLocationsArgs): Promise<LocationSuggestion[]> {
    const args = searchLocationsArgsSchema.parse(input);
    const key = getLocationSearchKey(args);
    if (this.active?.key !== key) {
      this.active?.controller.abort();
    }
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return Promise.resolve(cached.items);
    }
    if (Date.now() < this.unavailableUntil) {
      return Promise.reject(new Error("Location suggestions are unavailable."));
    }
    if (this.active?.key === key && !this.active.controller.signal.aborted) {
      return this.active.promise;
    }
    const controller = new AbortController();
    const promise = this.searchRemote(args, key, controller.signal).finally(() => {
      if (this.active?.controller === controller) {
        this.active = null;
      }
    });
    this.active = { key, controller, promise };
    return promise;
  }

  private async searchRemote(
    args: SearchLocationsArgs,
    key: string,
    signal: AbortSignal,
  ): Promise<LocationSuggestion[]> {
    try {
      const wait = Math.max(0, this.nextRequestAt - Date.now());
      if (wait > 0) {
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(signal.reason);
          };
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
          }, wait);
          signal.addEventListener("abort", abort, { once: true });
        });
      }
      signal.throwIfAborted();
      this.nextRequestAt = Date.now() + 1000;
      const address = parseAddress(args.query);
      const url = new URL(
        address ? "https://photon.komoot.io/structured" : "https://photon.komoot.io/api/",
      );
      if (address) {
        url.searchParams.set("street", address.street);
        url.searchParams.set("housenumber", address.housenumber);
        if (address.city) {
          url.searchParams.set("city", address.city);
        }
      } else {
        url.searchParams.set("q", args.query);
      }
      url.searchParams.set("limit", address ? "10" : "5");
      if (args.language === "en") {
        url.searchParams.set("lang", "en");
      }
      const response = await this.fetcher(url, {
        headers: { Accept: "application/json", "User-Agent": "DefCalendar" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        redirect: "error",
      });
      signal.throwIfAborted();
      if (!response.ok) {
        this.unavailableUntil = Date.now() + (response.status === 429 ? 60_000 : 10_000);
        throw new Error("Location suggestions are unavailable.");
      }
      const data = responseSchema.parse(await readResponse(response));
      signal.throwIfAborted();
      const labels = new Set<string>();
      const suggestions: LocationSuggestion[] = [];
      for (const feature of data.features) {
        const parsed = featureSchema.safeParse(feature);
        if (!parsed.success) {
          continue;
        }
        const place = parsed.data.properties;
        const street = place.street || (address ? place.name : undefined);
        if (address) {
          if (!street || normalizeStreet(street) !== normalizeStreet(address.street)) {
            continue;
          }
          if (
            place.housenumber &&
            normalizeHouseNumber(place.housenumber) !== normalizeHouseNumber(address.housenumber)
          ) {
            continue;
          }
        }
        const parts = [
          address && place.name === street ? undefined : place.name,
          [street, address?.housenumber ?? place.housenumber].filter(Boolean).join(" "),
          [place.postcode, place.city || place.district || place.county].filter(Boolean).join(" "),
          place.state,
          place.country,
        ].filter((part): part is string => Boolean(part));
        const label = [...new Set(parts)].join(", ");
        const point = pointSchema.safeParse(parsed.data.geometry);
        const coordinates = locationCoordinatesSchema.safeParse(
          point.success
            ? { latitude: point.data.coordinates[1], longitude: point.data.coordinates[0] }
            : null,
        );
        const suggestion = locationSuggestionSchema.safeParse({
          label,
          ...(coordinates.success ? { coordinates: coordinates.data } : {}),
          ...(address ? { houseNumberVerified: Boolean(place.housenumber) } : {}),
        });
        if (!suggestion.success) {
          continue;
        }
        suggestions.push(suggestion.data);
      }
      suggestions.sort(
        (left, right) =>
          Number(right.houseNumberVerified ?? false) - Number(left.houseNumberVerified ?? false),
      );
      const items = suggestions
        .filter((item) => {
          const label = item.label.toLowerCase();
          if (labels.has(label)) {
            return false;
          }
          labels.add(label);
          return true;
        })
        .slice(0, 5);
      this.cache.delete(key);
      this.cache.set(key, { expires: Date.now() + LOCATION_CACHE_TTL_MS, items });
      if (this.cache.size > MAX_CACHED_LOCATION_SEARCHES) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      return items;
    } catch (error) {
      if (signal.aborted) {
        return [];
      }
      this.unavailableUntil = Math.max(this.unavailableUntil, Date.now() + 10_000);
      throw error;
    }
  }
}

export default PhotonLocationService;
