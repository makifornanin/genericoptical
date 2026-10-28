/* eslint-disable @next/next/no-img-element -- pre-rendered WebP sets are served as-is (no image optimisation needed) */
import type { ImageSet } from "@/lib/media";

/**
 * A rendered image set (srcset of pre-sized WebP files), or the dashboard's own product image as a
 * contained fallback. `sizes` describes the rendered width so the browser picks the right file.
 */
export function Picture({ image, fallback, alt, sizes, className, priority = false }: { image: ImageSet | null; fallback?: string | null; alt: string; sizes: string; className?: string; priority?: boolean }) {
  if (image) {
    return (
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={sizes}
        width={image.width}
        height={image.height}
        alt={alt}
        className={className}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
      />
    );
  }
  if (fallback) return <img src={fallback} alt={alt} className={`${className ?? ""} is-fallback`.trim()} loading={priority ? "eager" : "lazy"} decoding="async" />;
  return null;
}
