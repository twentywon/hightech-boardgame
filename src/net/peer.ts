import type { Link } from "./room";
import { packSignal, tagInvite, unpackSignal } from "./sdp";

/**
 * WebRTC data channels between two devices on one Wi-Fi, with no server of any kind: no ICE servers (`iceServers:
 * []`), so only host candidates are gathered (an mDNS `.local` name in Chrome while the page has no camera
 * permission, the device's own address once it has), and the whole description is exchanged at once (no trickle):
 * gathering is waited for, then the description goes into a pairing code shown as a QR code and as text.
 *
 * The host makes an offer for each guest in turn (`invite`), the guest answers it (`answerInvite`), and the host
 * takes the answer (`accept`). The channel then opens by itself.
 */
const CONFIG: RTCConfiguration = { iceServers: [] };
/** Gathering on a LAN takes well under a second; a candidate that never comes is not waited for longer than this. */
const GATHER_MS = 3500;

export const webrtcAvailable = () => typeof RTCPeerConnection !== "undefined";

/** A data channel as a `Link`, with a promise for its opening. */
export class PeerLink implements Link {
  onclose: (() => void) | null = null;
  private listener: ((text: string) => void) | null = null;
  /** Messages that came before anyone listened (the other side may open and speak first): kept, then handed on. */
  private early: string[] = [];
  get onmessage() {
    return this.listener;
  }
  set onmessage(fn: ((text: string) => void) | null) {
    this.listener = fn;
    while (fn && this.early.length) fn(this.early.shift()!);
  }
  private channel: RTCDataChannel | null = null;
  private done = false;
  readonly opened: Promise<void>;
  private resolve!: () => void;
  private reject!: (error: Error) => void;
  constructor(readonly pc: RTCPeerConnection) {
    this.opened = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    // The opening's failure is told by `opened`; nobody need wait on it for the page to stay quiet.
    this.opened.catch(() => {});
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.end();
    });
  }
  bind(channel: RTCDataChannel) {
    this.channel = channel;
    channel.onopen = () => this.resolve();
    channel.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      if (this.listener) this.listener(e.data);
      else if (this.early.length < 64) this.early.push(e.data);
    };
    channel.onclose = () => this.end();
    if (channel.readyState === "open") this.resolve();
  }
  get open() {
    return this.channel?.readyState === "open";
  }
  send(text: string) {
    if (!this.channel || this.channel.readyState !== "open") throw new Error("closed");
    this.channel.send(text);
  }
  private end() {
    if (this.done) return;
    this.done = true;
    this.reject(new Error("closed"));
    this.onclose?.();
  }
  close() {
    this.done = true;
    this.reject(new Error("closed"));
    try {
      this.channel?.close();
      this.pc.close();
    } catch {
      // Already gone.
    }
  }
}

/** Resolves once every candidate is gathered (or after a little while, with what there is). */
function gathered(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, GATHER_MS);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
    pc.addEventListener("icecandidate", (e) => {
      if (!e.candidate) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** The host's side of a new guest: the offer's code (naming `game`, see `tagInvite`), and `accept` for the answer's code. */
export async function invite(game = ""): Promise<{ code: string; link: PeerLink; accept: (answer: string) => Promise<string | null> }> {
  const pc = new RTCPeerConnection(CONFIG),
    link = new PeerLink(pc);
  link.bind(pc.createDataChannel("wtg", { ordered: true }));
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const code = tagInvite(await packSignal({ type: "offer", sdp: pc.localDescription!.sdp }), game);
  const accept = async (answer: string) => {
    const signal = await unpackSignal(answer);
    if (!signal) return "코드를 읽을 수 없습니다. 다시 복사하거나 다시 찍어 주세요.";
    if (signal.type !== "answer") return "이것은 방장의 코드입니다. 참가하는 기기에 나온 답 코드를 넣어 주세요.";
    try {
      await pc.setRemoteDescription(signal);
      return null;
    } catch {
      return "이 코드로는 연결할 수 없습니다. 다음 사람 연결을 다시 눌러 새 코드로 해 보세요.";
    }
  };
  return { code, link, accept };
}

/** A guest's answer to the host's offer code: the answer's code and the link that opens once the host takes it. */
export async function answerInvite(offer: string): Promise<{ code: string; link: PeerLink } | string> {
  const signal = await unpackSignal(offer);
  if (!signal) return "코드를 읽을 수 없습니다. 다시 복사하거나 다시 찍어 주세요.";
  if (signal.type !== "offer") return "이것은 참가하는 기기의 답 코드입니다. 방장의 기기에 넣어 주세요.";
  const pc = new RTCPeerConnection(CONFIG),
    link = new PeerLink(pc);
  pc.ondatachannel = (e) => link.bind(e.channel);
  try {
    await pc.setRemoteDescription(signal);
    await pc.setLocalDescription(await pc.createAnswer());
  } catch {
    pc.close();
    return "이 코드로는 연결할 수 없습니다. 방장에게 새 코드를 받아 주세요.";
  }
  await gathered(pc);
  return { code: await packSignal({ type: "answer", sdp: pc.localDescription!.sdp }), link };
}
