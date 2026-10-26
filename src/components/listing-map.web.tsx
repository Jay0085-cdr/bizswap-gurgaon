// Web preview map — same tiles and behaviour as native; used for browser previews and screenshots.
// maplibre-gl is loaded from a CDN at runtime: its v6 ESM worker can't be served by Metro, while the
// v4 UMD build inlines the worker. Android uses the native MapLibre SDK instead (listing-map.tsx).
import type * as MLTypes from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import { GURGAON, GURGAON_BOUNDS, MAP_STYLE, type ListingMapProps, type MapPin } from '@/components/listing-map.types';

const CDN = 'https://unpkg.com/maplibre-gl@4.7.1/dist';
type ML = typeof MLTypes;
let loader: Promise<ML> | null = null;
function loadMapLibre(): Promise<ML> {
  loader ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${CDN}/maplibre-gl.css`;
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = `${CDN}/maplibre-gl.js`;
    js.onload = () => resolve((window as unknown as { maplibregl: ML }).maplibregl);
    js.onerror = reject;
    document.head.appendChild(js);
  });
  return loader;
}

function toGeo(pins: MapPin[], selectedId: string | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      properties: {
        id: p.id,
        color: p.color,
        selected: p.id === selectedId ? 1 : 0,
      },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };
}

export function ListingMap({ pins, selectedId, onSelect, focus, dark }: ListingMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const [map, setMap] = useState<MLTypes.Map | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let m: MLTypes.Map | null = null;
    let cancelled = false;
    void loadMapLibre().then((maplibregl) => {
      if (!el.current || cancelled) return;
      m = new maplibregl.Map({
        container: el.current,
        style: dark ? MAP_STYLE.dark : MAP_STYLE.light,
        center: [GURGAON.lng, GURGAON.lat],
        zoom: GURGAON.zoom,
        minZoom: 9.5,
        maxBounds: [
          [GURGAON_BOUNDS[0], GURGAON_BOUNDS[1]],
          [GURGAON_BOUNDS[2], GURGAON_BOUNDS[3]],
        ],
        attributionControl: false,
      });
      const mm = m;
      mm.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
      mm.on('load', () => {
        mm.addSource('listings', { type: 'geojson', data: toGeo([], null) });
        mm.addLayer({
          id: 'listing-halo',
          type: 'circle',
          source: 'listings',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 20, 0],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.25,
          },
        });
        mm.addLayer({
          id: 'listing-pins',
          type: 'circle',
          source: 'listings',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 11, 8],
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          },
        });
        setMap(mm);
      });
      mm.on('click', (e: MLTypes.MapMouseEvent) => {
        const f = mm.queryRenderedFeatures(e.point, {
          layers: ['listing-pins'],
        })[0];
        onSelectRef.current(f ? String(f.properties?.id) : null);
      });
      mm.on('mouseenter', 'listing-pins', () => (mm.getCanvas().style.cursor = 'pointer'));
      mm.on('mouseleave', 'listing-pins', () => (mm.getCanvas().style.cursor = ''));
    });
    return () => {
      cancelled = true;
      setMap(null);
      m?.remove();
    };
  }, [dark]);

  useEffect(() => {
    (map?.getSource('listings') as MLTypes.GeoJSONSource | undefined)?.setData(toGeo(pins, selectedId));
  }, [map, pins, selectedId]);

  useEffect(() => {
    if (focus && map)
      map.flyTo({
        center: [focus.lng, focus.lat],
        zoom: focus.zoom ?? 14,
        duration: 900,
      });
  }, [focus, map]);

  return (
    <>
      {/* keep the OSM attribution clear of the search bar and bottom buttons */}
      <style>{'.maplibregl-ctrl-top-right{top:120px}'}</style>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
    </>
  );
}
