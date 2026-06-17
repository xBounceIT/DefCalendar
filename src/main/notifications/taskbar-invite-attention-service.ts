import type { BrowserWindow, NativeImage } from "electron";
import { deflateSync } from "node:zlib";
import { app, nativeImage } from "@main/electron-runtime";
import { t } from "@main/i18n";
import type NewEventNotificationService from "@main/notifications/new-event-notification-service";
import type SettingsService from "@main/settings/settings-service";
import type { NewEventNotificationItem } from "@shared/schemas";

interface TaskbarInviteAttentionDependencies {
  getMainWindow: () => BrowserWindow | null;
  newEventNotifications: NewEventNotificationService;
  settings: SettingsService;
}

const BADGE_SIZE = 64;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BADGE_TEXT_SIZE_BY_LENGTH: Record<number, number> = {
  1: 40,
  2: 34,
  3: 25,
};

class TaskbarInviteAttentionService {
  private readonly dependencies: TaskbarInviteAttentionDependencies;
  private readonly overlayCache = new Map<string, NativeImage>();
  private isFlashing = false;
  private unsubscribe: null | (() => void) = null;

  constructor(dependencies: TaskbarInviteAttentionDependencies) {
    this.dependencies = dependencies;
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.dependencies.newEventNotifications.onChange((items) => {
      this.sync(items);
    });
    this.refresh();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clearAttention();
  }

  refresh(): void {
    this.sync(this.dependencies.newEventNotifications.getItems());
  }

  stopFlashing(): void {
    const window = this.getWindow();
    if (!window || !this.isFlashing) {
      this.isFlashing = false;
      return;
    }

    window.flashFrame(false);
    this.isFlashing = false;
  }

  sync(items: NewEventNotificationItem[]): void {
    const count = items.length;
    if (
      !this.dependencies.settings.getSettings().taskbarInviteNotificationsEnabled ||
      count === 0
    ) {
      this.clearAttention();
      return;
    }

    this.setBadgeCount(count);
    const window = this.getWindow();
    if (!window) {
      return;
    }

    this.showHiddenWindowForAttention(window);
    this.showOverlayIcon(window, count);
    if (window.isFocused()) {
      this.stopFlashing();
      return;
    }

    window.flashFrame(true);
    this.isFlashing = true;
  }

  private clearAttention(): void {
    this.stopFlashing();
    this.setBadgeCount(0);

    const window = this.getWindow();
    if (window) {
      this.clearOverlayIcon(window);
    }
  }

  private getWindow(): BrowserWindow | null {
    const window = this.dependencies.getMainWindow();
    if (!window || window.isDestroyed()) {
      return null;
    }

    return window;
  }

  private showHiddenWindowForAttention(window: BrowserWindow): void {
    if (window.isVisible() || window.isMinimized()) {
      return;
    }

    window.showInactive();
  }

  private setBadgeCount(count: number): void {
    if (typeof app.setBadgeCount === "function") {
      app.setBadgeCount(count);
    }
  }

  private showOverlayIcon(window: BrowserWindow, count: number): void {
    if (typeof window.setOverlayIcon !== "function") {
      return;
    }

    try {
      window.setOverlayIcon(this.getOverlayIcon(count), this.getOverlayDescription(count));
    } catch {
      return;
    }
  }

  private clearOverlayIcon(window: BrowserWindow): void {
    if (typeof window.setOverlayIcon !== "function") {
      return;
    }

    try {
      window.setOverlayIcon(null, "");
    } catch {
      return;
    }
  }

  private getOverlayIcon(count: number): NativeImage {
    const label = getBadgeLabel(count);
    const cached = this.overlayCache.get(label);
    if (cached) {
      return cached;
    }

    const image = nativeImage.createFromBuffer(createBadgePng(label));
    this.overlayCache.set(label, image);
    return image;
  }

  private getOverlayDescription(count: number): string {
    if (count === 1) {
      return t("taskbarInviteOverlayDescriptionOne");
    }

    return t("taskbarInviteOverlayDescriptionOther").replace("{{count}}", String(count));
  }
}

function getBadgeLabel(count: number): string {
  return count > 99 ? "99+" : String(Math.max(0, count));
}

