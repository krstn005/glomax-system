import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './roof-map.css';

// One map used in two places:
//   mode="pin"     Customer, New Request page. Tap the map or drag the pin
//                  to mark the roof.
//   mode="outline" Partner Installer, Assessment Sheet. Tap the corners of
//                  the roof to draw its outline. The corners can be dragged.
// Maps: Esri satellite pictures + OpenStreetMap. Address lookup: Nominatim.
// All of these are free and need no API key.

const MAP_START = [14.5995, 120.9842]; // Manila
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const STREET_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const PIN_ICON = L.divIcon({
  className: 'rm-pin',
  html:
    '<svg width="30" height="40" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 1C5.9 1 1 5.8 1 11.7 1 19.6 12 31 12 31s11-11.4 11-19.3C23 5.8 18.1 1 12 1z" fill="#facc15" stroke="#0d1f3c" stroke-width="2"/>' +
    '<circle cx="12" cy="11.5" r="4" fill="#0d1f3c"/></svg>',
  iconSize: [30, 40],
  iconAnchor: [15, 38],
});

// The customer's own pin, shown on the Partner Installer's map
const REFERENCE_ICON = L.divIcon({
  className: 'rm-pin rm-pin-ref',
  html:
    '<svg width="26" height="34" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 1C5.9 1 1 5.8 1 11.7 1 19.6 12 31 12 31s11-11.4 11-19.3C23 5.8 18.1 1 12 1z" fill="#ffffff" stroke="#0d1f3c" stroke-width="2"/>' +
    '<circle cx="12" cy="11.5" r="4" fill="#0d1f3c"/></svg>',
  iconSize: [26, 34],
  iconAnchor: [13, 32],
});

