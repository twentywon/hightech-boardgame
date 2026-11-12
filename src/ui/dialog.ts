export function modal(
  title: string,
  body: string,
  actions: { text: string; action: () => void }[] = [
    { text: "확인", action: () => {} },
  ],
) {
  document.querySelector("dialog")?.remove();
  const d = document.createElement("dialog");
  d.innerHTML = `<div class="eyebrow">WORLD TABLE GAMES</div><h2>${title}</h2><div class="dialog-body">${body}</div><div class="dialog-actions">${actions.map((a, i) => `<button ${i === actions.length - 1 ? 'class="primary"' : ""}>${a.text}</button>`).join("")}</div>`;
  document.body.append(d);
  d.querySelectorAll("button").forEach(
    (b, i) =>
      (b.onclick = () => {
        d.close();
        d.remove();
        actions[i].action();
      }),
  );
  d.addEventListener("cancel", () => d.remove());
  d.showModal();
}
/**
 * Offers a game's own setup panel in a dialog, for starting anew from the
 * table. `fill` draws the panel into the host; its start button closes the
 * dialog once it has read the choices.
 */
export function setupDialog(fill: (host: HTMLElement) => void) {
  document.querySelector("dialog")?.remove();
  const d = document.createElement("dialog");
  d.className = "setup-dialog";
  d.innerHTML = `<div class="eyebrow">WORLD TABLE GAMES</div><h2>새 게임</h2><p class="setup-note">지금 하던 게임은 끝내고 처음부터 다시 시작합니다.</p><div class="dialog-body setup-host"></div><div class="dialog-actions"><button id="setup-cancel">계속하기</button></div>`;
  document.body.append(d);
  const close = () => {
    d.close();
    d.remove();
  };
  fill(d.querySelector<HTMLElement>(".setup-host")!);
  d.querySelector<HTMLButtonElement>("#setup-cancel")!.onclick = close;
  d.querySelectorAll<HTMLButtonElement>(".setup-host button.primary").forEach((button) => {
    const begin = button.onclick;
    button.textContent = "새 게임 시작";
    button.onclick = (event) => {
      // The choices are read from the form, so it must outlive the handler.
      begin?.call(button, event);
      close();
    };
  });
  d.addEventListener("cancel", () => d.remove());
  d.showModal();
  return d;
}
