/** Haversine great-circle distance in kilometres between two [lat, lon] points. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const [lat1, lon1] = a
  const [lat2, lon2] = b
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
