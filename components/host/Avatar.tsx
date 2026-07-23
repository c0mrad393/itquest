"use client";

/**
 * Avatar — renders an operator avatar that is either an emoji (text) or an
 * https image URL (e.g. a Google account photo). Sized by the parent via
 * `className`; defaults to a filled circle.
 */

import { isImageAvatar } from "@/lib/core";

export default function Avatar({
  value,
  className = "h-10 w-10 text-xl",
}: {
  value: string;
  className?: string;
}) {
  if (isImageAvatar(value)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt="avatar"
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-info/20 ${className}`}
    >
      {value}
    </div>
  );
}
