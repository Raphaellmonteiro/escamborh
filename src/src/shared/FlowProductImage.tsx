import React, { useEffect, useState } from 'react';

const PLACEHOLDER_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect fill="#e4e4e7" width="320" height="240"/><path fill="#a1a1aa" d="M120 90h80v60h-80z"/></svg>`
  );

type ImgProps = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'auto' | 'sync';
  fetchPriority?: 'high' | 'low' | 'auto';
};

/** Imagem de produto com fallback neutro se a URL quebrar (404, etc.). */
export function FlowProductImage({ src, alt, className, style, loading, decoding, fetchPriority }: ImgProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  if (!src) return null;
  const display = broken ? PLACEHOLDER_SVG : src;
  return (
    <img
      src={display}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      decoding={decoding}
      {...(fetchPriority ? { fetchPriority } : {})}
      onError={() => setBroken(true)}
    />
  );
}
