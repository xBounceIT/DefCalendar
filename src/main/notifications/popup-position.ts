import type { Point, Rectangle } from "electron";
import { screen } from "@main/electron-runtime";

function getPopupPosition(width: number, height: number, previousBounds?: Rectangle): Point {
  if (previousBounds) {
    const { workArea } = screen.getDisplayMatching(previousBounds);
    return {
      x: Math.max(workArea.x, Math.min(previousBounds.x, workArea.x + workArea.width - width)),
      y: Math.max(workArea.y, Math.min(previousBounds.y, workArea.y + workArea.height - height)),
    };
  }

  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
  };
}

export default getPopupPosition;
