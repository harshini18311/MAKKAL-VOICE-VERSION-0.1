import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Use CDN-hosted marker assets to avoid local install asset issues on some Windows setups.
const markerIcon = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const markerShadow = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

export default function MapPicker({ onSelect, onClose }) {
  const [position, setPosition] = useState({ lat: 10.8505, lng: 76.2711 }); // Approx South India center

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center',
      alignItems: 'center', zIndex: 2000, padding: '1rem'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '800px', height: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Pin Location on Map</h3>
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose}>✕</button>
        </div>
        
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer center={[10.8505, 76.2711]} zoom={7} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker position={position} setPosition={setPosition} />
          </MapContainer>
        </div>

        <div style={{ padding: '1rem', background: 'var(--card-bg)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem' }}>Coordinates: {parseFloat(position.lat).toFixed(6)}, {parseFloat(position.lng).toFixed(6)}</span>
          <button className="btn btn-primary" onClick={() => onSelect(`${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`)}>
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
}
