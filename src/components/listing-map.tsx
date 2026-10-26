// Native map (Android/iOS): MapLibre + OpenFreeMap tiles. No Google Maps key, no location permission.
import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { GURGAON, GURGAON_BOUNDS, MAP_STYLE, type ListingMapProps } from '@/components/listing-map.types';

export function ListingMap({ pins, selectedId, onSelect, focus, dark }: ListingMapProps) {
  const camera = useRef<CameraRef>(null);

  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: pins.map((p) => ({
        type: 'Feature',
        id: p.id,
        properties: { id: p.id, color: p.color, selected: p.id === selectedId ? 1 : 0 },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    }),
    [pins, selectedId],
  );

  useEffect(() => {
    if (focus) camera.current?.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? 14, duration: 900 });
  }, [focus]);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={dark ? MAP_STYLE.dark : MAP_STYLE.light}
      logo={false}
      compass={false}
      attribution
      attributionPosition={{ top: 124, right: 8 }}
      onPress={() => onSelect(null)}>
      <Camera
        ref={camera}
        initialViewState={{ center: [GURGAON.lng, GURGAON.lat], zoom: GURGAON.zoom }}
        minZoom={9.5}
        maxBounds={GURGAON_BOUNDS}
      />
      <GeoJSONSource
        id="listings"
        data={data}
        hitbox={{ top: 14, right: 14, bottom: 14, left: 14 }}
        onPress={(e) => {
          e.stopPropagation();
          const id = e.nativeEvent.features[0]?.properties?.id;
          if (id) onSelect(String(id));
        }}>
        <Layer
          type="circle"
          id="listing-halo"
          paint={{
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 20, 0],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.25,
          }}
        />
        <Layer
          type="circle"
          id="listing-pins"
          paint={{
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 11, 8],
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          }}
        />
      </GeoJSONSource>
    </Map>
  );
}
