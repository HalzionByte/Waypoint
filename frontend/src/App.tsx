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
import RouteBuilder from './pages/RouteBuilder'
import RouteShare from './pages/RouteShare'
import Verification from './pages/Verification'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />

        {/* Public recipient view. */}
        <Route path="/r/:token" element={<PublicRoute />} />

        {/* Only reachable when signed out; redirects home if a session exists. */}
        <Route path="/login" element={<Login />} />

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
