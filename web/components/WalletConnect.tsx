"use client";

import bs58 from "bs58";
import { Popover } from "radix-ui";
import { Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, post } from "@/lib/client";
import { useCurrentTrainer } from "./current-trainer";
import { PixelButton } from "./ui/game-controls";
import "./wallet-connect.css";

type Key = { toString(): string };

/**
 * The part of an injected Solana wallet this button needs. Phantom, Solflare
 * and Backpack all expose this shape on `window`, so no wallet library is
 * required to connect or sign.
 */
type Provider = {
  publicKey?: Key | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<unknown>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, display?: "utf8"): Promise<{ signature: Uint8Array }>;
  on?(event: "accountChanged" | "disconnect", handler: (key?: Key | null) => void): void;
  off?(event: "accountChanged" | "disconnect", handler: (key?: Key | null) => void): void;
};

type WalletWindow = Window & {
  phantom?: { solana?: Provider };
  solflare?: Provider;
  backpack?: Provider;
};

const WALLETS: { name: string; url: string; find: (w: WalletWindow) => Provider | undefined }[] = [
  { name: "Phantom", url: "https://phantom.com/download", find: (w) => w.phantom?.solana },
  { name: "Solflare", url: "https://solflare.com/download", find: (w) => w.solflare },
  { name: "Backpack", url: "https://backpack.app/download", find: (w) => w.backpack },
];

const providerFor = (name: string) => WALLETS.find((x) => x.name === name)?.find(window as WalletWindow);

/** Remembers which wallet was used, so a return visit reconnects without a prompt. */
const KEY = "modelmon-wallet";

const shorten = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** 4001 is the standard "user said no" code. That is a choice, not a failure. */
const declined = (e: unknown) => (e as { code?: number })?.code === 4001;

function remember(name: string | null) {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked; the wallet then just asks again next visit.
  }
}

/**
 * A floating button, centred at the bottom of the screen, that connects a
 * Solana wallet and links it to the current trainer on the server.
 */
