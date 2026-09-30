import { createPlugin } from "@fullcalendar/core";
import type { Identity, InteractionSettings } from "@fullcalendar/core/internal";
import { identity, Interaction, rangeContainsRange } from "@fullcalendar/core/internal";

interface DateContextClickArg {
  date: Date;
  allDay: boolean;
  jsEvent: MouseEvent;
}

const LISTENER_REFINERS = {
  dateContextClick: identity as Identity<(arg: DateContextClickArg) => void>,
};

declare module "@fullcalendar/core/internal" {
  interface CalendarListenerRefiners {
    dateContextClick: Identity<(arg: DateContextClickArg) => void>;
  }
}

class DateContextClicking extends Interaction {
  private readonly el: HTMLElement;

  constructor(settings: InteractionSettings) {
    super(settings);
    this.el = settings.el;
    this.el.addEventListener("contextmenu", this.handleContextMenu);
  }

  private handleContextMenu = (event: MouseEvent): void => {
    if (!(event.target instanceof HTMLElement) || !this.component.isValidDateDownEl(event.target)) {
      return;
    }

    const rect = this.el.getBoundingClientRect();
    this.component.prepareHits();
    const hit = this.component.queryHit(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
    );
    if (
      !hit?.dateProfile.activeRange ||
      !rangeContainsRange(hit.dateProfile.activeRange, hit.dateSpan.range)
    ) {
      return;
    }

    event.preventDefault();
    const { context } = this.component;
    context.emitter.trigger("dateContextClick", {
      date: context.dateEnv.toDate(hit.dateSpan.range.start),
      allDay: hit.dateSpan.allDay,
      jsEvent: event,
    });
  };

  destroy(): void {
    this.el.removeEventListener("contextmenu", this.handleContextMenu);
  }
}

export default createPlugin({
  name: "date-context-click",
  componentInteractions: [DateContextClicking],
  listenerRefiners: LISTENER_REFINERS,
});

export type { DateContextClickArg };
