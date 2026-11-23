import type { BrowserContext, Page } from "@playwright/test";

/*
 * A stand-in for the Android app's `window.wtgNet` (src/net/lan.ts, android/…/LanBridge.java) in browser tests: each
 * browser context is one phone with its own address, and this relay is the Wi-Fi between them. Rooms are announced
 * and found as NsdManager would (a change re-announced as lost, then found), connections carry lines both ways, and
 * every event reaches its page in order through `window.wtgNetEvent`, as the app's `evaluateJavascript` does.
 * Test-only: nothing of it is in the page.
 */
export interface FakeService {
  name: string;
  address: string;
  port: number;
  attrs: Record<string, string>;
}
type Op =
  | { op: "host"; info: string }
  | { op: "update"; attrs: string }
  | { op: "stopHost" }
  | { op: "discover" }
  | { op: "stopDiscover" }
  | { op: "connect"; address: string; peer: string }
  | { op: "send"; peer: string; text: string }
  | { op: "close"; peer: string };
interface Phone {
  page: Page;
  ip: string;
  hosting: string | null;
  finding: boolean;
  /** My peer id → the other end. */
  sockets: Map<string, { phone: Phone; peer: string; accepted: boolean }>;
  chain: Promise<unknown>;
}
export const FAKE_PORT = 47297;

/** The page's side: `window.wtgNet` handing every call to the relay (`wtgRelay`), events back by `__wtgDeliver`. */
function fakeBridge() {
  const w = window as unknown as Record<string, unknown> & { wtgRelay(op: unknown): Promise<void>; wtgNetEvent?: (e: unknown) => void },
    open = new Set<string>();
  let n = 0;
  const relay = (op: unknown) => void w.wtgRelay(op);
  w.__wtgDeliver = (e: { e: string; peer?: string }) => {
    if (e.peer && (e.e === "open" || e.e === "incoming")) open.add(e.peer);
    if (e.peer && (e.e === "close" || e.e === "fail")) open.delete(e.peer);
    w.wtgNetEvent?.(e);
  };
  w.wtgNet = {
    available: () => true,
    host: (info: string) => relay({ op: "host", info }),
    update: (attrs: string) => relay({ op: "update", attrs }),
    stopHost: () => relay({ op: "stopHost" }),
    discover: () => relay({ op: "discover" }),
    stopDiscover: () => relay({ op: "stopDiscover" }),
    connect: (address: string) => {
      const peer = `c${++n}`;
      relay({ op: "connect", address, peer });
      return peer;
    },
    send: (peer: string, text: string) => {
      if (!open.has(peer)) return false;
      relay({ op: "send", peer, text });
      return true;
    },
    close: (peer: string) => {
      open.delete(peer);
      relay({ op: "close", peer });
    },
  };
}

export class FakeWifi {
  private phones: Phone[] = [];
  readonly services = new Map<string, FakeService & { owner: Phone | null }>();
  private serial = 0;
  /** Makes `context` a phone at `ip` (before its page is opened). */
  async attach(context: BrowserContext, ip: string) {
    await context.addInitScript(fakeBridge);
    await context.exposeBinding("wtgRelay", ({ page }, op: Op) => this.handle(this.phone(page, ip), op));
  }
  private phone(page: Page, ip: string): Phone {
    let phone = this.phones.find((p) => p.page === page);
    if (!phone) {
      phone = { page, ip, hosting: null, finding: false, sockets: new Map(), chain: Promise.resolve() };
      this.phones.push(phone);
    }
    return phone;
  }
  /** An event for a phone's page, after the ones before it. */
  private emit(phone: Phone, event: Record<string, unknown>) {
    phone.chain = phone.chain.then(() => phone.page.evaluate((e) => (window as unknown as { __wtgDeliver(e: unknown): void }).__wtgDeliver(e), event).catch(() => {}));
  }
  /** A room announced from outside the test's pages (another app version, say). */
  announce(service: FakeService, owner: Phone | null = null) {
    const again = this.services.has(service.name);
    this.services.set(service.name, { ...service, owner });
    for (const p of this.phones)
      if (p.finding) {
        if (again) this.emit(p, { e: "lost", name: service.name });
        this.emit(p, { e: "found", ...service });
      }
  }
  private withdraw(name: string) {
    if (!this.services.delete(name)) return;
    for (const p of this.phones) if (p.finding) this.emit(p, { e: "lost", name });
  }
  private handle(phone: Phone, op: Op) {
    switch (op.op) {
      case "host": {
        const { id, attrs } = JSON.parse(op.info);
        phone.hosting = `wtg-${id}`;
        this.emit(phone, { e: "hosting", address: phone.ip, port: FAKE_PORT });
        return this.announce({ name: phone.hosting, address: phone.ip, port: FAKE_PORT, attrs: { ...attrs, a: `${phone.ip}:${FAKE_PORT}` } }, phone);
      }
      case "update":
        if (phone.hosting) this.announce({ name: phone.hosting, address: phone.ip, port: FAKE_PORT, attrs: { ...JSON.parse(op.attrs), a: `${phone.ip}:${FAKE_PORT}` } }, phone);
        return;
      case "stopHost":
        if (phone.hosting) this.withdraw(phone.hosting);
        phone.hosting = null;
        for (const [peer, s] of [...phone.sockets]) if (s.accepted) this.end(phone, peer);
        return;
      case "discover":
        phone.finding = true;
        for (const s of this.services.values()) this.emit(phone, { e: "found", name: s.name, address: s.address, port: s.port, attrs: s.attrs });
        return;
      case "stopDiscover":
        phone.finding = false;
        return;
      case "connect": {
        const host = this.phones.find((p) => p.hosting && `${p.ip}:${FAKE_PORT}` === op.address);
        if (!host) return this.emit(phone, { e: "fail", peer: op.peer, text: "그 주소에 열린 방이 없습니다" });
        const theirs = `h${++this.serial}`;
        phone.sockets.set(op.peer, { phone: host, peer: theirs, accepted: false });
        host.sockets.set(theirs, { phone, peer: op.peer, accepted: true });
        this.emit(host, { e: "incoming", peer: theirs, from: phone.ip });
        return this.emit(phone, { e: "open", peer: op.peer });
      }
      case "send": {
        const s = phone.sockets.get(op.peer);
        if (s) this.emit(s.phone, { e: "message", peer: s.peer, text: op.text });
        return;
      }
      case "close": {
        const s = phone.sockets.get(op.peer);
        phone.sockets.delete(op.peer);
        if (!s) return;
        s.phone.sockets.delete(s.peer);
        this.emit(s.phone, { e: "close", peer: s.peer });
        return;
      }
    }
  }
  /** One connection ends at both ends. */
  private end(phone: Phone, peer: string) {
    const s = phone.sockets.get(peer);
    phone.sockets.delete(peer);
    this.emit(phone, { e: "close", peer });
    if (!s) return;
    s.phone.sockets.delete(s.peer);
    this.emit(s.phone, { e: "close", peer: s.peer });
  }
  /** The Wi-Fi of a phone drops for a moment: every connection it holds ends, at both ends. */
  drop(page: Page) {
    const phone = this.phones.find((p) => p.page === page);
    if (phone) for (const peer of [...phone.sockets.keys()]) this.end(phone, peer);
  }
}
