export interface Rng {
  // Uniform [0, 1)
  float(): number;
  // Integer in [min, max] inclusive
  int(min: number, max: number): number;
  // Normal(0,1)
  normal(): number;
}

// Deterministic PRNG (xorshift32). Good enough for simulation; not crypto-safe.
export function createRng(seed: number): Rng {
  let x = (seed | 0) || 1;

  const nextU32 = () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Convert to uint32
    return x >>> 0;
  };

  const float = () => nextU32() / 0x100000000;

  // Box–Muller (cached)
  let hasSpare = false;
  let spare = 0;
  const normal = () => {
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    // Avoid log(0)
    let u = 0;
    let v = 0;
    while (u === 0) u = float();
    while (v === 0) v = float();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    const z0 = mag * Math.cos(2.0 * Math.PI * v);
    const z1 = mag * Math.sin(2.0 * Math.PI * v);
    spare = z1;
    hasSpare = true;
    return z0;
  };

  const int = (min: number, max: number) => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi < lo) return lo;
    return lo + Math.floor(float() * (hi - lo + 1));
  };

  return { float, int, normal };
}

export function hashStringToSeed(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

