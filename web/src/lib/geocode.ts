export type GeoResult = { label: string; detail: string; name: string; address: string; city: string; lat: number; lng: number; km?: number };
export type GeoNear = { lat: number; lng: number; zoom?: number };

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

/** Great-circle distance in km. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** "350 m" / "4,2 km" / "120 km". */
export function formatKm(km: number) {
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  return `${km.toLocaleString('fr-FR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

// Places to eat, in OpenStreetMap tags (Photon `osm_key:osm_value`), with the label shown in the results.
const FOOD: Record<string, string> = {
  'amenity:restaurant': 'Restaurant',
  'amenity:fast_food': 'Restauration rapide',
  'amenity:cafe': 'Café',
  'amenity:bar': 'Bar',
  'amenity:pub': 'Pub',
  'amenity:biergarten': 'Brasserie',
  'amenity:food_court': 'Food court',
  'amenity:ice_cream': 'Glacier',
  'shop:bakery': 'Boulangerie',
  'shop:pastry': 'Pâtisserie',
  'shop:deli': 'Épicerie fine',
  'shop:cheese': 'Fromagerie',
  'shop:wine': 'Caviste',
  'shop:chocolate': 'Chocolatier',
};
// Beyond this distance from the map view, a place to eat loses its priority.
const FOOD_PRIORITY_KM = 50;

async function photon(params: string, signal?: AbortSignal): Promise<PhotonFeature[]> {
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  return ((await res.json()) as { features: PhotonFeature[] }).features ?? [];
}

/**
 * Place / address search via Photon (OpenStreetMap, free, no key).
 * Places to eat come first (restaurants, then cafés, bakeries…): a second query restricted to them
 * makes sure they show up even when streets or towns match the text better.
 * With `near`, Photon is strongly biased towards that point (radius following the map zoom),
 * and each group is sorted by distance so what is around the map view comes first.
 */
export async function geocode(query: string, near?: GeoNear, signal?: AbortSignal): Promise<GeoResult[]> {
  const bias = near
    ? `&lat=${near.lat}&lon=${near.lng}&location_bias_scale=0.1${near.zoom !== undefined ? `&zoom=${Math.round(near.zoom)}` : ''}`
    : '';
  const base = `q=${encodeURIComponent(query)}&lang=fr${bias}`;
  const foodTags = Object.keys(FOOD).map((t) => `&osm_tag=${t}`).join('');
  const [food, all] = await Promise.all([photon(`${base}&limit=6${foodTags}`, signal), photon(`${base}&limit=10`, signal)]);

  const seen = new Set<string>();
  const results = [...food, ...all].flatMap((f) => {
    const p = f.properties;
    const key = `${p.osm_type}${p.osm_id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const city = p.city ?? p.town ?? p.village ?? p.county ?? '';
    const kind = FOOD[`${p.osm_key}:${p.osm_value}`];
    const [lng, lat] = f.geometry.coordinates;
    const km = near ? distanceKm(near, { lat, lng }) : undefined;
    // 0: restaurant, 1: other place to eat, 2: anything else.
    const rank = !kind || (km !== undefined && km > FOOD_PRIORITY_KM) ? 2 : p.osm_value === 'restaurant' ? 0 : 1;
    const result: GeoResult = {
      label: p.name ?? (street || city),
      detail: [kind, [p.name ? street : '', p.postcode, city, p.country].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
      name: p.name ?? '',
      address: [street, [p.postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      city,
      lat,
      lng,
      km,
    };
    return [{ result, rank }];
  });
  // Stable sort: without `near`, Photon's relevance order is kept inside each group.
  results.sort((a, b) => a.rank - b.rank || (a.result.km ?? 0) - (b.result.km ?? 0));
  return results.slice(0, 8).map((r) => r.result);
}
