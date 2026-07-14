import type { RefObject } from "react";
import { usePhotoLightbox } from "../hooks/usePhotoLightbox";

type Photo = {
  src: string;
  alt: string;
};

export function PhotoGallery({ photos }: { photos: readonly Photo[] }) {
  const lightbox = usePhotoLightbox(photos.length);

  return (
    <>
      <section className="photo-strip" aria-label="A few favourite photos of Ben, Tori, and Lily">
        <div className="photo-strip-inner">
          {photos.map((photo, index) => (
            <button
              className="photo-thumb"
              type="button"
              key={photo.src}
              ref={(element) => lightbox.setTriggerRef(index, element)}
              aria-label={`Open photo ${index + 1} of ${photos.length}: ${photo.alt}`}
              onClick={() => lightbox.open(index)}
            >
              <img src={photo.src} alt="" loading="lazy" />
              <span className="photo-thumb-label" aria-hidden="true">View photo</span>
            </button>
          ))}
        </div>
      </section>

      {lightbox.activePhotoIndex !== null ? (
        <PhotoLightbox
          activePhotoIndex={lightbox.activePhotoIndex}
          photos={photos}
          onClose={lightbox.close}
          onMove={lightbox.move}
          onTouchStart={lightbox.handleTouchStart}
          onTouchEnd={lightbox.handleTouchEnd}
          dialogRef={lightbox.lightboxRef}
          closeRef={lightbox.lightboxCloseRef}
        />
      ) : null}
    </>
  );
}

type PhotoLightboxProps = {
  activePhotoIndex: number;
  photos: readonly Photo[];
  onClose: () => void;
  onMove: (change: number) => void;
  onTouchStart: (clientX: number | null) => void;
  onTouchEnd: (clientX: number | null) => void;
  dialogRef: RefObject<HTMLDivElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
};

export function PhotoLightbox({
  activePhotoIndex,
  photos,
  onClose,
  onMove,
  onTouchStart,
  onTouchEnd,
  dialogRef,
  closeRef,
}: PhotoLightboxProps) {
  const photo = photos[activePhotoIndex];

  return (
    <div className="lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="lightbox-dialog" role="dialog" aria-modal="true" aria-labelledby="lightbox-position" aria-describedby="lightbox-caption" ref={dialogRef}>
        <div className="lightbox-toolbar">
          <p id="lightbox-position">Photo {activePhotoIndex + 1} of {photos.length}</p>
          <button className="lightbox-control lightbox-close" type="button" ref={closeRef} aria-label="Close photo viewer" onClick={onClose}>×</button>
        </div>
        <div
          className="lightbox-media"
          onTouchStart={(event) => onTouchStart(event.changedTouches[0]?.clientX ?? null)}
          onTouchEnd={(event) => onTouchEnd(event.changedTouches[0]?.clientX ?? null)}
        >
          <img src={photo.src} alt={photo.alt} />
        </div>
        <div className="lightbox-footer">
          <button className="lightbox-control lightbox-nav" type="button" aria-label="Previous photo" onClick={() => onMove(-1)}>← <span>Previous</span></button>
          <p id="lightbox-caption">{photo.alt}</p>
          <button className="lightbox-control lightbox-nav" type="button" aria-label="Next photo" onClick={() => onMove(1)}><span>Next</span> →</button>
        </div>
      </div>
    </div>
  );
}
