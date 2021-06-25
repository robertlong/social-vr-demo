export function freeze(a) {
  return JSON.parse(JSON.stringify(a || "undefined"));
}
