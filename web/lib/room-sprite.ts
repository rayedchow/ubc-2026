import type { CSSProperties } from "react";
import tiles from "../public/realms/room-tiles.json";

export const TILE_W = 95;
const TILE_H = 68,
  atlasWidth = TILE_W * 4,
  atlasHeight = TILE_H * Math.ceil(tiles.length / 4);

export function roomSprite(kit: string, key: string, height: number): CSSProperties {
  const index = tiles.indexOf(key);
  const x = (index % 4) * TILE_W,
    y = Math.floor(index / 4) * TILE_H;
  return {
    aspectRatio: `${TILE_W}/${height}`,
    backgroundImage: `url(/realms/room-${kit}.png)`,
    backgroundSize: `${(100 * atlasWidth) / TILE_W}% ${(100 * atlasHeight) / height}%`,
    backgroundPosition: `${(100 * x) / (atlasWidth - TILE_W)}% ${(100 * y) / (atlasHeight - height)}%`,
  };
}
