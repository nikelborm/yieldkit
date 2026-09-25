export type TagName = keyof HTMLElementTagNameMap;

export type CSS = {
  [K in keyof CSSStyleDeclaration as K extends string
    ? CSSStyleDeclaration[K] extends string
      ? K
      : never
    : never]?: string;
};

export type Cleanup = () => void;
export type Mount = (el: HTMLElement) => void | Cleanup;
export type Setter<T> = (next: T) => void;

type Handler = { readonly type: string; readonly handle: (event: Event) => void };

export class Context<T> {
  constructor(
    readonly name: string,
    readonly fallback: readonly [T] | readonly [],
  ) {}
}

export const context = <T>(name: string, ...fallback: [T] | []): Context<T> =>
  new Context(name, fallback);

export type Op =
  | { readonly kind: "attr"; readonly name: string; readonly value: string }
  | { readonly kind: "style"; readonly css: CSS }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "value"; readonly value: string }
  | { readonly kind: "child"; readonly node: Tag }
  | { readonly kind: "on"; readonly handler: Handler }
  | { readonly kind: "mount"; readonly run: Mount }
  | { readonly kind: "provide"; readonly ctx: Context<unknown>; readonly value: unknown }
  | { readonly kind: "use"; readonly ctx: Context<unknown> }
  | { readonly kind: "local"; readonly name: string; readonly initial: unknown }
  | { readonly kind: "uniqueId" };

export type Build<R = void> = Generator<Op, R, unknown>;
export type Body = () => Build;

export class Tag<K extends TagName = TagName> {
  constructor(
    readonly name: K,
    readonly body: Body,
    readonly key: string | null = null,
  ) {}

  keyed(key: string): Tag<K> {
    return new Tag(this.name, this.body, key);
  }

  *[Symbol.iterator](): Build {
    yield { kind: "child", node: this };
  }
}

const tag =
  <K extends TagName>(name: K) =>
  (body: Body = function* () {}): Tag<K> =>
    new Tag(name, body);

export const div = tag("div");
export const span = tag("span");
export const p = tag("p");
export const h1 = tag("h1");
export const h2 = tag("h2");
export const h3 = tag("h3");
export const header = tag("header");
export const footer = tag("footer");
export const main = tag("main");
export const nav = tag("nav");
export const section = tag("section");
export const article = tag("article");
export const ul = tag("ul");
export const ol = tag("ol");
export const li = tag("li");
export const a = tag("a");
export const img = tag("img");
export const button = tag("button");
export const form = tag("form");
export const input = tag("input");
export const label = tag("label");
export const strong = tag("strong");
export const em = tag("em");
export const small = tag("small");
export const code = tag("code");
export const pre = tag("pre");
export const hr = tag("hr");
export const table = tag("table");
export const thead = tag("thead");
export const tbody = tag("tbody");
export const tr = tag("tr");
export const th = tag("th");
export const td = tag("td");

export function* attr(name: string, value: string): Build {
  yield { kind: "attr", name, value };
}

export function* flag(name: string, enabled: boolean): Build {
  if (enabled) yield* attr(name, "");
}

export const className = (...names: ReadonlyArray<string | false>) =>
  attr("class", names.filter(Boolean).join(" "));
export const id = (value: string) => attr("id", value);
export const href = (value: string) => attr("href", value);
export const src = (value: string) => attr("src", value);
export const alt = (value: string) => attr("alt", value);
export const title = (value: string) => attr("title", value);
export const type = (value: string) => attr("type", value);
export const htmlFor = (value: string) => attr("for", value);
export const placeholder = (value: string) => attr("placeholder", value);
export const role = (value: string) => attr("role", value);
export const aria = (name: string, value: string | boolean) =>
  attr(`aria-${name}`, String(value));
export const disabled = (enabled: boolean) => flag("disabled", enabled);

export function* text(value: string): Build {
  yield { kind: "text", value };
}

