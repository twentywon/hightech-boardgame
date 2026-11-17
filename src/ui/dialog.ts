import { choiceIcon, modeIcon } from "./choice-icons";
import { shownGuide } from "./guide";
export function modal(
  title: string,
  body: string,
  actions: { text: string; action: () => void }[] = [
    { text: "확인", action: () => {} },
  ],
) {
  document.querySelector("dialog")?.remove();
  const d = document.createElement("dialog");
  d.innerHTML = `<div class="eyebrow">WORLD TABLE GAMES</div><h2>${title}</h2><div class="dialog-body">${shownGuide(body)}</div><div class="dialog-actions">${actions.map((a, i) => `<button ${i === actions.length - 1 ? 'class="primary"' : ""}>${a.text}</button>`).join("")}</div>`;
  document.body.append(d);
  // Only the action row: a body may carry buttons of its own.
  d.querySelectorAll<HTMLButtonElement>(".dialog-actions button").forEach(
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
 * The setup's lists offered as rows of buttons, as the puzzles offer their stages (the user asked: no lists in the
 * settings window). Each list stays in the page, a pixel and unseen, as the control it always was (its label, its
 * value, its change event, which the setup listens to); its buttons follow it: rebuilt when its options change,
 * pressed as its value is, hidden or disabled with it. A setup that redraws itself gets buttons for its new lists.
 */
function buttonize(host: HTMLElement) {
  const groups = new Map<HTMLSelectElement, HTMLElement>(),
    rebuild = (select: HTMLSelectElement, group: HTMLElement) => {
      // Up to five choices stand in one row (the user asked for the five levels of the computer on one line).
      group.dataset.count = String(select.options.length);
      group.replaceChildren(
        ...[...select.options].map((option) => {
          const button = document.createElement("button"),
            label = option.textContent ?? "",
            // A setup may give an option its own picture (`data-icon`, as the point games' boards); else one is drawn.
            icon = option.dataset.icon ? { svg: option.dataset.icon, only: false } : choiceIcon(select.id, option.value, label, document.documentElement.dataset.game);
          button.type = "button";
          button.className = icon ? "choice with-icon" : "choice";
          button.dataset.value = option.value;
          button.dataset.label = label;
          // What a picture can show is shown as one (the user asked); the words stay for readers, or under it.
          if (icon) {
            const picture = document.createElement("span"),
              words = document.createElement("span");
            picture.className = "choice-icon";
            picture.setAttribute("aria-hidden", "true");
            picture.innerHTML = icon.svg;
            words.className = icon.only ? "sr-only" : "choice-text";
            words.textContent = label;
            button.append(picture, words);
            if (icon.only) button.title = label;
          } else button.textContent = label;
          button.onclick = () => {
            if (select.value !== option.value) {
              select.value = option.value;
              select.dispatchEvent(new Event("input", { bubbles: true }));
              select.dispatchEvent(new Event("change", { bubbles: true }));
            }
            sync();
          };
          return button;
        }),
      );
    },
    sync = () => {
      for (const [select, group] of groups) {
        // A list gone from the page (its window closed) is let go; nothing is drawn for it again.
        if (!select.isConnected) {
          groups.delete(select);
          continue;
        }
        const options = [...select.options],
          buttons = [...group.children] as HTMLButtonElement[];
        if (buttons.length !== options.length || options.some((o, i) => buttons[i].dataset.value !== o.value || buttons[i].dataset.label !== o.textContent)) {
          rebuild(select, group);
          return sync();
        }
        buttons.forEach((button, i) => {
          button.setAttribute("aria-pressed", String(options[i].value === select.value));
          button.disabled = select.disabled || options[i].disabled;
        });
        group.hidden = select.hidden;
      }
    },
    adopt = () => {
      // The mode buttons get their pictures too (one person, two, a person against the computer).
      host.querySelectorAll<HTMLLabelElement>(".mode-select label:not(.with-icon)").forEach((label) => {
        const input = label.querySelector<HTMLInputElement>("input"),
          icon = input && modeIcon(input.value, label.textContent ?? "");
        if (!input || !icon) return;
        label.classList.add("with-icon");
        const picture = document.createElement("span");
        picture.className = "choice-icon";
        picture.setAttribute("aria-hidden", "true");
        picture.innerHTML = icon;
        input.after(picture);
      });
      host.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
        if (groups.has(select) || select.multiple || !select.isConnected) return;
        const group = document.createElement("div");
        group.className = "choice-group";
        group.setAttribute("role", "group");
        select.classList.add("choice-source");
        select.after(group);
        groups.set(select, group);
        rebuild(select, group);
      });
      sync();
    };
  adopt();
  // The window closed (its form carried off or thrown away), the buttons are done with: the watch ends.
  const watch = new MutationObserver(() => (host.isConnected ? adopt() : watch.disconnect()));
  watch.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "disabled"] });
  host.addEventListener("change", sync);
  host.addEventListener("click", () => queueMicrotask(() => host.isConnected && sync()));
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
  const host = d.querySelector<HTMLElement>(".setup-host")!;
  fill(host);
  buttonize(host);
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
/**
 * The window a game is entered through from the collection (the user asked: a game is entered at once and its
 * settings come up over it in a window, instead of a panel in the collection). `content` is the game's setup as the
 * collection laid it, carried into the window with its handlers, under the game's `title`; the page behind shows the
 * game's own table. Its start (the setup's own, 테이블에 앉기 and the rest) sits down once, with what was chosen;
 * 컬렉션으로, Escape or the browser's back go back to the collection through `back`. Its panel carries `game-stage`
 * and the old region name (`label`), so readers and tests find the setup where they did.
 */
export function entryDialog(title: string, label: string, content: Node[], back: () => void) {
  document.querySelector("dialog")?.remove();
  const d = document.createElement("dialog");
  d.className = "setup-dialog entry";
  d.innerHTML = `<div class="eyebrow">WORLD TABLE GAMES</div><h2></h2><p class="setup-note">설정을 고른 뒤 시작하세요.</p><div class="dialog-body setup-host game-stage" role="region"></div><div class="dialog-actions"><button id="setup-cancel">← 컬렉션으로</button></div>`;
  d.querySelector("h2")!.textContent = title;
  const host = d.querySelector<HTMLElement>(".setup-host")!;
  host.setAttribute("aria-label", label);
  host.append(...content);
  // A setup may give the window its own note, and a button to stand in its row of actions (a puzzle entered through
  // its stage window has its start where that window's 계속하기 stood).
  const note = host.querySelector<HTMLElement>("[data-entry-note]")?.dataset.entryNote;
  if (note) d.querySelector(".setup-note")!.textContent = note;
  host.querySelectorAll("[data-entry-action]").forEach((button) => d.querySelector(".dialog-actions")!.append(button));
  document.body.append(d);
  buttonize(host);
  // The start (any primary button, also one a setup draws anew, as the tour's form when the number of people
  // changes) closes the window before its own handler runs: a table that starts under an open window holds its
  // buttons and its computer, as it does under any window. The window stays in the page while the handler runs,
  // for the choices are read from its form; a game that asks its stage next has already put its own in its place.
  d.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("button.primary") || !d.open) return;
      d.close();
      setTimeout(() => d.isConnected && !d.open && d.remove());
    },
    true,
  );
  const leave = () => {
    if (!d.isConnected) return;
    d.close();
    d.remove();
    back();
  };
  d.querySelector<HTMLButtonElement>("#setup-cancel")!.onclick = leave;
  d.addEventListener("cancel", (event) => {
    event.preventDefault();
    leave();
  });
  d.showModal();
  return d;
}

