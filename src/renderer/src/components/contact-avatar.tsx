import React, { useEffect, useRef, useState } from "react";
import type { ContactSuggestion } from "@shared/schemas";

export default function ContactAvatar({
  className = "attendee-field__avatar",
  contact,
  fallbackInitials,
  homeAccountId,
}: {
  className?: string;
  contact: ContactSuggestion;
  fallbackInitials?: string;
  homeAccountId: string | undefined;
}) {
  const avatarRef = useRef<HTMLSpanElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const { contactId, email, name, userPrincipalName } = contact;

  useEffect(() => {
    let cancelled = false;
    setPhoto(null);
    if (!homeAccountId) {
      return;
    }
    const loadPhoto = () => {
      void globalThis.calendarApi.contacts
        .getPhoto({ contactId, email, homeAccountId, name, userPrincipalName })
        .then((value) => {
          if (!cancelled) {
            setPhoto(value);
          }
        })
        .catch(() => {});
    };

    const avatar = avatarRef.current;
    if (!avatar || typeof IntersectionObserver === "undefined") {
      loadPhoto();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          loadPhoto();
        }
      },
      { root: avatar.closest(".attendee-field__dropdown") },
    );
    observer.observe(avatar);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [contactId, email, homeAccountId, name, userPrincipalName]);

  const initials = (name ?? email)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();

  return (
    <span className={className} aria-hidden="true" ref={avatarRef}>
      {photo ? (
        <img alt="" src={photo} onError={() => setPhoto(null)} />
      ) : (
        (fallbackInitials ?? initials)
      )}
    </span>
  );
}