export function* value(value: string): Build {
  yield { kind: "value", value };
}

export function* style(css: CSS): Build {
  yield { kind: "style", css };
}

export function* on<E extends keyof HTMLElementEventMap>(
  type: E,
  listener: (event: HTMLElementEventMap[E]) => void,
): Build {
  yield {
    kind: "on",
    handler: {
      type,
      handle: (event) => listener(event as HTMLElementEventMap[E]),
    },
  };
}

export const onInput = (listener: (value: string) => void) =>
  on("input", (event) => {
    if (event.target instanceof HTMLInputElement) listener(event.target.value);
  });

export function* onMount(run: Mount): Build {
  yield { kind: "mount", run };
}

export function* provide<T>(ctx: Context<T>, value: T): Build {
  yield { kind: "provide", ctx, value };
}

export function* use<T>(ctx: Context<T>): Build<T> {
  return (yield { kind: "use", ctx }) as T;
}

export function* local<T>(
  name: string,
  initial: T,
): Build<readonly [T, Setter<T>]> {
  return (yield { kind: "local", name, initial }) as readonly [T, Setter<T>];
}

export function* uniqueId(): Build<string> {
  return (yield { kind: "uniqueId" }) as string;
}

export const TagArray = {
  *gen<T>(items: Iterable<T>, render: (item: T, index: number) => Tag): Build {
    let index = 0;
    for (const item of items) yield* render(item, index++);
  },
};

type VText = { readonly kind: "text"; readonly slot: string; readonly value: string };

type VElement = {
  readonly kind: "element";
  readonly slot: string;
  readonly path: string;
  readonly name: TagName;
  readonly attrs: ReadonlyMap<string, string>;
  readonly style: CSS;
  readonly value: string | null;
  readonly handlers: readonly Handler[];
  readonly mounts: readonly Mount[];
  readonly children: readonly VNode[];
};

type VNode = VText | VElement;

type Env = ReadonlyMap<Context<unknown>, unknown>;

type Runtime = {
  local(path: string, name: string, initial: unknown): readonly [unknown, Setter<unknown>];
};

const hash = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

const describe = (
  tag: Tag,
  slot: string,
  parentPath: string,
  parentEnv: Env,
  runtime: Runtime,
): VElement => {
  const path = `${parentPath}/${slot}`;
  const attrs = new Map<string, string>();
  const children: VNode[] = [];
  const handlers: Handler[] = [];
  const mounts: Mount[] = [];
  const counts = new Map<string, number>();
  const slots = new Set<string>();
  let env = parentEnv;
  let css: CSS = {};
  let nodeValue: string | null = null;
  let ids = 0;

  const claim = (base: string, key: string | null): string => {
    const count = counts.get(base) ?? 0;
    const next = key === null ? `${base}:${count}` : `${base}#${key}`;
    if (key === null) counts.set(base, count + 1);
    if (slots.has(next)) throw new Error(`Duplicate key "${key}" in ${path}`);
    slots.add(next);
    return next;
  };

  const handle = (op: Op): unknown => {
    switch (op.kind) {
      case "attr":
        attrs.set(op.name, op.value);
        return;
      case "style":
        css = { ...css, ...op.css };
        return;
      case "text":
        children.push({ kind: "text", slot: claim("#text", null), value: op.value });
        return;
      case "value":
        nodeValue = op.value;
        return;
      case "child":
        children.push(
          describe(op.node, claim(op.node.name, op.node.key), path, env, runtime),
        );
        return;
      case "on":
        handlers.push(op.handler);
        return;
      case "mount":
        mounts.push(op.run);
        return;
      case "provide":
        env = new Map(env).set(op.ctx, op.value);
        return;
      case "use":
        if (env.has(op.ctx)) return env.get(op.ctx);
        if (op.ctx.fallback.length === 1) return op.ctx.fallback[0];
        throw new Error(`No value provided for context "${op.ctx.name}"`);
      case "local":
        return runtime.local(path, op.name, op.initial);
      case "uniqueId":
        return `yk-${hash(path)}-${ids++}`;
    }
  };

  const gen = tag.body();
  let step = gen.next();
  while (!step.done) step = gen.next(handle(step.value));

  return {
    kind: "element",
    slot,
    path,
    name: tag.name,
    attrs,
    style: css,
    value: nodeValue,
    handlers,
    mounts,
    children,
  };
};