function createBadgePng(label: string): Buffer {
  const pixels = Buffer.alloc(BADGE_SIZE * BADGE_SIZE * 4);
  drawCircle(pixels);
  drawLabel(pixels, label);
  return encodePng(BADGE_SIZE, BADGE_SIZE, pixels);
}

function drawCircle(pixels: Buffer): void {
  const center = BADGE_SIZE / 2;
  const radius = 29;

  for (let y = 0; y < BADGE_SIZE; y += 1) {
    for (let x = 0; x < BADGE_SIZE; x += 1) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      const alpha = Math.max(0, Math.min(1, radius + 0.75 - distance));
      if (alpha === 0) {
        continue;
      }

      blendPixel(pixels, x, y, 220, 38, 38, alpha);
    }
  }
}

function drawLabel(pixels: Buffer, label: string): void {
  const fontSize = BADGE_TEXT_SIZE_BY_LENGTH[label.length] ?? 25;
  const glyphWidth = fontSize * 0.58;
  const gap = fontSize * 0.08;
  const width = label.length * glyphWidth + (label.length - 1) * gap;
  let x = (BADGE_SIZE - width) / 2;
  const y = (BADGE_SIZE - fontSize) / 2 + fontSize * 0.04;
  const strokeWidth = Math.max(3.5, fontSize * 0.16);

  for (const char of label) {
    drawGlyph(pixels, char, x, y, glyphWidth, fontSize, strokeWidth);
    x += glyphWidth + gap;
  }
}

function drawGlyph(
  pixels: Buffer,
  char: string,
  x: number,
  y: number,
  width: number,
  height: number,
  strokeWidth: number,
): void {
  const points = getGlyphStrokes(char, x, y, width, height);
  for (const stroke of points) {
    drawStroke(pixels, stroke, strokeWidth);
  }
}

function getGlyphStrokes(
  char: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Array<Array<[number, number]>> {
  const px = (value: number) => x + width * value;
  const py = (value: number) => y + height * value;

  switch (char) {
    case "0":
      return [
        [
          [px(0.5), py(0.08)],
          [px(0.2), py(0.18)],
          [px(0.14), py(0.5)],
          [px(0.2), py(0.82)],
          [px(0.5), py(0.92)],
          [px(0.8), py(0.82)],
          [px(0.86), py(0.5)],
          [px(0.8), py(0.18)],
          [px(0.5), py(0.08)],
        ],
      ];
    case "1":
      return [
        [
          [px(0.3), py(0.25)],
          [px(0.53), py(0.1)],
          [px(0.53), py(0.88)],
        ],
        [
          [px(0.3), py(0.88)],
          [px(0.78), py(0.88)],
        ],
      ];
    case "2":
      return [
        [
          [px(0.18), py(0.24)],
          [px(0.42), py(0.1)],
          [px(0.78), py(0.18)],
          [px(0.82), py(0.42)],
          [px(0.18), py(0.88)],
          [px(0.84), py(0.88)],
        ],
      ];
    case "3":
      return [
        [
          [px(0.2), py(0.14)],
          [px(0.78), py(0.14)],
          [px(0.55), py(0.5)],
          [px(0.8), py(0.86)],
          [px(0.18), py(0.86)],
        ],
        [
          [px(0.44), py(0.5)],
          [px(0.68), py(0.5)],
        ],
      ];
    case "4":
      return [
        [
          [px(0.78), py(0.1)],
          [px(0.78), py(0.9)],
        ],
        [
          [px(0.18), py(0.58)],
          [px(0.82), py(0.58)],
        ],
        [
          [px(0.18), py(0.58)],
          [px(0.66), py(0.12)],
        ],
      ];
    case "5":
      return [
        [
          [px(0.8), py(0.14)],
          [px(0.22), py(0.14)],
          [px(0.18), py(0.48)],
          [px(0.66), py(0.48)],
          [px(0.82), py(0.66)],
          [px(0.68), py(0.88)],
          [px(0.2), py(0.88)],
        ],
      ];
    case "6":
      return [
        [
          [px(0.78), py(0.16)],
          [px(0.38), py(0.12)],
          [px(0.16), py(0.42)],
          [px(0.18), py(0.76)],
          [px(0.42), py(0.9)],
          [px(0.76), py(0.78)],
          [px(0.76), py(0.54)],
          [px(0.42), py(0.48)],
          [px(0.18), py(0.58)],
        ],
      ];
    case "7":
      return [
        [
          [px(0.18), py(0.14)],
          [px(0.84), py(0.14)],
          [px(0.42), py(0.9)],
        ],
      ];
    case "8":
      return [
        [
          [px(0.5), py(0.08)],
          [px(0.22), py(0.18)],
          [px(0.22), py(0.4)],
          [px(0.5), py(0.5)],
          [px(0.78), py(0.4)],
          [px(0.78), py(0.18)],
          [px(0.5), py(0.08)],
        ],
        [
          [px(0.5), py(0.5)],
          [px(0.18), py(0.62)],
          [px(0.22), py(0.84)],
          [px(0.5), py(0.92)],
          [px(0.78), py(0.84)],
          [px(0.82), py(0.62)],
          [px(0.5), py(0.5)],
        ],
      ];
    case "9":
      return [
        [
          [px(0.76), py(0.42)],
          [px(0.52), py(0.52)],
          [px(0.18), py(0.46)],
          [px(0.18), py(0.22)],
          [px(0.52), py(0.1)],
          [px(0.76), py(0.24)],
          [px(0.78), py(0.58)],
          [px(0.56), py(0.88)],
          [px(0.18), py(0.84)],
        ],
      ];
    case "+":
      return [
        [
          [px(0.18), py(0.5)],
          [px(0.82), py(0.5)],
        ],
        [
          [px(0.5), py(0.18)],
          [px(0.5), py(0.82)],
        ],
      ];
    default:
      return [];
  }
}

function drawStroke(pixels: Buffer, points: Array<[number, number]>, strokeWidth: number): void {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    drawSegment(pixels, start, end, strokeWidth);
  }
}