const CORNER_ICON = L.divIcon({
  className: 'rm-corner',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const EARTH_RADIUS_M = 6371008.8;

// Flat area of an outline in square meters. [[lat, lng], ...]
// The server measures it again, this one only gives instant feedback.
export function outlineAreaSqm(points) {
  if (!points || points.length < 3) return 0;
  const lat0 = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const kx = (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((lat0 * Math.PI) / 180);
  const ky = (Math.PI / 180) * EARTH_RADIUS_M;
  const xy = points.map(([lat, lng]) => [lng * kx, lat * ky]);
  let total = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    total += x1 * y2 - x2 * y1;
  }
  return Math.abs(total) / 2;
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// Free address search is strict. So we try the address a few ways,
// from the most detailed to the simplest, and use the first one that is found.
function addressTries(text) {
  const spelled = text
    .replace(/\bsta\.?(?=\s)/gi, 'Santa')
    .replace(/\bsto\.?(?=\s)/gi, 'Santo')
    .replace(/\bst\.?(?=\s|,|$)/gi, 'Street')
    .replace(/\bave\.?(?=\s|,|$)/gi, 'Avenue')
    .replace(/\bblvd\.?(?=\s|,|$)/gi, 'Boulevard')
    .replace(/\s+/g, ' ')
    .trim();
  // Take out barangay, zone, purok and subdivision words that the map does not know
  const noBarangay = spelled
    .replace(/\b(brgy|bgy|barangay)\.?\s*[\w-]*/gi, '')
    .replace(/\b(zone|purok|phase|block|blk|lot)\.?\s*[\w-]*/gi, '')
    .replace(/(,\s*)+/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .replace(/\s+/g, ' ');
  // Without the house number
  const noNumber = noBarangay.replace(/^#?\d+[\w-]*\s+/, '');
  // Only the last two parts, usually the area and the city
  const parts = noBarangay.split(',').map((p) => p.trim()).filter(Boolean);
  const area = parts.slice(-2).join(', ');
  const list = [text, spelled, noBarangay, noNumber, area, parts.slice(-1).join(', ')];
  return [...new Set(list.filter((q) => q && q.length >= 4))].slice(0, 5);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function RoofMap({
  mode = 'pin',
  pin = null, // { lat, lng } for pin mode
  onPinChange, // ({ lat, lng }, addressText | null) => void
  address = '', // pin mode: typed address, used to find the place
  outline = [], // outline mode: [[lat, lng], ...]
  onOutlineChange,
  referencePin = null, // outline mode: the customer's pin { lat, lng }
  height = 340,
  invalid = false,
}) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const pinMarkerRef = useRef(null);
  const refMarkerRef = useRef(null);
  const polygonRef = useRef(null);
  const cornersRef = useRef([]);
  const actionsRef = useRef({});
  const propsRef = useRef({});
  const skipAddressRef = useRef(false);
  const [view, setView] = useState('satellite');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  propsRef.current = { mode, pin, onPinChange, address, outline, onOutlineChange, referencePin };

  // ---------- Pin mode ----------

  function putPin(lat, lng) {
    const map = mapRef.current;
    if (!map) return;
    if (!pinMarkerRef.current) {
      const marker = L.marker([lat, lng], { icon: PIN_ICON, draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        actionsRef.current.pickAt(p.lat, p.lng);
      });
      pinMarkerRef.current = marker;
    } else {
      pinMarkerRef.current.setLatLng([lat, lng]);
    }
  }

  async function pickAt(lat, lng) {
    const map = mapRef.current;
    if (!map) return;
    putPin(lat, lng);
    map.setView([lat, lng], Math.max(map.getZoom(), 18));
    setBusy(true);
    setNote('');
    let text = null;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`,
      );
      const data = await res.json();
      text = data?.display_name || null;
    } catch {
      text = null;
    }
    if (!mapRef.current) return;
    if (text && text !== propsRef.current.address) skipAddressRef.current = true;
    propsRef.current.onPinChange?.({ lat, lng }, text);
    setBusy(false);
  }

  // ---------- Outline mode ----------

  function drawOutline(points) {
    const map = mapRef.current;
    if (!map) return;
    cornersRef.current.forEach((m) => m.remove());
    cornersRef.current = [];
    if (polygonRef.current) {
      polygonRef.current.remove();
      polygonRef.current = null;
    }
    if (!points.length) return;

    const live = points.map((p) => [...p]);
    const polygon = L.polygon(live, {
      color: '#facc15',
      weight: 3,
      fillColor: '#facc15',
      fillOpacity: 0.25,
    }).addTo(map);
    polygonRef.current = polygon;

    live.forEach((point, index) => {
      const marker = L.marker(point, { icon: CORNER_ICON, draggable: true }).addTo(map);
      marker.on('drag', () => {
        const p = marker.getLatLng();
        live[index] = [p.lat, p.lng];
        polygon.setLatLngs(live);
      });
      marker.on('dragend', () => {
        propsRef.current.onOutlineChange?.(live.map((p) => [Number(p[0].toFixed(7)), Number(p[1].toFixed(7))]));
      });
      cornersRef.current.push(marker);
    });
  }

  function addCorner(lat, lng) {
    const current = propsRef.current.outline || [];
    if (current.length >= 40) {
      setNote('That is enough corners. Remove one before adding another.');
      return;
    }
    setNote('');
    propsRef.current.onOutlineChange?.([...current, [Number(lat.toFixed(7)), Number(lng.toFixed(7))]]);
  }

  actionsRef.current = { pickAt, addCorner };

  function findMyLocation() {
    if (!navigator.geolocation) {
      setNote('Your phone or browser cannot share its location. Please tap the map instead.');
      return;
    }
    setBusy(true);
    setNote('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        if (propsRef.current.mode === 'pin') {
          actionsRef.current.pickAt(pos.coords.latitude, pos.coords.longitude);
        } else {
          mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 19);
        }
      },
      () => {
        setBusy(false);
        setNote('We could not get your location. Please allow location access, or tap the map instead.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Create the map once
  useEffect(() => {
    const map = L.map(boxRef.current, { center: MAP_START, zoom: 11, scrollWheelZoom: false });
    layersRef.current = {
      satellite: L.tileLayer(SATELLITE_TILES, { maxZoom: 19, attribution: 'Imagery &copy; Esri' }),
      map: L.tileLayer(STREET_TILES, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }),
    };
    layersRef.current.satellite.addTo(map);
    map.on('click', (e) => {
      if (propsRef.current.mode === 'pin') actionsRef.current.pickAt(e.latlng.lat, e.latlng.lng);
      else actionsRef.current.addCorner(e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;

    // Start on what is already known
    const { mode: m, pin: p, outline: o, referencePin: r } = propsRef.current;
    if (m === 'pin' && p) {
      putPin(p.lat, p.lng);
      map.setView([p.lat, p.lng], 18);
    }
    if (m === 'outline') {
      if (o && o.length) {
        drawOutline(o);
        if (o.length >= 3) map.fitBounds(L.latLngBounds(o), { maxZoom: 20, padding: [30, 30] });
        else map.setView(o[0], 19);
      } else if (r) {
        map.setView([r.lat, r.lng], 19);
      }
    }

    const fix = setTimeout(() => map.invalidateSize(), 300);
    return () => {
      clearTimeout(fix);
      map.remove();
      mapRef.current = null;
      pinMarkerRef.current = null;
      refMarkerRef.current = null;
      polygonRef.current = null;
      cornersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Satellite / Map switch
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers.satellite) return;
    const other = view === 'satellite' ? layers.map : layers.satellite;
    if (map.hasLayer(other)) map.removeLayer(other);
    if (!map.hasLayer(layers[view])) layers[view].addTo(map);
  }, [view]);

  // The customer's pin on the installer's map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'outline') return;
    if (refMarkerRef.current) {
      refMarkerRef.current.remove();
      refMarkerRef.current = null;
    }
    if (referencePin) {
      refMarkerRef.current = L.marker([referencePin.lat, referencePin.lng], {
        icon: REFERENCE_ICON,
        interactive: false,
      }).addTo(map);
    }
  }, [mode, referencePin?.lat, referencePin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pin mode: the pin changed from outside (for example a saved ticket)
  useEffect(() => {
    if (mode !== 'pin' || !mapRef.current) return;
    if (pin) {
      putPin(pin.lat, pin.lng);
    } else if (pinMarkerRef.current) {
      pinMarkerRef.current.remove();
      pinMarkerRef.current = null;
    }
  }, [mode, pin?.lat, pin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outline mode: redraw when the corners change
  useEffect(() => {
    if (mode !== 'outline') return;
    drawOutline(outline || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, JSON.stringify(outline)]);

  // Pin mode: the customer typed an address. Wait a moment, then move the pin there.
  useEffect(() => {
    if (mode !== 'pin') return undefined;
    if (skipAddressRef.current) {
      skipAddressRef.current = false;
      return undefined;
    }
    const clean = address.trim();
    if (clean.length < 5) return undefined;
    // A pin that is already placed is never moved by the address text.
    // The customer can drag it, or tap another spot.
    if (propsRef.current.pin) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setNote('');
      try {
        let hit = null;
        const tries = addressTries(clean);
        for (let i = 0; i < tries.length && !hit; i += 1) {
          if (i > 0) await sleep(1100); // the free service asks for one search per second
          if (controller.signal.aborted) return;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(tries[i])}`,
            { signal: controller.signal },
          );
          const data = await res.json();
          hit = Array.isArray(data) ? data[0] : null;
        }
        if (hit && mapRef.current) {
          const lat = Number(hit.lat);
          const lng = Number(hit.lon);
          putPin(lat, lng);
          mapRef.current.setView([lat, lng], 18);
          propsRef.current.onPinChange?.({ lat, lng }, null);
        } else {
          setNote('We could not find that address. Add your street and city, or tap the map to pin your roof.');
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setNote('The map could not look up that address. You can tap the map to pin your roof.');
        }
      }
      setBusy(false);
    }, 900);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, address]);

  const cornerCount = outline?.length || 0;
  const area = mode === 'outline' ? outlineAreaSqm(outline) : 0;

  return (
    <div className={`rm-wrap ${invalid ? 'invalid' : ''}`}>
      <div className="rm-toolbar">
        <div className="rm-switch" role="group" aria-label="Map view">
          <button type="button" className={view === 'satellite' ? 'on' : ''} onClick={() => setView('satellite')}>
            Satellite
          </button>
          <button type="button" className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>
            Map
          </button>
        </div>
        <button type="button" className="rm-tool" onClick={findMyLocation} disabled={busy}>
          Use my location
        </button>
        {mode === 'outline' && (
          <>
            <button
              type="button"
              className="rm-tool"
              disabled={!cornerCount}
              onClick={() => onOutlineChange?.(outline.slice(0, -1))}
            >
              Undo last corner
            </button>
            <button type="button" className="rm-tool danger" disabled={!cornerCount} onClick={() => onOutlineChange?.([])}>
              Clear outline
            </button>
          </>
        )}
        {busy && <span className="rm-busy">Please wait...</span>}
      </div>

      <div className="rm-box" style={{ height }} ref={boxRef} />

      <p className="rm-help">
        {mode === 'pin'
          ? pin
            ? 'Pin saved. Drag the pin or tap another spot to move it.'
            : 'Type your address above, or tap the map on top of your roof. Then check that the pin is on your roof. You can drag it.'
          : cornerCount < 3
          ? `Tap each corner of the roof, one by one, to draw its outline (${cornerCount} so far, at least 3). Zoom in for a better fit.`
          : `Outline has ${cornerCount} corners. Flat area from above: ${area.toFixed(1)} sq.m. Drag a corner to fix it.`}
      </p>
      {note && <p className="rm-note">{note}</p>}
    </div>
  );
}