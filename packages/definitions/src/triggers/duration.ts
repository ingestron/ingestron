// Durations as definitions write them (specification section 5.1): `5m`, `2h`, `1d`, and a
// dependency's offset such as `-1h`.

const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** The length of `text` in milliseconds; undefined when it is not a duration. */
export function durationMs(text: string): number | undefined {
  const match = /^(-?)([0-9]+)([smhd])$/.exec(text);
  if (!match) return undefined;
  const [, sign, count, unit] = match;
  return (sign ? -1 : 1) * Number(count) * units[unit as keyof typeof units];
}

/** `milliseconds` as a duration in the largest unit that holds it exactly: `1h`, `90m`, `2d`. */
export function durationText(milliseconds: number): string {
  for (const unit of ["d", "h", "m"] as const)
    if (milliseconds % units[unit] === 0) return `${milliseconds / units[unit]}${unit}`;
  return `${Math.round(milliseconds / units.s)}s`;
}
