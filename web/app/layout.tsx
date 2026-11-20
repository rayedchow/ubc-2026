import type { Metadata } from "next";
import { Figtree, Pixelify_Sans } from "next/font/google";
import { CurrentTrainerProvider } from "@/components/current-trainer";
import { MenuBar } from "@/components/MenuBar";
import "./globals.css";
import "@/components/ui/game-motion.css";

const display = Pixelify_Sans({ variable: "--f-display", subsets: ["latin"] });
const body = Figtree({ variable: "--f-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Modélmon", template: "%s | Modélmon" },
  description:
    "Sealed Gyms for RL. Train against graders your model can't game and earn results nobody can fake.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <CurrentTrainerProvider>
          <MenuBar />
          <main>{children}</main>
        </CurrentTrainerProvider>
      </body>
    </html>
  );
}
