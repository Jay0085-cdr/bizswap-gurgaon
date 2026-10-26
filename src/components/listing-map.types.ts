export type MapPin = { id: string; lat: number; lng: number; color: string };

export type ListingMapProps = {
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When set, the camera flies here (locality search, focus after publish). */
  focus: { lat: number; lng: number; zoom?: number; key: number } | null;
  dark: boolean;
  bottomInset?: number;
};

// OpenFreeMap: free OSM vector tiles, no API key, no usage limits for apps.
export const MAP_STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

export const GURGAON = { lat: 28.452, lng: 77.065, zoom: 11.3 };
export const GURGAON_BOUNDS: [number, number, number, number] = [76.85, 28.3, 77.2, 28.6]; // w, s, e, n
