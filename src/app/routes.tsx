import { createBrowserRouter } from 'react-router'
import { AddApplicationPage } from '../features/applications/AddApplicationPage.js'
import { ApplicationDetailPage } from '../features/applications/ApplicationDetailPage.js'
import { ApplicationsPage } from '../features/applications/ApplicationsPage.js'
import { EditApplicationPage } from '../features/applications/EditApplicationPage.js'
import { DashboardPage } from '../features/dashboard/DashboardPage.js'
import { AddPersonPage } from '../features/people/AddPersonPage.js'
import { EditPersonPage } from '../features/people/EditPersonPage.js'
import { PeoplePage } from '../features/people/PeoplePage.js'
import { PersonDetailPage } from '../features/people/PersonDetailPage.js'
import { EnhancementSessionPage } from '../features/resume-enhancer/EnhancementSessionPage.js'
import { ResumeEnhancerPage } from '../features/resume-enhancer/ResumeEnhancerPage.js'
import { SettingsPage } from '../features/settings/SettingsPage.js'
import { AppShell } from './AppShell.js'
import { PlaceholderPage } from './PlaceholderPage.js'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      { path: 'applications', element: <ApplicationsPage /> },
      { path: 'applications/new', element: <AddApplicationPage /> },
      { path: 'applications/:id', element: <ApplicationDetailPage /> },
      { path: 'applications/:id/edit', element: <EditApplicationPage /> },
      { path: 'people', element: <PeoplePage /> },
      { path: 'people/new', element: <AddPersonPage /> },
      { path: 'people/:id', element: <PersonDetailPage /> },
      { path: 'people/:id/edit', element: <EditPersonPage /> },
      { path: 'resume-enhancer', element: <ResumeEnhancerPage /> },
      { path: 'resume-enhancer/:sessionId', element: <EnhancementSessionPage /> },
      { path: 'settings', element: <SettingsPage /> },
      {
        path: '*',
        element: (
          <PlaceholderPage title="Not found" message="This page does not exist." />
        ),
      },
    ],
  },
])
