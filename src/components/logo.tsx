/**
 * The ERAM Work Force logo. `on` is the background it sits on:
 * "dark" (navy sidebar, sign-in pages) uses the white-text version, "light" (print, white pages) the black-text one.
 */
export function Logo({ on, className = "h-10" }: { on: "dark" | "light"; className?: string }) {
  const src = on === "dark" ? "/eram-workforce-logo-dark-bg-800w.png" : "/eram-workforce-logo-800w.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="ERAM Holdings" width={800} height={231} className={`${className} w-auto object-contain`} />
  );
}