function drawSegment(
  pixels: Buffer,
  start: [number, number],
  end: [number, number],
  strokeWidth: number,
): void {
  const radius = strokeWidth / 2;
  const minX = Math.max(0, Math.floor(Math.min(start[0], end[0]) - radius - 1));
  const maxX = Math.min(BADGE_SIZE - 1, Math.ceil(Math.max(start[0], end[0]) + radius + 1));
  const minY = Math.max(0, Math.floor(Math.min(start[1], end[1]) - radius - 1));
  const maxY = Math.min(BADGE_SIZE - 1, Math.ceil(Math.max(start[1], end[1]) + radius + 1));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = distanceToSegment(x + 0.5, y + 0.5, start, end);
      const alpha = Math.max(0, Math.min(1, radius + 0.75 - distance));
      if (alpha > 0) {
        blendPixel(pixels, x, y, 255, 255, 255, alpha);
      }
    }
  }
}

function distanceToSegment(
  x: number,
  y: number,
  start: [number, number],
  end: [number, number],
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(x - start[0], y - start[1]);
  }

  const t = Math.max(0, Math.min(1, ((x - start[0]) * dx + (y - start[1]) * dy) / lengthSquared));
  return Math.hypot(x - (start[0] + t * dx), y - (start[1] + t * dy));
}

function blendPixel(
  pixels: Buffer,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): void {
  const offset = (y * BADGE_SIZE + x) * 4;
  const sourceAlpha = Math.max(0, Math.min(1, alpha));
  const targetAlpha = pixels[offset + 3]! / 255;
  const nextAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  if (nextAlpha === 0) {
    return;
  }

  pixels[offset] = Math.round(
    (red * sourceAlpha + pixels[offset]! * targetAlpha * (1 - sourceAlpha)) / nextAlpha,
  );
  pixels[offset + 1] = Math.round(
    (green * sourceAlpha + pixels[offset + 1]! * targetAlpha * (1 - sourceAlpha)) / nextAlpha,
  );
  pixels[offset + 2] = Math.round(
    (blue * sourceAlpha + pixels[offset + 2]! * targetAlpha * (1 - sourceAlpha)) / nextAlpha,
  );
  pixels[offset + 3] = Math.round(nextAlpha * 255);
}

function encodePng(width: number, height: number, pixels: Buffer): Buffer {
  const rows = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    pixels.copy(rows, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk("IHDR", createIhdr(width, height)),
    createChunk("IDAT", deflateSync(rows)),
    createChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIhdr(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function createChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data: Buffer): number {
  let crc = 0xff_ff_ff_ff;

  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1));
    }
  }

  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

export default TaskbarInviteAttentionService;
