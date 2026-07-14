import { useCallback, useEffect, useRef, useState } from "react";
import { getWrappedPhotoIndex } from "../lib/lottery";

export function usePhotoLightbox(photoCount: number) {
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const photoButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement | null>(null);
  const triggerIndex = useRef(0);
  const touchStartX = useRef<number | null>(null);
  const lightboxOpen = activePhotoIndex !== null;

  const open = useCallback((index: number): void => {
    triggerIndex.current = index;
    setActivePhotoIndex(index);
  }, []);

  const move = useCallback((change: number): void => {
    setActivePhotoIndex((current) => current === null ? null : getWrappedPhotoIndex(current, change, photoCount));
  }, [photoCount]);

  const close = useCallback((): void => {
    setActivePhotoIndex(null);
  }, []);

  const setTriggerRef = useCallback((index: number, element: HTMLButtonElement | null): void => {
    photoButtonRefs.current[index] = element;
  }, []);

  const handleTouchStart = useCallback((clientX: number | null): void => {
    touchStartX.current = clientX;
  }, []);

  const handleTouchEnd = useCallback((clientX: number | null): void => {
    if (touchStartX.current === null) return;
    const distance = (clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) >= 48) move(distance > 0 ? -1 : 1);
  }, [move]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const triggerElement = photoButtonRefs.current[triggerIndex.current];
    document.body.style.overflow = "hidden";
    window.setTimeout(() => lightboxCloseRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key !== "Tab" || !lightboxRef.current) return;

      const focusable = Array.from(lightboxRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      triggerElement?.focus();
    };
  }, [close, lightboxOpen, move]);

  return {
    activePhotoIndex,
    close,
    handleTouchEnd,
    handleTouchStart,
    lightboxCloseRef,
    lightboxRef,
    move,
    open,
    setTriggerRef,
  };
}
