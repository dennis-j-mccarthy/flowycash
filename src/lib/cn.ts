/** Tiny classnames joiner — filters falsy values. No dependency needed. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
