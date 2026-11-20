const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));

export const minZoom = 0.65,
  maxZoom = 4;

/** A camera relative to a fitted view. Bounds and offsets are in world units. */
export class MapPan {
  x = 0;
  y = 0;
  scale = 1;
  zoom = 1;
  private limit = [0, 0, 0, 0];
  private home = [0, 0];
  origin = [0, 0];

  frame(homeX: number, homeY: number, scale: number, bounds: number[], originX: number, originY: number) {
    this.scale = scale;
    this.home = [homeX, homeY];
    this.limit = bounds;
    this.origin = [originX, originY];
    this.move(0, 0);
    return [homeX + this.x, homeY + this.y];
  }
  move(dx: number, dy: number) {
    const [x, y, w, h] = this.limit;
    this.x = clamp(this.home[0] + this.x + dx / this.scale, x, x + w) - this.home[0];
    this.y = clamp(this.home[1] + this.y + dy / this.scale, y, y + h) - this.home[1];
  }
  zoomBy(factor: number, x = this.origin[0], y = this.origin[1]) {
    const next = clamp(this.zoom * factor, minZoom, maxZoom);
    const shift = 1 - this.zoom / next;
    this.move((x - this.origin[0]) * shift, (y - this.origin[1]) * shift);
    this.scale *= next / this.zoom;
    this.zoom = next;
  }
  reset() {
    this.x = this.y = 0;
    this.zoom = 1;
  }
}
