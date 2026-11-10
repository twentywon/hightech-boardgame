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
