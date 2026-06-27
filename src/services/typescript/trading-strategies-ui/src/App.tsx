import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import Landing from './pages/Landing'
import Hello from './pages/Hello'
import Database from './pages/Database'
import TxnCost from './pages/TxnCost'

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/"         element={<Landing />} />
        <Route path="/hello"    element={<Hello />} />
        <Route path="/db"       element={<Database />} />
        <Route path="/txn-cost" element={<TxnCost />} />
      </Routes>
    </BrowserRouter>
  )
}
