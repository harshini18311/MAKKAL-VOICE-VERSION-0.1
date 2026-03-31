import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { reverseGeocode, searchPlacesTamilNadu, isWithinTamilNaduBounds } from '../utils/geoUtils';
import { TN_CENTER, TN_SW, TN_NE } from '../utils/tamilNaduGeo';
import { Navigation, Search, MapPin } from 'lucide-react';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const TN_MAX_BOUNDS = L.latLngBounds(TN_SW, TN_NE);

function ChangeView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position === null ? null : <Marker position={position}></Marker>;
}

export default function MapPicker({ onSelect, onClose, initialCoords }) {
  const [position, setPosition] = useState(
    initialCoords && isWithinTamilNaduBounds(initialCoords.lat, initialCoords.lng)
      ? initialCoords
      : { lat: TN_CENTER.lat, lng: TN_CENTER.lng }
  );
  const [zoom, setZoom] = useState(
    initialCoords && isWithinTamilNaduBounds(initialCoords.lat, initialCoords.lng) ? 16 : 8
  );
  const [loading, setLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchHits, setSearchHits] = useState([]);

  const handleLocateMe = (isAuto = false) => {
    if (!navigator.geolocation) {
      if (!isAuto) alert('Geolocation is not supported by your browser');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        console.log(`Map detected location with accuracy: ${accuracy} meters`);
        const newPos = { lat: latitude, lng: longitude };
        if (!isWithinTamilNaduBounds(latitude, longitude)) {
          if (!isAuto) {
            alert(
              'Your GPS position is outside Tamil Nadu. This app accepts complaints only for Tamil Nadu. Please search for a place or tap the map inside the state.'
            );
          }
          setPosition({ lat: TN_CENTER.lat, lng: TN_CENTER.lng });
          setZoom(8);
        } else {
          setPosition(newPos);
          setZoom(17);
        }
        setIsLocating(false);
      },
      (error) => {
        console.error('Locate error:', error);
        if (!isAuto) {
          let msg = 'Unable to retrieve location: ';
          if (error.code === 1) msg += 'Permission denied.';
          else if (error.code === 2) msg += 'Position unavailable.';
          else if (error.code === 3) msg += 'Timeout.';
          else msg += error.message;
          alert(msg);
        }
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchHits([]);
    try {
      const hits = await searchPlacesTamilNadu(searchQuery);
      setSearchHits(hits);
      if (hits.length === 0) {
        alert('No places found in Tamil Nadu for that search. Try a village name, taluk, or landmark.');
      } else if (hits.length === 1) {
        const h = hits[0];
        setPosition({ lat: h.lat, lng: h.lon });
        setZoom(16);
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const pickSearchHit = (h) => {
    setPosition({ lat: h.lat, lng: h.lon });
    setZoom(16);
    setSearchHits([]);
    setSearchQuery('');
  };

  const handleConfirm = async () => {
    if (!isWithinTamilNaduBounds(position.lat, position.lng)) {
      alert('Please choose a location inside Tamil Nadu.');
      return;
    }
    setLoading(true);
    try {
      const address = await reverseGeocode(position.lat, position.lng);
      onSelect(address, position);
    } catch (error) {
      onSelect(`${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`, position);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
        padding: '1rem'
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '800px',
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0
        }}
      >
        <div style={{ padding: '0.75rem 1rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Pin location in Tamil Nadu</h3>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', height: 'auto' }} onClick={onClose}>
              ✕
            </button>
          </div>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Map is limited to Tamil Nadu. Search uses OpenStreetMap (village / street names work best).
          </p>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                className="form-input"
                style={{ paddingLeft: '2.5rem', height: '40px', fontSize: '0.9rem' }}
                placeholder="e.g. Anna Nagar Chennai, Dindigul bus stand, village name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '0 1.25rem', height: '40px' }} disabled={isSearching}>
              {isSearching ? '...' : 'Search'}
            </button>
          </form>
          {searchHits.length > 1 && (
            <ul
              style={{
                margin: '0.5rem 0 0',
                padding: '0.5rem',
                maxHeight: '120px',
                overflowY: 'auto',
                listStyle: 'none',
                fontSize: '0.8rem',
                border: '1px solid var(--border)',
                borderRadius: '0.35rem',
                background: 'rgba(0,0,0,0.03)'
              }}
            >
              {searchHits.map((h, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => pickSearchHit(h)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.35rem',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--primary)'
                    }}
                  >
                    {h.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer
            center={[position.lat, position.lng]}
            zoom={zoom}
            style={{ height: '100%', width: '100%' }}
            maxBounds={TN_MAX_BOUNDS}
            maxBoundsViscosity={0.85}
            minZoom={7}
            maxZoom={19}
          >
            <ChangeView center={[position.lat, position.lng]} zoom={zoom} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker position={position} setPosition={setPosition} />
          </MapContainer>

          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              right: '20px',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <button
              type="button"
              onClick={() => handleLocateMe(false)}
              disabled={isLocating}
              style={{
                width: '45px',
                height: '45px',
                borderRadius: '50%',
                background: 'white',
                border: '2px solid var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                color: 'var(--primary)'
              }}
              title="Use my GPS (Tamil Nadu only)"
            >
              <Navigation size={20} className={isLocating ? 'animate-pulse' : ''} fill={isLocating ? 'var(--primary)' : 'none'} />
            </button>
          </div>
        </div>

        <div
          style={{
            padding: '1rem 1.25rem',
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(79, 70, 229, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)'
              }}
            >
              <MapPin size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Coordinates (WGS84)
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {parseFloat(position.lat).toFixed(6)}, {parseFloat(position.lng).toFixed(6)}
              </span>
            </div>
          </div>
          <button type="button" className="btn btn-primary" style={{ minWidth: '160px', borderRadius: '0.75rem' }} onClick={handleConfirm} disabled={loading}>
            {loading ? 'Fetching address…' : 'Confirm location'}
          </button>
        </div>
      </div>
    </div>
  );
}
