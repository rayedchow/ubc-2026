"use client";
import { PixelCheck, PixelSelect } from "./ui/pixel-select";
import { choices, PixelInput } from "./ui/pixel-form";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, usd } from "@/lib/client";
import { CATEGORIES, categoryById, gymById } from "@/lib/gyms";
import type { CategoryId, GradingMethod, SearchHit, SearchMode } from "@/lib/types";
import { t } from "@/lib/words";

const GRADING: GradingMethod[] = ["Hidden tests", "Reference diff", "End-state check", "Simulation", "Expert rubric"];
const PRICES = [
  { label: "Any price", value: "" },
  { label: "Up to $0.10", value: "0.1" },
  { label: "Up to $1", value: "1" },
  { label: "Up to $5", value: "5" },
];

/**
 * Search across every Gym in every category. Typing ranks by meaning (or by
 * exact words); the dropdowns are exact filters and apply either way.
 */
export function GymSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<SearchMode>("meaning");
  const [category, setCategory] = useState<CategoryId | "">("");
  const [grading, setGrading] = useState<GradingMethod | "">("");
  const [openOnly, setOpenOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Ask the server shortly after the last change, and ignore answers that arrive out of order.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    const params = new URLSearchParams({ q, mode });
    if (category) params.set("category", category);
    if (grading) params.set("grading", grading);
    if (openOnly) params.set("status", "open");
    if (maxPrice) params.set("maxPrice", maxPrice);
    const timer = setTimeout(() => {
      api<{ results: SearchHit[] }>(`/api/gyms/search?${params}`)
        .then((r) => {
          if (stale) return;
          setHits(r.results);
          setError(null);
        })
        .catch((e: Error) => !stale && setError(e.message));
    }, 120);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, q, mode, category, grading, openOnly, maxPrice]);

  // "/" jumps to search from anywhere; Escape and outside clicks close it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      } else if (e.key === "Escape") {
        setOpen(false);
        input.current?.blur();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(".pixel-select-menu")) return;
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  const filtered = Boolean(category || grading || openOnly || maxPrice);

  return (
    <div className="search" ref={box}>
      <label className="glass search-field">
        <span className="sr-only">Search registered gyms</span>
        <PixelInput
          ref={input}
          type="search"
          value={q}
          placeholder="Search registered gyms by task or name"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          aria-controls="gym-search-results"
        />
        <kbd>/</kbd>
      </label>

      {open && (
        <div className="glass search-panel" id="gym-search-results">
          <div className="search-controls">
            <div className="segmented" role="group" aria-label="How to match">
              <button type="button" aria-pressed={mode === "meaning"} onClick={() => setMode("meaning")}>
                By meaning
              </button>
              <button type="button" aria-pressed={mode === "exact"} onClick={() => setMode("exact")}>
                Exact words
              </button>
            </div>
            <PixelSelect label="Category" value={category} onChange={setCategory} items={[{id:"",name:"All categories"},...CATEGORIES]}/>
            <PixelSelect label="Grading method" value={grading} onChange={setGrading} items={[{id:"",name:"Any grading"},...choices(GRADING)]}/>
            <PixelSelect label="Price" value={maxPrice} onChange={setMaxPrice} items={PRICES.map(p=>({id:p.value,name:p.label}))}/>
            <label className="check">
              <PixelCheck checked={openOnly} onChange={()=>setOpenOnly(!openOnly)} />
              Open now
            </label>
          </div>

          {error && (
            <p className="msg" data-tone="bad" role="alert">
              {error}
            </p>
          )}

          {hits && (
            <p className="search-count" aria-live="polite">
              {hits.length === 0
                ? mode === "exact"
                  ? "No Gym contains all of those words. Try fewer words, or switch to By meaning."
                  : filtered
                    ? "Nothing matches with these filters. Loosen one and try again."
                    : "No Gym is close to that yet. Try describing the task your model should do."
                : `${hits.length} ${hits.length === 1 ? "Gym" : "Gyms"}${q.trim() ? (mode === "meaning" ? ", closest first" : " containing every word") : ""}`}
            </p>
          )}

          <ul className="search-results">
            {hits?.map((hit) => {
              const gym = gymById(hit.id);
              if (!gym) return null;
              return (
                <li key={hit.id}>
                  <Link href={`/gyms/${gym.id}`} className="gym-row">
                    <i className="roof-dot" style={{ background: gym.roof }} />
                    <span className="row-main">
                      <b>{gym.name}</b>
                      <span>
                        {gym.taskType} in {categoryById(gym.category)?.name}, {usd(gym.pricePerRep)} per {t.rep}, {gym.grading.method.toLowerCase()}
                      </span>
                      {q.trim() && hit.why.length > 0 && <span className="why-match">Matched on: {hit.why.join(", ")}</span>}
                    </span>
                    {gym.status !== "open" && (
                      <span className="tag" data-status={gym.status}>
                        {gym.status === "exclusive" ? "Exclusive" : "Soon"}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
