import { RouterProvider } from 'react-router'
import { router } from './app/routes.js'
import { ThemeProvider } from './app/theme.js'

function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}

export default App
