"use client";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";

/** One active trainer for the party, shared navigation, and creator forms. */
const TrainerContext = createContext<[string, Dispatch<SetStateAction<string>>] | null>(null);
export function CurrentTrainerProvider({ children }: { children: ReactNode }) {
  const state = useState("local");
  return <TrainerContext.Provider value={state}>{children}</TrainerContext.Provider>;
}
export function useCurrentTrainer() {
  const value = useContext(TrainerContext);
  if (!value) throw new Error("CurrentTrainerProvider is missing");
  return value;
}
