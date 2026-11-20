const rotation = { right: 0, down: 90, left: 180, up: 270 } as const;
type Direction = keyof typeof rotation | "external" | "enter";

/** Decorative lettering-sized icon. The enclosing link or button supplies its accessible name. */
export function PixelArrow({ direction = "right", size = 14 }: { direction?: Direction; size?: number }) {
  const turn = direction in rotation ? rotation[direction as keyof typeof rotation] : 0;
  const path =
    direction === "external"
      ? "M3 2h9v9h-2V6H8v2H6v2H4v2H2v-2h2V8h2V6h2V4H3z"
      : direction === "enter"
        ? "M10 2h2v7H5v3H3v-2H1V8H0V7h1V5h2V3h2v4h5z"
        : "M1 6h6V2h2v2h2v2h2v2h-2v2H9v2H7V8H1z";
  return (
    <svg
      className="pixel-arrow"
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <path d={path} fill="currentColor" transform={turn ? `rotate(${turn} 7 7)` : undefined} />
    </svg>
  );
}
