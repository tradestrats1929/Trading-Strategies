import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import Landing from './pages/Landing'
import Hello from './pages/Hello'
import TxnCost from './pages/TxnCost'
import SystemMonitor from './pages/SystemMonitor'
import Angel from './pages/Angel'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Nav />
      <Routes>
        <Route path="/"               element={<Landing />} />
        <Route path="/hello"          element={<Hello />} />
        <Route path="/txn-cost"       element={<TxnCost />} />
        <Route path="/system-monitor" element={<SystemMonitor />} />
        <Route path="/angel"          element={<Angel />} />
      </Routes>
    </BrowserRouter>
  )
}
