import { renderToString } from "./yieldkit.ts";
import { View, seed } from "./todo.ts";

console.log(renderToString(View({ todos: seed, filter: "all" }, () => {})));
