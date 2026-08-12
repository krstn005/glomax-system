import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const navigate = useNavigate();
  const username = localStorage.getItem('username');

  function handleLogout() {
    localStorage.clear();
    navigate('/login');
  }

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>Welcome back, {username}!</h1>
      <p>Dashboard content goes here - built in the next step.</p>
      <button onClick={handleLogout}>Sign Out</button>
    </div>
  );
}