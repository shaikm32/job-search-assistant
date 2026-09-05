import { createBrowserRouter } from 'react-router'
import { AddApplicationPage } from '../features/applications/AddApplicationPage.js'
import { ApplicationDetailPage } from '../features/applications/ApplicationDetailPage.js'
import { ApplicationsPage } from '../features/applications/ApplicationsPage.js'
import { EditApplicationPage } from '../features/applications/EditApplicationPage.js'
import { AppShell } from './AppShell.js'
import { PlaceholderPage } from './PlaceholderPage.js'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <PlaceholderPage
            title="Dashboard"
            message="The dashboard arrives in Milestone 7. Application tracking is available now."
          />
        ),
      },
      { path: 'applications', element: <ApplicationsPage /> },
      { path: 'applications/new', element: <AddApplicationPage /> },
      { path: 'applications/:id', element: <ApplicationDetailPage /> },
      { path: 'applications/:id/edit', element: <EditApplicationPage /> },
      {
        path: 'people/*',
        element: (
          <PlaceholderPage
            title="People"
            message="Networking contact tracking arrives in Milestone 6."
          />
        ),
      },
      {
        path: '*',
        element: (
          <PlaceholderPage title="Not found" message="This page does not exist." />
        ),
      },
    ],
  },
])
