"use client";

import { useRef, useState } from "react";
import type { ImageSet } from "@/lib/media";
import { Picture } from "./Picture";

const VIEW_ALT: Record<string, string> = { front: "from the front", angle: "at an angle", side: "from the side", top: "from above", detail: "detail" };

/** Product images: stacked grid on desktop, swipeable with position dots on phones. */
export function Gallery({ name, colourLabel, images, fallback }: { name: string; colourLabel: string; images: { view: string; image: ImageSet }[]; fallback: string | null }) {
  const [current, setCurrent] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = strip.current;
    if (el && el.clientWidth) setCurrent(Math.round(el.scrollLeft / el.clientWidth));
  };
  if (!images.length) {
    return (
      <div className="gallery">
        <figure>
          <Picture image={null} fallback={fallback} alt={name} sizes="(min-width: 1000px) 60vw, 100vw" priority />
        </figure>
      </div>
    );
  }
  return (
    <div>
      <div className="gallery" ref={strip} onScroll={onScroll} aria-label={`${name} images`} role="region" tabIndex={0}>
        {images.map(({ view, image }, i) => (
          <figure key={view}>
            <Picture
              image={image}
              alt={image.illustrative ? `Illustrative photo for ${name}` : `${name} in ${colourLabel}, ${VIEW_ALT[view] ?? view}`}
              sizes={i === 0 ? "(min-width: 1000px) 62vw, 100vw" : "(min-width: 1000px) 31vw, 100vw"}
              priority={i === 0}
            />
            {/* A stock photo stands in for products without their own photography: say so. */}
            {image.illustrative ? <figcaption>Illustrative photo</figcaption> : null}
          </figure>
        ))}
      </div>
      {images.length > 1 ? (
        <div className="gallery-dots" aria-hidden="true">
          {images.map((img, i) => (
            <span key={img.view} className={i === current ? "is-current" : undefined} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
