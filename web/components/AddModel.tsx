"use client";
import { PixelSelect } from "./ui/pixel-select";
import { choices, PixelForm, PixelInput } from "./ui/pixel-form";

import { useState } from "react";
import { BotHeadPicker } from "./SpritePicker";
import { MotionSurface, PixelButton } from "./ui/game-controls";
import { post } from "@/lib/client";
import { baseModelNames } from "@/lib/model-catalog";
import { BOT_NAMES, type BotId } from "@/lib/looks";
import type { Model } from "@/lib/types";
import { BotArt } from "./BotArt";
import "./add-model.css";

/** A dialog for adding a model and designing its critter. */
export function AddModel({
  open,
  onClose,
  onCreated,
  initialTrainer = "local",
}: {
  initialTrainer?: string;
  open: boolean;
  onClose: () => void;
  onCreated: (m: Model) => void;
}) {
  const [name, setName] = useState("");
  const [trainer, setTrainer] = useState(initialTrainer);
  const [base, setBase] = useState<string>(baseModelNames[0]);
  const [head, setHead] = useState<BotId>("relay");
  const [deposit, setDeposit] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const model = await post<Model>("/api/models", { name, trainer, base, look: { bot: head }, deposit });
      setName("");
      setHead("relay");
      onCreated(model);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <MotionSurface
      modal
      value={open ? true : null}
      className="modal collection-add"
      onDismiss={onClose}
      labelledBy="add-model-title"
    >
      {() => (
        <PixelForm
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <header className="head">
            <h2 id="add-model-title">Add a model</h2>
            <button type="button" className="ghost" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </header>

          <div className="modal-body">
            <div className="preview">
              <BotArt id={head} size={144} animated label={BOT_NAMES[head]} />
            </div>

            <div className="fields">
              <label>
                Trainer handle
                <PixelInput
                  value={trainer}
                  onChange={(e) => setTrainer(e.target.value)}
                  maxLength={32}
                  pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,31}"
                  required
                />
              </label>
              <label>
                Name
                <PixelInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={48}
                  placeholder="e.g. Juniper"
                  required
                  autoFocus
                />
              </label>
              <PixelSelect
                label="Base model"
                items={choices(baseModelNames)}
                value={base}
                onChange={setBase}
              />
              <BotHeadPicker value={head} onChange={setHead} />
              <label>
                First deposit into its vault (USDC)
                <PixelInput
                  type="number"
                  min={0}
                  max={10000}
                  step={10}
                  value={deposit}
                  onChange={(e) => setDeposit(Number(e.target.value))}
                />
              </label>
            </div>
          </div>

          {error && (
            <p className="msg" data-tone="bad" role="alert">
              {error}
            </p>
          )}

          <footer className="modal-foot">
            <PixelButton type="button" onClick={onClose}>
              Cancel
            </PixelButton>
            <PixelButton tone="gold" type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add model"}
            </PixelButton>
          </footer>
        </PixelForm>
      )}
    </MotionSurface>
  );
}
