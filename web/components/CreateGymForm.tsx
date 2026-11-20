"use client";
import { PixelSelect } from "./ui/pixel-select";
import { choices, PixelForm, PixelInput, PixelTextarea } from "./ui/pixel-form";
import { useState } from "react";
import { bands, realms, realmGyms, stationProps, type RealmGym } from "@/lib/realms";
import { useCurrentTrainer } from "./current-trainer";
import { savedDevicePortrait } from "@/lib/creator-profiles";
import { PixelButton } from "./ui/game-controls";
import { post } from "@/lib/client";
const newClass = (prop: string) => ({
  name: "",
  samples: [{ prompt: "", input: "" }],
  prop,
  training: [0, 0, 0],
});
export function CreateGymForm({ domain, created }: { domain: string; created: (g: RealmGym) => void }) {
  const [realm, setRealm] = useState(domain),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [cents, setCents] = useState(5);
  const [currentTrainer] = useCurrentTrainer();
  const [handle, setHandle] = useState(currentTrainer);
  const [heldOut, setHeldOut] = useState(0),
    [development, setDevelopment] = useState(0);
  const initialProp = (id: string) => realmGyms.find((g) => g.realm === id)!.skills[0].prop;
  const [skills, setSkills] = useState(() => [newClass(initialProp(domain))]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const update = (i: number, patch: Partial<(typeof skills)[number]>) =>
    setSkills((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <PixelForm
      className="gym-create"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          created(
            await post<RealmGym>("/api/gyms", {
              name,
              realm,
              creator: { handle, avatar: savedDevicePortrait(handle.trim()) },
              description,
              cents,
              skills: skills.map(({ samples, ...s }) => {
                const parsed = samples
                  .filter((t) => t.prompt.trim() || t.input.trim())
                  .map((t) => {
                    let input;
                    try {
                      input = t.input.trim() ? JSON.parse(t.input) : undefined;
                    } catch {
                      throw new Error("Enter valid JSON for the " + s.name + " sample input.");
                    }
                    return { prompt: t.prompt, input };
                  });
                return {
                  ...s,
                  example: parsed[0]?.prompt,
                  sampleInput: parsed[0]?.input,
                  additionalSamples: parsed.slice(1),
                };
              }),
              heldOut,
              development,
            }),
          );
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Gym name
        <PixelInput
          autoFocus
          required
          maxLength={72}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Creator handle
        <PixelInput
          value={handle}
          required
          maxLength={32}
          pattern={String.raw`[A-Za-z0-9][A-Za-z0-9._\-]*`}
          onChange={(e) => setHandle(e.target.value)}
        />
      </label>
      <div className="create-pair">
        <PixelSelect label="Domain" items={realms} value={realm} onChange={setRealm} />
        <label>
          Cents per rep
          <PixelInput
            type="number"
            required
            min={0}
            max={10000}
            value={cents}
            onChange={(e) => setCents(e.target.valueAsNumber || 0)}
          />
        </label>
      </div>
      <label>
        Description
        <PixelInput maxLength={400} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {skills.map((s, i) => (
        <fieldset key={i}>
          <legend>Training class {i + 1}</legend>
          <div className="create-pair">
            <label>
              Class name
              <PixelInput
                required
                maxLength={72}
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
            </label>
            <PixelSelect
              label="Station"
              items={choices(stationProps)}
              value={s.prop}
              onChange={(prop) => update(i, { prop })}
            />
          </div>
          <details className="create-samples">
            <summary>Public training samples</summary>
            {s.samples.map((sample, j) => (
              <div key={j}>
                <label>
                  Sample {j + 1} prompt
                  <PixelInput
                    maxLength={500}
                    value={sample.prompt}
                    onChange={(e) =>
                      update(i, {
                        samples: s.samples.map((t, k) => (k === j ? { ...t, prompt: e.target.value } : t)),
                      })
                    }
                  />
                </label>
                <label>
                  Input data (optional JSON object)
                  <PixelTextarea
                    rows={2}
                    maxLength={16000}
                    value={sample.input}
                    onChange={(e) =>
                      update(i, {
                        samples: s.samples.map((t, k) => (k === j ? { ...t, input: e.target.value } : t)),
                      })
                    }
                  />
                </label>
                {s.samples.length > 1 && (
                  <button
                    type="button"
                    onClick={() => update(i, { samples: s.samples.filter((_, k) => k !== j) })}
                  >
                    Remove sample
                  </button>
                )}
              </div>
            ))}
            {s.samples.length < 16 && (
              <button
                type="button"
                onClick={() => update(i, { samples: [...s.samples, { prompt: "", input: "" }] })}
              >
                Add sample
              </button>
            )}
          </details>
          <div className="create-counts">
            {bands.map((band, j) => (
              <label key={band}>
                {band} tasks
                <PixelInput
                  type="number"
                  required
                  min={0}
                  max={1000000}
                  value={s.training[j]}
                  onChange={(e) =>
                    update(i, {
                      training: s.training.map((v, k) => (k === j ? e.target.valueAsNumber || 0 : v)),
                    })
                  }
                />
              </label>
            ))}
          </div>
          {skills.length > 1 && (
            <button type="button" onClick={() => setSkills((all) => all.filter((_, j) => i !== j))}>
              Remove class
            </button>
          )}
        </fieldset>
      ))}
      <div className="create-pair">
        <label>
          Development tasks
          <PixelInput
            type="number"
            min={0}
            max={1000000000}
            value={development}
            onChange={(e) => setDevelopment(e.target.valueAsNumber || 0)}
          />
        </label>
        <label>
          Held-out test tasks
          <PixelInput
            type="number"
            min={0}
            max={1000000000}
            value={heldOut}
            onChange={(e) => setHeldOut(e.target.valueAsNumber || 0)}
          />
        </label>
      </div>
      <button
        type="button"
        className="create-add"
        disabled={skills.length >= 100}
        onClick={() => setSkills((rows) => [...rows, newClass(initialProp(realm))])}
      >
        + Add class
      </button>
      {error && <p role="alert">{error}</p>}
      <PixelButton type="submit" tone="gold" disabled={busy}>
        {busy ? "Creating…" : "Create gym"}
      </PixelButton>
    </PixelForm>
  );
}
