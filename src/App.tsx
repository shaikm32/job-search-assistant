import { RouterProvider } from 'react-router'
import { router } from './app/routes.js'
import { NavigationLockProvider } from './app/navigationLock.js'
import { ThemeProvider } from './app/theme.js'

function App() {
  return (
    <ThemeProvider>
      <NavigationLockProvider>
        <RouterProvider router={router} />
      </NavigationLockProvider>
    </ThemeProvider>
  )
}

export default App
