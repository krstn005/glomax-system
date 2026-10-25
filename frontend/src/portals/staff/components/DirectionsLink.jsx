import { MapPin } from "lucide-react";

export default function DirectionsLink({ address }) {
  if (!address) return null;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  return (
    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="stftd-directions-link">
      <MapPin size={13} />
      Get Directions
    </a>
  );
}