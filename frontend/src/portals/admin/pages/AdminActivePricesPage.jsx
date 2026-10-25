import { Navigate } from 'react-router-dom';

// Active Prices is now part of the Prices page (/admin/price-history).
// This keeps old links and bookmarks working.
export default function AdminActivePricesPage() {
  return <Navigate to="/admin/price-history" replace />;
}