export function WalletConnect() {
  const [handle, setHandle] = useCurrentTrainer();
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState<string[]>([]);
  const [active, setActive] = useState<{ name: string; address: string } | null>(null);
  /** The trainer the server has on record for this wallet. Null until linked. */
  const [linked, setLinked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /** Asks the server who this wallet belongs to and, if anyone, switches to that trainer. */
  const lookUp = useCallback(
    async (address: string) => {
      const { trainer } = await api<{ trainer: string | null }>(`/api/wallet/link?address=${encodeURIComponent(address)}`);
      setLinked(trainer);
      if (trainer) setHandle(trainer);
      return trainer;
    },
    [setHandle],
  );

  /** Proves ownership by signing a one-time message, then records wallet → trainer on the server. */
  const link = useCallback(
    async (name: string, address: string, trainer: string) => {
      const provider = providerFor(name);
      if (!provider) return;
      setBusy("Linking");
      setError(null);
      try {
        const { message } = await post<{ message: string }>("/api/wallet/challenge", { address });
        const { signature } = await provider.signMessage(new TextEncoder().encode(message), "utf8");
        const done = await post<{ trainer: string }>("/api/wallet/link", { address, trainer, signature: bs58.encode(signature) });
        setLinked(done.trainer);
        setHandle(done.trainer);
      } catch (e) {
        if (!declined(e)) setError((e as Error).message || "The wallet could not be linked. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [setHandle],
  );

  // Wallet extensions inject themselves after the page loads, so look a moment later.
  useEffect(() => {
    const timer = setTimeout(() => {
      const w = window as WalletWindow;
      setInstalled(WALLETS.filter((x) => x.find(w)).map((x) => x.name));
      let last: string | null = null;
      try {
        last = localStorage.getItem(KEY);
      } catch {
        last = null;
      }
      const provider = last ? providerFor(last) : undefined;
      // Only succeeds if the user approved this site before; never opens a prompt.
      provider
        ?.connect({ onlyIfTrusted: true })
        .then(() => {
          if (!provider.publicKey) return;
          const address = provider.publicKey.toString();
          setActive({ name: last!, address });
          return lookUp(address);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [lookUp]);

  // Follow account switches and disconnects made inside the wallet itself.
  useEffect(() => {
    if (!active) return;
    const provider = providerFor(active.name);
    if (!provider?.on) return;
    const clear = () => {
      setActive(null);
      setLinked(null);
      remember(null);
    };
    const onAccount = (key?: Key | null) => {
      if (!key) return clear();
      setActive({ name: active.name, address: key.toString() });
      lookUp(key.toString()).catch(() => {});
    };
    provider.on("accountChanged", onAccount);
    provider.on("disconnect", clear);
    return () => {
      provider.off?.("accountChanged", onAccount);
      provider.off?.("disconnect", clear);
    };
  }, [active, lookUp]);

  const connect = useCallback(
    async (name: string) => {
      const provider = providerFor(name);
      if (!provider) return;
      setBusy(name);
      setError(null);
      try {
        await provider.connect();
        if (!provider.publicKey) throw new Error("no key");
        const address = provider.publicKey.toString();
        setActive({ name, address });
        remember(name);
        setOpen(false);
        // A wallet the server already knows just signs in; a new one is linked to the current trainer.
        const known = await lookUp(address);
        if (!known) await link(name, address, handle);
      } catch (e) {
        if (!declined(e)) setError((e as Error).message === "no key" ? `${name} did not connect. Unlock it and try again.` : (e as Error).message);
        setOpen(true);
      } finally {
        setBusy(null);
      }
    },
    [handle, link, lookUp],
  );

  async function disconnect() {
    await (active && providerFor(active.name))?.disconnect().catch(() => {});
    setActive(null);
    setLinked(null);
    remember(null);
    setOpen(false);
  }

  async function copy() {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy. Select the address and copy it by hand.");
    }
  }

  return (
    <div className="wallet-connect">
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          // With exactly one wallet installed there is nothing to choose, so connect straight away.
          if (next && !active && installed.length === 1) connect(installed[0]);
          else setOpen(next);
          if (!next) setError(null);
        }}
      >
        <Popover.Trigger asChild>
          <PixelButton tone={active ? "parchment" : "gold"} className="wallet-button" data-connected={active ? "" : undefined}>
            <Wallet size={18} aria-hidden />
            {busy ? (busy === "Linking" ? "Linking…" : "Connecting…") : active ? shorten(active.address) : "Connect wallet"}
          </PixelButton>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="wallet-menu" side="top" align="center" sideOffset={10} aria-label="Wallet">
            {active ? (
              <>
                <p className="wallet-menu-title">{active.name} connected</p>
                <p className="wallet-address">{active.address}</p>
                {linked ? (
                  <p className="wallet-menu-note">
                    Linked to trainer <b>{linked}</b>.
                  </p>
                ) : (
                  <button type="button" disabled={busy !== null} onClick={() => link(active.name, active.address, handle)}>
                    Link to trainer {handle}
                  </button>
                )}
                <button type="button" onClick={copy}>
                  {copied ? "Copied" : "Copy address"}
                </button>
                <button type="button" onClick={disconnect}>
                  Disconnect
                </button>
              </>
            ) : installed.length > 0 ? (
              <>
                <p className="wallet-menu-title">Choose a wallet</p>
                {installed.map((name) => (
                  <button key={name} type="button" disabled={busy !== null} onClick={() => connect(name)}>
                    {busy === name ? `Opening ${name}…` : name}
                  </button>
                ))}
              </>
            ) : (
              <>
                <p className="wallet-menu-title">No Solana wallet found</p>
                <p className="wallet-menu-note">Install one in this browser, then reload the page.</p>
                {WALLETS.map((w) => (
                  <a key={w.name} href={w.url} target="_blank" rel="noreferrer">
                    Get {w.name}
                  </a>
                ))}
              </>
            )}
            {error && (
              <p className="wallet-menu-error" role="alert">
                {error}
              </p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
