// Two tiers. "high" targets a desktop GPU (RTX 4060 class), "low" targets a recent iPhone.
export function detectQuality() {
  const params = new URLSearchParams(location.search);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobileUA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const touch = coarse || mobileUA;
  const tier = params.get('q') || (touch ? 'low' : 'high');
  const high = tier === 'high';
  return {
    tier,
    touch,
    dpr: Math.min(window.devicePixelRatio || 1, high ? 2 : 1.6),
    msaa: true,
    shadowSize: high ? 4096 : 2048,
    shadowRadius: high ? 42 : 26,
    mapRes: high ? 2048 : 1024,
    localStep: high ? 1 : 2,
    farGrid: high ? 512 : 256,
    grassNear: high ? { radius: 13, count: 150000 } : { radius: 8, count: 34000 },
    grassFar: high ? { radius: 44, count: 170000 } : { radius: 22, count: 34000 },
    bloom: high,
    treeDetail: high ? 1 : 0.55,
  };
}
