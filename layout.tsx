'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type MetricsProps = {
  CTYUA24CD?: string;
  CTYUA24NM?: string;
  school_count?: number;
  avg_disadvantaged_pct?: number;
  avg_persist_disadvantaged_pct?: number;
  avg_pd_gap_months?: number;
  avg_eng_non_disadv?: number;
  avg_eng_persist_disadv?: number;
  avg_maths_non_disadv?: number;
  avg_maths_persist_disadv?: number;
};

type MetricKey = 'maths_gap' | 'english_gap';

function StatCard({
  title,
  value
}: {
  title: string;
  value: string;
}) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '12px 14px',
        background: '#fff'
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: '#6b7280',
          marginBottom: 6,
          lineHeight: 1.35
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: '#111827',
          lineHeight: 1.2
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedName, setSelectedName] = useState('Click an area');
  const [metricsLookup, setMetricsLookup] = useState<Record<string, MetricsProps>>({});
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('maths_gap');

  useEffect(() => {
    fetch('/data/la_metrics.geojson')
      .then((res) => res.json())
      .then((data) => {
        const lookup: Record<string, MetricsProps> = {};

        data.features.forEach((feature: any) => {
          const props = feature.properties || {};
          const code = props.CTYUA24CD;

          if (code) {
            lookup[code] = props;
          }
        });

        setMetricsLookup(lookup);
      })
      .catch((error) => {
        console.error('Failed to load local metrics file', error);
      });
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || Object.keys(metricsLookup).length === 0) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm'
          }
        ]
      },
      center: [-2.5, 53.5],
      zoom: 5
    });

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    map.on('load', () => {
      fetch(
        'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Counties_and_Unitary_Authorities_December_2024_Boundaries_UK_BGC/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson'
      )
        .then((res) => res.json())
        .then((geojson) => {
          geojson.features.forEach((feature: any) => {
            const code = feature.properties?.CTYUA24CD;
            const metrics = code ? metricsLookup[code] : null;
            const isEngland = !!code && code.startsWith('E');

            feature.properties = {
              ...feature.properties,
              school_count: metrics?.school_count ?? null,
              avg_disadvantaged_pct: metrics?.avg_disadvantaged_pct ?? null,
              avg_persist_disadvantaged_pct: metrics?.avg_persist_disadvantaged_pct ?? null,
              avg_pd_gap_months: metrics?.avg_pd_gap_months ?? null,
              avg_eng_non_disadv: metrics?.avg_eng_non_disadv ?? null,
              avg_eng_persist_disadv: metrics?.avg_eng_persist_disadv ?? null,
              avg_maths_non_disadv: metrics?.avg_maths_non_disadv ?? null,
              avg_maths_persist_disadv: metrics?.avg_maths_persist_disadv ?? null,
              english_gap:
                metrics?.avg_eng_non_disadv != null &&
                metrics?.avg_eng_persist_disadv != null
                  ? metrics.avg_eng_non_disadv - metrics.avg_eng_persist_disadv
                  : null,
              maths_gap:
                metrics?.avg_maths_non_disadv != null &&
                metrics?.avg_maths_persist_disadv != null
                  ? metrics.avg_maths_non_disadv - metrics.avg_maths_persist_disadv
                  : null,
              has_data: !!metrics && isEngland
            };
          });

          map.addSource('la-data', {
            type: 'geojson',
            data: geojson
          });

          map.addLayer({
            id: 'la-fill',
            type: 'fill',
            source: 'la-data',
            paint: {
              'fill-color': [
                'case',
                ['==', ['get', 'has_data'], false],
                '#e5e7eb',
                [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'maths_gap'], 0],
                  0, '#2ecc71',
                  0.5, '#a3d977',
                  1, '#f1c40f',
                  1.5, '#e67e22',
                  2, '#e74c3c',
                  3, '#c0392b'
                ]
              ],
              'fill-opacity': [
                'case',
                ['==', ['get', 'has_data'], false],
                0.45,
                0.8
              ]
            }
          });

          map.addLayer({
            id: 'la-borders',
            type: 'line',
            source: 'la-data',
            paint: {
              'line-color': '#ffffff',
              'line-width': 1
            }
          });

          map.on('mousemove', 'la-fill', (e) => {
            const feature = e.features && e.features[0];
            if (!feature) return;

            map.getCanvas().style.cursor = 'pointer';

            const props = feature.properties as any;

            if (!props?.has_data) {
              popup
                .setLngLat(e.lngLat)
                .setHTML(
                  `<div style="font-size:12px;line-height:1.4;">
                    <strong>${props?.CTYUA24NM || 'Area'}</strong><br/>
                    Outside England / no data
                  </div>`
                )
                .addTo(map);
              return;
            }

            const gapValue =
              props?.[selectedMetric] != null ? Number(props[selectedMetric]).toFixed(2) : '—';

            const metricLabel =
              selectedMetric === 'maths_gap'
                ? 'GCSE Maths attainment gap'
                : 'GCSE English attainment gap';

            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="font-size:12px;line-height:1.4;">
                  <strong>${props?.CTYUA24NM || 'Area'}</strong><br/>
                  ${metricLabel}: ${gapValue}
                </div>`
              )
              .addTo(map);
          });

          map.on('mouseleave', 'la-fill', () => {
            map.getCanvas().style.cursor = '';
            popup.remove();
          });

          map.on('click', 'la-fill', (e) => {
            const feature = e.features && e.features[0];
            if (!feature) return;

            const props = feature.properties as any;

            if (!props?.has_data) {
              setSelectedName(props?.CTYUA24NM || 'Area');
              setSelectedCode('');
              return;
            }

            setSelectedName(props?.CTYUA24NM || 'Area');
            setSelectedCode(props?.CTYUA24CD || '');
          });

          setLoaded(true);
        })
        .catch((error) => {
          console.error('Failed to load boundary GeoJSON', error);
        });
    });

    mapRef.current = map;

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [metricsLookup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('la-fill')) return;

    map.setPaintProperty('la-fill', 'fill-color', [
      'case',
      ['==', ['get', 'has_data'], false],
      '#e5e7eb',
      [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', selectedMetric], 0],
        0, '#2ecc71',
        0.5, '#a3d977',
        1, '#f1c40f',
        1.5, '#e67e22',
        2, '#e74c3c',
        3, '#c0392b'
      ]
    ]);

    map.setPaintProperty('la-fill', 'fill-opacity', [
      'case',
      ['==', ['get', 'has_data'], false],
      0.45,
      0.8
    ]);
  }, [selectedMetric]);

  const selectedMetrics = selectedCode ? metricsLookup[selectedCode] : null;

  const englishGap =
    selectedMetrics?.avg_eng_non_disadv != null && selectedMetrics?.avg_eng_persist_disadv != null
      ? selectedMetrics.avg_eng_non_disadv - selectedMetrics.avg_eng_persist_disadv
      : null;

  const mathsGap =
    selectedMetrics?.avg_maths_non_disadv != null &&
    selectedMetrics?.avg_maths_persist_disadv != null
      ? selectedMetrics.avg_maths_non_disadv - selectedMetrics.avg_maths_persist_disadv
      : null;

  return (
    <main style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {!loaded && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 2,
              background: 'white',
              padding: '10px 14px',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              fontFamily: 'Arial, sans-serif'
            }}
          >
            Loading map...
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 20,
            zIndex: 2,
            display: 'flex',
            gap: 8,
            background: 'white',
            padding: 8,
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            fontFamily: 'Arial, sans-serif'
          }}
        >
          <button
            onClick={() => setSelectedMetric('maths_gap')}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ccc',
              background: selectedMetric === 'maths_gap' ? '#1f2937' : 'white',
              color: selectedMetric === 'maths_gap' ? 'white' : 'black',
              cursor: 'pointer'
            }}
          >
            Maths gap
          </button>

          <button
            onClick={() => setSelectedMetric('english_gap')}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ccc',
              background: selectedMetric === 'english_gap' ? '#1f2937' : 'white',
              color: selectedMetric === 'english_gap' ? 'white' : 'black',
              cursor: 'pointer'
            }}
          >
            English gap
          </button>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            zIndex: 2,
            background: 'white',
            padding: '12px 14px',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            lineHeight: 1.4
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {selectedMetric === 'maths_gap'
              ? 'GCSE Maths attainment gap'
              : 'GCSE English attainment gap'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 14, height: 14, background: '#2ecc71' }} />
            <div>0.00–0.49 low gap</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 14, height: 14, background: '#a3d977' }} />
            <div>0.50–0.99</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 14, height: 14, background: '#f1c40f' }} />
            <div>1.00–1.49</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 14, height: 14, background: '#e67e22' }} />
            <div>1.50–1.99</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 14, height: 14, background: '#e74c3c' }} />
            <div>2.00–2.99</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 14, height: 14, background: '#c0392b' }} />
            <div>3.00+ highest gap</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ width: 14, height: 14, background: '#e5e7eb' }} />
            <div>Outside England / no data</div>
          </div>
        </div>

        <div ref={mapContainer} style={{ height: '100%', width: '100%' }} />
      </div>

      <aside
        style={{
          width: '390px',
          background: 'white',
          borderLeft: '1px solid #ddd',
          padding: '20px',
          fontFamily: 'Arial, sans-serif',
          overflowY: 'auto'
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Local authority</h2>

        <p style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>{selectedName}</p>

        <p style={{ color: '#666', margin: '0 0 18px 0' }}>{selectedCode || '—'}</p>

        <div
          style={{
            background: '#f6f8fb',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 18
          }}
        >
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            {selectedMetrics ? (
              <>
                Persistently disadvantaged pupils score{' '}
                <strong>{englishGap != null ? englishGap.toFixed(2) : '—'}</strong> grades lower
                in English and <strong>{mathsGap != null ? mathsGap.toFixed(2) : '—'}</strong>{' '}
                grades lower in Maths.
              </>
            ) : (
              <>Click an English local authority to see its profile.</>
            )}
          </p>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <StatCard
            title="Number of Schools"
            value={selectedMetrics?.school_count != null ? String(selectedMetrics.school_count) : '—'}
          />

          <StatCard
            title="Percentage of Disadvantaged Pupils"
            value={
              selectedMetrics?.avg_disadvantaged_pct != null
                ? selectedMetrics.avg_disadvantaged_pct.toFixed(1) + '%'
                : '—'
            }
          />

          <StatCard
            title="Percentage of Persistently Disadvantaged Pupils"
            value={
              selectedMetrics?.avg_persist_disadvantaged_pct != null
                ? selectedMetrics.avg_persist_disadvantaged_pct.toFixed(1) + '%'
                : '—'
            }
          />

          <StatCard
            title="Persistent Disadvantage Gap"
            value={
              selectedMetrics?.avg_pd_gap_months != null
                ? selectedMetrics.avg_pd_gap_months.toFixed(1) + ' months'
                : '—'
            }
          />
        </div>

        <h3 style={{ marginTop: 24, marginBottom: 12 }}>GCSE Maths</h3>

        <div style={{ display: 'grid', gap: 12 }}>
          <StatCard
            title="Average Grade in GCSE Maths for a non-disadvantaged pupil"
            value={
              selectedMetrics?.avg_maths_non_disadv != null
                ? selectedMetrics.avg_maths_non_disadv.toFixed(2)
                : '—'
            }
          />

          <StatCard
            title="Average Grade in GCSE Maths for a persistently disadvantaged pupil"
            value={
              selectedMetrics?.avg_maths_persist_disadv != null
                ? selectedMetrics.avg_maths_persist_disadv.toFixed(2)
                : '—'
            }
          />

          <StatCard
            title="GCSE Maths attainment gap"
            value={mathsGap != null ? mathsGap.toFixed(2) : '—'}
          />
        </div>

        <h3 style={{ marginTop: 24, marginBottom: 12 }}>GCSE English</h3>

        <div style={{ display: 'grid', gap: 12 }}>
          <StatCard
            title="Average Grade in GCSE English for a non-disadvantaged pupil"
            value={
              selectedMetrics?.avg_eng_non_disadv != null
                ? selectedMetrics.avg_eng_non_disadv.toFixed(2)
                : '—'
            }
          />

          <StatCard
            title="Average Grade in GCSE English for a persistently disadvantaged pupil"
            value={
              selectedMetrics?.avg_eng_persist_disadv != null
                ? selectedMetrics.avg_eng_persist_disadv.toFixed(2)
                : '—'
            }
          />

          <StatCard
            title="GCSE English attainment gap"
            value={englishGap != null ? englishGap.toFixed(2) : '—'}
          />
        </div>
      </aside>
    </main>
  );
}