function normalizeEventResponseValue(value: null | string | undefined): null | string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "accepted" || normalized === "declined" || normalized === "tentative") {
    return normalized;
  }

  if (normalized === "tentativelyaccepted") {
    return "tentative";
  }

  if (normalized === "none" || normalized === "notresponded" || normalized === "organizer") {
    return "none";
  }

  return normalized;
}

function isDeclinedEventResponse(value: null | string | undefined): boolean {
  return normalizeEventResponseValue(value) === "declined";
}

export { isDeclinedEventResponse, normalizeEventResponseValue };
