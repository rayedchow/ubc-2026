"use client";
import { PixelArrow } from "@/components/ui/pixel-arrow";
import { useApi } from "@/lib/client";
import { money } from "@/lib/realms";
import { GymDataTabs } from "./GymDataTabs";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { BenchmarkReference } from "./BenchmarkSign";
import { GymPanel } from "./GymPanel";
import { DoorOpen } from "lucide-react";
import { type RealmGym, type Realm } from "@/lib/realms";

export function GymPlace({
  gym,
  realm,
  seed,
  variant,
  close,
}: {
  gym: RealmGym;
  realm: Realm;
  seed: number;
  variant: number;
  close: () => void;
}) {
  const { data } = useApi<{ gradingVolumeCents: number }>(`/api/gyms/${gym.id}`);
  const enter = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    enter.current?.focus({ preventScroll: true });
  }, []);

  return (
    <GymPanel
      className="map-place"
      label={gym.name + " details"}
      kit={realm.kit}
      eyebrow={realm.name}
      heading={gym.name}
      headingAside={
        <span className="gym-volume" title="Grading usage shared by trainers">
          <strong>{data ? money(data.gradingVolumeCents) : "—"}</strong> grading volume
        </span>
      }
      onClose={close}
      closeLabel="Close gym details"
      art={
        <span
          className="place-building"
          style={{ backgroundImage: `url(/realms/hall-${realm.kit}-${variant}.png)` }}
        />
      }
      footer={
        <Link ref={enter} className="enter-gym" href={`/gyms/${gym.id}?seed=${seed}`}>
          <DoorOpen size={17} /> Enter gym <PixelArrow direction="enter" />
        </Link>
      }
    >
      <BenchmarkReference gym={gym} />
      {gym.description && <p>{gym.description}</p>}
      <GymDataTabs gym={gym} />
    </GymPanel>
  );
}
