"use client";
import { useId, type ComponentProps, type ReactNode } from "react";
import "./pixel-form.css";

export type FormChoice<T extends string | number> = { id: T; name: string };
export function choices<T extends string | number>(values: readonly T[]): FormChoice<T>[] {
  return values.map((id) => ({ id, name: String(id) }));
}
export function PixelInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`pixel-input ${className}`} {...props} />;
}
export function PixelTextarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`pixel-textarea ${className}`} {...props} />;
}
export function PixelForm({ className = "", ...props }: ComponentProps<"form">) {
  return <form className={`pixel-form ${className}`} {...props} />;
}
export function PixelRadioGroup<T extends string | number>({
  label,
  items,
  value,
  onChange,
  render,
  name,
  className = "",
}: {
  className?: string;
  label: string;
  items: readonly FormChoice<T>[];
  value: T;
  onChange: (value: T) => void;
  render?: (item: FormChoice<T>) => ReactNode;
  name?: string;
}) {
  const group = useId();
  return (
    <fieldset className={`pixel-radio-group ${className}`}>
      <legend>{label}</legend>
      <div>
        {items.map((item) => (
          <label className="pixel-radio-option" key={item.id} title={item.name}>
            <input
              type="radio"
              className="pixel-radio-input"
              name={name ?? group}
              value={item.id}
              aria-label={item.name}
              checked={item.id === value}
              onChange={() => onChange(item.id)}
            />
            {render ? render(item) : item.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
