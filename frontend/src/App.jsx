import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastContainer } from './components/Toast';
import { InstallPrompt } from './components/InstallPrompt';

import Login from './pages/Login';

const Dashboard      = lazy(() => import('./pages/Dashboard'));
const Resources      = lazy(() => import('./pages/Resources'));
const ResourceDetail = lazy(() => import('./pages/ResourceDetail'));
const Upload         = lazy(() => import('./pages/Upload'));
const Announcements  = lazy(() => import('./pages/Announcements'));
const Offline        = lazy(() => import('./pages/Offline'));
const Management     = lazy(() => import('./pages/Management'));
const Profile        = lazy(() => import('./pages/Profile'));
const NotFound       = lazy(() => import('./pages/NotFound'));

function PageFallback() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
      <span
        className="spinner spinner-dark"
        style={{ width: 28, height: 28, borderWidth: 3 }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="resources" element={<Resources />} />
                <Route path="resources/:id" element={<ResourceDetail />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="upload" element={<Upload />} />
                <Route path="offline" element={<Offline />} />
                <Route path="profile" element={<Profile />} />
                <Route
                  path="manage"
                  element={
                    <ProtectedRoute requireRole={['rep', 'admin']}>
                      <Management />
                    </ProtectedRoute>
                  }
                />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>

          <ToastContainer />
          <InstallPrompt />
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
} 