type MountedText = { readonly kind: "text"; node: VText; readonly dom: Text };

type MountedElement = {
  readonly kind: "element";
  node: VElement;
  readonly dom: HTMLElement;
  children: Mounted[];
  handlers: ReadonlyMap<string, readonly Handler[]>;
  readonly listening: Set<string>;
  readonly cleanups: Cleanup[];
};

type Mounted = MountedText | MountedElement;

const blank = (node: VElement): VElement => ({
  ...node,
  attrs: new Map(),
  style: {},
  value: null,
  children: [],
});

const hasValue = (
  el: HTMLElement,
): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement;

const groupHandlers = (handlers: readonly Handler[]) => {
  const grouped = new Map<string, Handler[]>();
  for (const handler of handlers) {
    grouped.set(handler.type, [...(grouped.get(handler.type) ?? []), handler]);
  }
  return grouped;
};

class Root implements Runtime {
  private readonly store = new Map<string, Map<string, unknown>>();
  private mounted: MountedElement | null = null;
  private queue: Array<() => void> = [];
  private scheduled = false;

  constructor(
    private readonly target: HTMLElement,
    private readonly view: () => Tag,
  ) {}

  local(path: string, name: string, initial: unknown) {
    const slots = this.store.get(path) ?? new Map<string, unknown>();
    this.store.set(path, slots);
    if (!slots.has(name)) slots.set(name, initial);

    const set: Setter<unknown> = (next) => {
      const current = this.store.get(path);
      if (!current || Object.is(current.get(name), next)) return;
      current.set(name, next);
      this.schedule();
    };

    return [slots.get(name), set] as const;
  }

