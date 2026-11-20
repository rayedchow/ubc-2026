"use client";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { PixelSheet } from "./ui/pixel-sheet";
import "./gym-panel.css";

/** The same illustrated panel frames places on the map and stations inside a room. */
export function GymPanel({
  className,
  kit,
  eyebrow,
  heading,
  headingAside,
  art,
  children,
  footer,
  onClose,
  closeLabel,
  label,
  dialog = false,
}: {
  dialog?: boolean;
  className: string;
  kit: string;
  eyebrow: string;
  heading: string;
  headingAside?: ReactNode;
  art: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  label: string;
}) {
  return (
    <PixelSheet className={`gym-panel ${className}`} aria-label={label} role={dialog ? "dialog" : undefined}>
      <div className="place-illustration" data-kit={kit}>
        <span className="place-domain">{eyebrow}</span>
        {art}
        {onClose && (
          <button className="place-close" type="button" onClick={onClose} aria-label={closeLabel}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="place-body">
        {headingAside ? (
          <div className="place-heading">
            <h2>{heading}</h2>
            {headingAside}
          </div>
        ) : (
          <h2>{heading}</h2>
        )}
        {children}
      </div>
      {footer}
    </PixelSheet>
  );
}
