import { app } from "./yieldkit.ts";
import { View, seed, type State, type Todo } from "./todo.ts";

const STORAGE_KEY = "yieldkit.todos";

const isTodo = (item: unknown): item is Todo =>
  typeof item === "object" &&
  item !== null &&
  "id" in item &&
  typeof item.id === "string" &&
  "title" in item &&
  typeof item.title === "string" &&
  "done" in item &&
  typeof item.done === "boolean";

const load = (): readonly Todo[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return seed;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isTodo) : seed;
  } catch {
    return seed;
  }
};

const save = (state: State): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
  } catch {}
};

const target = document.getElementById("app");

if (target) {
  app<State>({
    target,
    initial: { todos: load(), filter: "all" },
    view: View,
    onChange: save,
  });
}
