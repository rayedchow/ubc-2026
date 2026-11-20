"use client";
import { PixelArrow } from "@/components/ui/pixel-arrow";

import { PixelSelect } from "./ui/pixel-select";
import { Tabs } from "radix-ui";
import { BookOpen, Check, Copy, Layers3, BadgeCheck, Files } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { number, skillCount, bands, type RealmGym } from "@/lib/realms";
import { trainingExamples, type GymAttestations } from "@/lib/gym-data";
import { useApi } from "@/lib/client";
import "./gym-data.css";

const tabs = [
  { id: "attestations", name: "Attestations", Icon: BadgeCheck },
  { id: "classes", name: "Classes", Icon: Layers3 },
  { id: "samples", name: "Samples", Icon: Files },
  { id: "api", name: "API Docs", Icon: BookOpen },
] as const;
const subscribeOrigin = () => () => {};
function Attestations({ gym }: { gym: RealmGym }) {
  const { data, error, reload } = useApi<GymAttestations>(`/api/gyms/${gym.id}/attestations`);
  const [page, setPage] = useState(0);
  if (error)
    return (
      <p role="alert">
        {error}{" "}
        <button type="button" onClick={reload}>
          Retry
        </button>
      </p>
    );
  if (!data) return <p role="status">Loading attestations…</p>;
  const from = page * 12;
  const records = data.network === "demo" ? [] : data.records;
  return (
    <>
      <div className="gym-data-heading">
        <h3>Solana attestations</h3>
        {data.network !== "demo" && <span>{data.network}</span>}
      </div>
      {records.length === 0 ? (
        <p className="ledger-empty">No published Solana attestations for this gym.</p>
      ) : (
        <ul className="onchain-records">
          {records.slice(from, from + 12).map((r) => (
            <li key={r.address}>
              <a
                href={`https://explorer.solana.com/address/${r.address}?cluster=${data.network}`}
                target="_blank"
                rel="noreferrer"
              >
                {r.address} <PixelArrow direction="external" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {records.length > 12 && (
        <div className="record-pages">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            {page + 1} / {Math.ceil(records.length / 12)}
          </span>
          <button disabled={from + 12 >= records.length} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </>
  );
}
function SourceCredit({ source }: { source: NonNullable<RealmGym["source"]> }) {
  const licenseUrls: Record<string, string> = {
    "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
    "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
    MIT: "https://github.com/Farama-Foundation/Minigrid/blob/v3.0.0/LICENSE",
  };
  return (
    <p className="gym-source">
      <a href={source.url} target="_blank" rel="noreferrer">
        {source.name} <PixelArrow direction="external" size={10} />
      </a>
      <span>
        {source.edition} ·{" "}
        {licenseUrls[source.license] ? (
          <a href={licenseUrls[source.license]} target="_blank" rel="noreferrer">
            {source.license}
          </a>
        ) : (
          source.license
        )}
      </span>
      {source.collection}
    </p>
  );
}
function Samples({ gym }: { gym: RealmGym }) {
  const [id, setId] = useState(gym.skills[0].id);
  const [index, setIndex] = useState(0);
  const samples = trainingExamples(gym).filter((s) => s.classId === id);
  const example = samples[index];
  return (
    <div className="class-samples">
      <PixelSelect
        label="Training class"
        value={id}
        items={gym.skills}
        onChange={(value) => {
          setId(value);
          setIndex(0);
        }}
      />
      {example ? (
        <article>
          <div className="record-pages">
            <small>
              Public training sample {index + 1} of {samples.length}
            </small>
            {samples.length > 1 && (
              <div>
                <button
                  type="button"
                  aria-label="Previous sample"
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                >
                  <PixelArrow direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Next sample"
                  disabled={index + 1 === samples.length}
                  onClick={() => setIndex(index + 1)}
                >
                  <PixelArrow direction="right" />
                </button>
              </div>
            )}
          </div>
          <p>{example.prompt}</p>
          {example.input && (
            <pre>
              <code>{JSON.stringify(example.input, null, 2)}</code>
            </pre>
          )}
          <small>
            Task ID <code>{example.id}</code>
          </small>
        </article>
      ) : (
        <p>This class has no published training samples.</p>
      )}
      {gym.source && <SourceCredit source={gym.source} />}
    </div>
  );
}

function Classes({ gym }: { gym: RealmGym }) {
  const hasUncalibrated = gym.skills.some((skill) => skill.records?.length);
  const showBands = !hasUncalibrated || gym.skills.some((skill) => skill.training.some(Boolean));
  return (
    <div className="gym-data-scroll">
      <table className="gym-data-table class-distribution">
        <caption>Available training tasks</caption>
        <thead>
          <tr>
            <th scope="col">Class</th>
            {showBands &&
              bands.map((b) => (
                <th key={b} scope="col">
                  {b}
                </th>
              ))}
            {hasUncalibrated && <th scope="col">Uncalibrated</th>}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {gym.skills.map((s) => (
            <tr key={s.id}>
              <th scope="row">{s.name}</th>
              {showBands && s.training.map((v, i) => <td key={i}>{number(v)}</td>)}
              {hasUncalibrated && <td>{number(s.records?.length ?? 0)}</td>}
              <td>
                <b>{number(skillCount(s))}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {gym.source && <SourceCredit source={gym.source} />}
    </div>
  );
}
function Command({ method, title, command }: { method: "GET" | "POST"; title: string; command: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="gym-command">
      <div className="command-head">
        <span data-method={method}>{method}</span>
        <h3>{title}</h3>
        <button
          type="button"
          aria-label={"Copy " + title}
          title="Copy command"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(command);
              setMessage("Copied");
            } catch {
              setMessage("Select the command to copy it.");
            }
          }}
        >
          {message === "Copied" ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre>
        <code>{command}</code>
      </pre>
      <span className="command-status" role="status">
        {message}
      </span>
    </div>
  );
}
function ApiDocs({ gym }: { gym: RealmGym }) {
  const origin = useSyncExternalStore(
    subscribeOrigin,
    () => window.location.origin,
    () => "",
  );
  const path = origin + "/api/gyms/" + encodeURIComponent(gym.id);
  const example = trainingExamples(gym)[0];
  const payload = { botId: "sprig", taskId: example?.id ?? "TASK_ID", output: "Your model response" };
  const slash = String.fromCharCode(92);
  const post = [
    `curl -X POST '${path}/submissions' ${slash}`,
    `  -H 'Content-Type: application/json' ${slash}`,
    `  --data '${JSON.stringify(payload, null, 2)}'`,
  ].join("\n");
  return (
    <div className="gym-api-docs">
      <Command method="GET" title="Get gym and classes" command={`curl '${path}'`} />
      <Command method="GET" title="Get training examples" command={`curl '${path}/examples'`} />
      <Command method="POST" title="Send model output" command={post} />
      <p>
        {example
          ? "Use a registered bot ID and an example ID from the second request. The response contains a submission receipt."
          : "Publish a training example with available tasks to enable model submissions."}
      </p>
    </div>
  );
}
export function GymDataTabs({ gym }: { gym: RealmGym }) {
  return (
    <Tabs.Root className="gym-data-tabs" defaultValue="classes">
      <Tabs.List aria-label="Gym information" className="gym-tab-list">
        {tabs.map(({ id, name, Icon }) => (
          <Tabs.Trigger key={id} value={id}>
            <Icon size={14} aria-hidden="true" />
            {name}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="attestations">
        <Attestations gym={gym} />
      </Tabs.Content>
      <Tabs.Content value="samples">
        <Samples gym={gym} />
      </Tabs.Content>
      <Tabs.Content value="classes">
        <Classes gym={gym} />
      </Tabs.Content>
      <Tabs.Content value="api">
        <ApiDocs gym={gym} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
