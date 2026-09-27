import { Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import CommunityLandmarks from './pages/CommunityLandmarks'
import Contribute from './pages/Contribute'
import Dashboard from './pages/Dashboard'
import Landing from './pages/Landing'
import Login from './pages/Login'
import NewRoute from './pages/NewRoute'
import PublicRoute from './pages/PublicRoute'
import Register from './pages/Register'
import RouteBuilder from './pages/RouteBuilder'
import RouteShare from './pages/RouteShare'
import Verification from './pages/Verification'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Public recipient view — no account required. */}
        <Route path="/r/:token" element={<PublicRoute />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/routes/new"
          element={
            <ProtectedRoute>
              <NewRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/routes/:routeId"
          element={
            <ProtectedRoute>
              <RouteBuilder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/routes/:routeId/share"
          element={
            <ProtectedRoute>
              <RouteShare />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contribute"
          element={
            <ProtectedRoute>
              <Contribute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/landmarks"
          element={
            <ProtectedRoute>
              <CommunityLandmarks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/verification"
          element={
            <ProtectedRoute>
              <Verification />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  )
}
