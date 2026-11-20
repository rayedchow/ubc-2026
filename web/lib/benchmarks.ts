import type { RealmGym } from "./realms";
import { developers } from "./creator-profiles";

const providers = {
  mechanize: {
    name: "Mechanize",
    logo: "/providers/mechanize.png",
    assetSource: "https://www.mechanize.work/favicon2.svg",
  },
  mercor: {
    name: "Mercor",
    logo: "/providers/mercor.png",
    assetSource: "https://www.mercor.com/images/m_logo.svg",
  },
  scale: {
    name: "Scale AI",
    logo: "/providers/scale.png",
    assetSource: "https://labs.scale.com/images/favicon.svg",
  },
  surge: {
    name: "Surge AI",
    logo: "/providers/surge.png",
    assetSource:
      "https://cdn.prod.website-files.com/68dc970bd6e945ea3fb0f426/6a5b7e19105f4fce18c0625c_surge-favicon.png",
  },
  chakra: {
    name: "Chakra",
    logo: "/providers/chakra.png",
    assetSource: "https://framerusercontent.com/images/3blzGWNiA6J097Lp9Gb8rCyKRRU.png",
  },
} as const;

type Reference = { provider: keyof typeof providers; name: string; url: string; credit: string };
const references: Record<string, Reference> = {
  accounting: {
    provider: "mercor",
    name: "APEX-Accounting",
    url: "https://www.mercor.com/blog/introducing-the-ai-productivity-index-for-accounting/",
    credit: "Published by Mercor and Ramp.",
  },
  treasury: {
    provider: "scale",
    name: "PRBench",
    url: "https://labs.scale.com/papers/prbench",
    credit: "Scale AI’s finance and law reasoning benchmark.",
  },
  contracts: {
    provider: "chakra",
    name: "GDPx",
    url: "https://www.chakra.dev/journal/semianalysis-gdpx-legal",
    credit: "Chakra contributed legal tasks to SemiAnalysis’s GDPx.",
  },
  research: {
    provider: "mercor",
    name: "APEX-Agents 1.1",
    url: "https://huggingface.co/datasets/mercor/apex-agents-v1.1",
    credit: "Mercor’s professional-services benchmark includes corporate law.",
  },
  emulation: {
    provider: "mechanize",
    name: "GBA Eval",
    url: "https://www.mechanize.work/technical-blog/introducing-gba-eval/",
    credit: "Mechanize’s Game Boy Advance emulator benchmark.",
  },
  engineering: {
    provider: "surge",
    name: "sudo L7",
    url: "https://surgehq.ai/blog/sudo-l7",
    credit: "Surge AI’s software engineering benchmark.",
  },
};
export function benchmarkFor(gymId: string) {
  const reference = Object.hasOwn(references, gymId) ? references[gymId] : undefined;
  return reference ? { ...reference, provider: providers[reference.provider] } : undefined;
}

export function gymSign(gym: RealmGym) {
  const reference = benchmarkFor(gym.id);
  const creator =
    gym.creator ??
    (Object.hasOwn(developers, gym.id) ? developers[gym.id] : undefined) ??
    (reference ? undefined : { handle: "local", avatar: "scout" as const });
  return {
    creator,
    name: creator ? "@" + creator.handle : reference!.provider.name,
    title: reference?.name ?? gym.name,
    image: creator ? "/trainers/" + creator.avatar + ".png" : reference!.provider.logo,
    reference,
  };
}
