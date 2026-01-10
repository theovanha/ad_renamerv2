import { Routes, Route } from 'react-router-dom'
import SetupPage from './pages/SetupPage'
import ReviewPage from './pages/ReviewPage'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>VANHA Creative Auto-Namer</h1>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<SetupPage />} />
          <Route path="/review" element={<ReviewPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
