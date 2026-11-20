import { PixelArrow } from "@/components/ui/pixel-arrow";
import Image from "next/image";
import { gymSign } from "@/lib/benchmarks";
import type { RealmGym } from "@/lib/realms";

export function BenchmarkSign({ gym }: { gym: RealmGym }) {
  const sign = gymSign(gym);
  return (
    <>
      <span className={sign.creator ? "sign-avatar" : "sign-mark"}>
        <Image
          src={sign.image}
          width={sign.creator ? 40 : 18}
          height={sign.creator ? 56 : 18}
          alt=""
          unoptimized
        />
      </span>
      <span className="sign-lines">
        <span className="sign-provider">{sign.name}</span>
        <span>{sign.title}</span>
      </span>
    </>
  );
}

export function BenchmarkReference({ gym }: { gym: RealmGym }) {
  const { creator, reference } = gymSign(gym);
  return (
    <div className="benchmark-reference">
      {creator && (
        <div className="creator-credit">
          <span className="sign-avatar">
            <Image src={`/trainers/${creator.avatar}.png`} width={40} height={56} alt="" unoptimized />
          </span>
          <strong>@{creator.handle}</strong>
          <span>· Independent developer</span>
        </div>
      )}
      {reference && (
        <>
          <a href={reference.url} target="_blank" rel="noreferrer">
            <span className="sign-mark">
              <Image src={reference.provider.logo} width={16} height={16} alt="" unoptimized />
            </span>
            Benchmark reference · {reference.provider.name} · {reference.name} <PixelArrow direction="external" />
          </a>
          <p>{reference.credit} Training sources appear in Classes and Samples.</p>
        </>
      )}
    </div>
  );
}
