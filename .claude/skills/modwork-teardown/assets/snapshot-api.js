// Substitute only the viewport's read adapter in the exported bundle.
export const snapshot = JSON.parse(document.getElementById('snapshot').textContent);

export async function requestJson(request, {signal} = {}) {
  signal?.throwIfAborted();
  const url = new URL(request, 'https://offline.invalid');
  const gear = snapshot.gears.find(item => item.id === url.searchParams.get('gear'));
  if (url.pathname !== '/api/viewport/mesh' || !gear) throw new Error('快照中没有这个视图。');
  return {...snapshot, gears:[gear], vertices:gear.vertices, fit:gear.fit ?? null};
}