  schedule = (): void => {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.render();
    });
  };

  render(): void {
    const next = describe(this.view(), "root", "", new Map(), this);
    this.queue = [];

    if (this.mounted) {
      this.sync(this.mounted, next);
    } else {
      this.mounted = this.createElement(next);
      this.target.replaceChildren(this.mounted.dom);
    }

    for (const run of this.queue) run();
  }

  private create(node: VNode): Mounted {
    return node.kind === "text"
      ? { kind: "text", node, dom: document.createTextNode(node.value) }
      : this.createElement(node);
  }

  private createElement(node: VElement): MountedElement {
    const el = document.createElement(node.name);
    const mounted: MountedElement = {
      kind: "element",
      node: blank(node),
      dom: el,
      children: [],
      handlers: new Map(),
      listening: new Set(),
      cleanups: [],
    };
    this.sync(mounted, node);
    for (const run of node.mounts) {
      this.queue.push(() => {
        const cleanup = run(el);
        if (cleanup) mounted.cleanups.push(cleanup);
      });
    }
    return mounted;
  }

  private patch(mounted: Mounted, next: VNode): Mounted {
    if (mounted.kind === "text" && next.kind === "text") {
      if (mounted.dom.data !== next.value) mounted.dom.data = next.value;
      mounted.node = next;
      return mounted;
    }
    if (mounted.kind === "element" && next.kind === "element") {
      this.sync(mounted, next);
      return mounted;
    }
    this.destroy(mounted);
    mounted.dom.remove();
    return this.create(next);
  }

  private sync(mounted: MountedElement, next: VElement): void {
    const { dom: el, node: prev } = mounted;

    for (const name of prev.attrs.keys()) {
      if (!next.attrs.has(name)) el.removeAttribute(name);
    }
    for (const [name, value] of next.attrs) {
      if (prev.attrs.get(name) !== value) el.setAttribute(name, value);
    }

    const changed: CSS = {};
    for (const name of Object.keys(prev.style) as Array<keyof CSS>) {
      if (!(name in next.style)) changed[name] = "";
    }
    for (const name of Object.keys(next.style) as Array<keyof CSS>) {
      const value = next.style[name];
      if (value !== undefined && prev.style[name] !== value) changed[name] = value;
    }
    if (Object.keys(changed).length > 0) Object.assign(el.style, changed);

    if (next.value !== null && hasValue(el) && el.value !== next.value) {
      el.value = next.value;
    }

    mounted.handlers = groupHandlers(next.handlers);
    for (const type of mounted.handlers.keys()) {
      if (mounted.listening.has(type)) continue;
      mounted.listening.add(type);
      el.addEventListener(type, (event) => {
        for (const { handle } of mounted.handlers.get(type) ?? []) handle(event);
      });
    }

    mounted.children = this.reconcile(el, mounted.children, next.children);
    mounted.node = next;
  }

  private reconcile(
    parent: HTMLElement,
    current: readonly Mounted[],
    next: readonly VNode[],
  ): Mounted[] {
    const bySlot = new Map(current.map((mounted) => [mounted.node.slot, mounted]));

    const result = next.map((node) => {
      const match = bySlot.get(node.slot);
      if (!match) return this.create(node);
      bySlot.delete(node.slot);
      return this.patch(match, node);
    });

    for (const leftover of bySlot.values()) {
      this.destroy(leftover);
      leftover.dom.remove();
    }

    let cursor = parent.firstChild;
    for (const { dom } of result) {
      if (dom === cursor) cursor = cursor.nextSibling;
      else parent.insertBefore(dom, cursor);
    }

    return result;
  }

  private destroy(mounted: Mounted): void {
    if (mounted.kind === "text") return;
    for (const child of mounted.children) this.destroy(child);
    for (const cleanup of mounted.cleanups.splice(0)) cleanup();
    this.store.delete(mounted.node.path);
  }
}

export const mount = (target: HTMLElement, view: () => Tag) => {
  const root = new Root(target, view);
  root.render();
  return { refresh: root.schedule };
};

export const render = (tag: Tag, target: HTMLElement): void => {
  mount(target, () => tag);
};

export type Update<S> = (next: (state: S) => S) => void;

export const app = <S>(options: {
  readonly target: HTMLElement;
  readonly initial: S;
  readonly view: (state: S, update: Update<S>) => Tag;
  readonly onChange?: (state: S) => void;
}): void => {
  let state = options.initial;
  const update: Update<S> = (next) => {
    state = next(state);
    options.onChange?.(state);
    root.refresh();
  };
  const root = mount(options.target, () => options.view(state, update));
};

const VOID = new Set([
  "area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escape = (input: string): string =>
  input.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);

const kebab = (name: string): string =>
  name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const serialize = (node: VNode): string => {
  if (node.kind === "text") return escape(node.value);

  const attrs = new Map(node.attrs);
  const css = Object.entries(node.style)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${kebab(name)}:${value}`)
    .join(";");
  if (css) attrs.set("style", css);
  if (node.value !== null) attrs.set("value", node.value);

  const rendered = [...attrs]
    .map(([name, value]) => (value === "" ? ` ${name}` : ` ${name}="${escape(value)}"`))
    .join("");
  const open = `<${node.name}${rendered}>`;

  return VOID.has(node.name)
    ? open
    : `${open}${node.children.map(serialize).join("")}</${node.name}>`;
};

const staticRuntime: Runtime = {
  local: (_path, _name, initial) => [initial, () => {}],
};

export const renderToString = (tag: Tag): string =>
  serialize(describe(tag, "root", "", new Map(), staticRuntime));
