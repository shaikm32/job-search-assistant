import { useEffect, useState } from 'react'
import { getHealthStatus } from './api/health'
import './App.css'

function App() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'unavailable'>(
    'checking',
  )

  useEffect(() => {
    void getHealthStatus()
      .then(() => setStatus('connected'))
      .catch(() => setStatus('unavailable'))
  }, [])

  return (
    <main className="foundation">
      <p className="eyebrow">Local application foundation</p>
      <h1>Job Search Assistant</h1>
      <p className="description">
        The frontend is connected to its local application backend.
      </p>
      <p className={`status status--${status}`} role="status">
        {status === 'checking' && 'Checking local backend…'}
        {status === 'connected' && 'Local backend connected'}
        {status === 'unavailable' && 'Local backend unavailable'}
      </p>
    </main>
  )
}

export default App
