"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Key,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";
import { Button } from "./button";

/** Keep the previous content mounted until its exit finishes, including when selection is cleared. */
export function MotionSurface<T>({
  value,
  children,
  className,
  modal = false,
  onDismiss,
  label,
  labelledBy,
}: {
  value: T | null;
  children: (item: T) => ReactNode;
  className: string;
  modal?: boolean;
  onDismiss?: () => void;
  label?: string;
  labelledBy?: string;
}) {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  const ref = useRef<HTMLElement | null>(null);
  const backdropPress = useRef(false);
  const open = value !== null;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dialog = el instanceof HTMLDialogElement ? el : null;
    if (open) {
      if (dialog && !dialog.open) dialog.showModal();
      return;
    }
    if (last === null) return;
    let cancelled = false;
    Promise.allSettled(el.getAnimations().map((a) => a.finished)).then(() => {
      if (!cancelled) {
        dialog?.close();
        setLast(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, last]);
  const shown = value ?? last;
  if (shown === null) return null;
  const attrs = {
    className: className + " motion-surface",
    "data-motion": open ? "in" : "out",
    "aria-label": label,
    "aria-labelledby": labelledBy,
  };
  if (modal)
    return (
      <dialog
        {...attrs}
        ref={(el) => {
          ref.current = el;
        }}
        onCancel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss?.();
        }}
        onPointerDownCapture={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          backdropPress.current =
            e.target === e.currentTarget &&
            (e.clientX < rect.left ||
              e.clientX > rect.right ||
              e.clientY < rect.top ||
              e.clientY > rect.bottom);
        }}
        onPointerCancel={() => {
          backdropPress.current = false;
        }}
        onClick={(e) => {
          const startedOutside = backdropPress.current;
          backdropPress.current = false;
          if (startedOutside && e.target === e.currentTarget) {
            const rect = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < rect.left ||
              e.clientX > rect.right ||
              e.clientY < rect.top ||
              e.clientY > rect.bottom
            )
              onDismiss?.();
          }
        }}
      >
        {children(shown)}
      </dialog>
    );
  return (
    <section
      {...attrs}
      ref={(el) => {
        ref.current = el;
      }}
      inert={!open}
    >
      {children(shown)}
    </section>
  );
}

export function ChoiceBar<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: readonly { id: T; name: string; accent?: string; icon?: ReactNode }[];
  value: T | null;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={className} role="group" aria-label={label}>
      {items.map((item) => (
        <Button
          variant="pixel"
          key={item.id}
          data-choice={item.id}
          style={{ "--accent": item.accent } as CSSProperties}
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.accent && <i aria-hidden="true" />}
          {item.icon}
          {item.name}
        </Button>
      ))}
    </div>
  );
}
export function PixelList<T>({
  items,
  getKey,
  children,
  className,
}: {
  items: readonly T[];
  getKey: (item: T) => Key;
  children: (item: T) => ReactNode;
  className?: string;
}) {
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={getKey(item)}>{children(item)}</li>
      ))}
    </ul>
  );
}
const pixelTones = { parchment: "pixel", gold: "pixelGold", light: "pixelLight" } as const;

export function PixelButton({
  tone = "parchment",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof pixelTones }) {
  return <Button type="button" variant={pixelTones[tone]} {...props} />;
}
