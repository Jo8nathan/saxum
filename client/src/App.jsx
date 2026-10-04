import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './components/Home.jsx'
import PlayView from './components/PlayView.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/w/:id" element={<PlayView />} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
