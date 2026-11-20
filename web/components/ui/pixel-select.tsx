"use client";
import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { useCallback, useId, useState } from "react";
import type { FormChoice } from "./pixel-form";
import "./pixel-select.css";

export function PixelSelect<T extends string | number>({
  label,
  items,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  items: readonly FormChoice<T>[];
  disabled?: boolean;
  value: T;
  onChange: (id: T) => void;
}) {
  const labelId = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const anchor = useCallback(
    (node: HTMLButtonElement | null) => setDialog(node?.closest("dialog") ?? null),
    [],
  );
  // Radix reserves the empty string for its placeholder; filters can use it as an actual option.
  const key = (id: T) => "option/" + id;
  return (
    <div className="pixel-select-field">
      <span id={labelId}>{label}</span>
      <Select.Root
        disabled={disabled || !items.length}
        value={key(value)}
        onValueChange={(value) => {
          const item = items.find((i) => key(i.id) === value);
          if (item) onChange(item.id);
        }}
      >
        <Select.Trigger ref={anchor} className="pixel-select-trigger" aria-labelledby={labelId}>
          <Select.Value placeholder="Choose…" />
          <Select.Icon>
            <ChevronDown size={15} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal container={dialog}>
          <Select.Content
            className="pixel-select-menu"
            onEscapeKeyDown={(e) => e.stopPropagation()}
            position="popper"
            align="start"
            sideOffset={3}
            collisionPadding={10}
          >
            <Select.Viewport>
              {items.map((item) => (
                <Select.Item
                  key={item.id}
                  value={key(item.id)}
                  textValue={item.name}
                  className="pixel-select-option"
                >
                  <Select.ItemText>{item.name}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export function PixelCheck({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <span className="pixel-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <Check size={12} strokeWidth={3} aria-hidden="true" />
    </span>
  );
}
