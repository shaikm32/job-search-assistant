import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * Navigation lock for the Resume Enhancer analysis (RESUME_ENHANCER.md §5).
 *
 * The active page declares the lock through `useSetNavigationLock`; the shell
 * reads it to disable the header navigation, and the page itself uses a router
 * blocker for programmatic navigation and browser history. The provider sits
 * outside the router so the flag survives route-render churn and is cleared
 * automatically when the locking page unmounts.
 */

/**
 * Pure predicate shared by the router blocker and the tests: navigation is
 * blocked only while the lock is held and the destination path actually
 * differs. Same-path navigations (for example a search-param change) are never
 * blocked.
 */
export function shouldBlockNavigation(
  locked: boolean,
  currentPathname: string,
  nextPathname: string,
): boolean {
  return locked && currentPathname !== nextPathname
}

interface NavigationLockValue {
  locked: boolean
  setLocked: (locked: boolean) => void
}

const NavigationLockContext = createContext<NavigationLockValue | null>(null)

export function NavigationLockProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false)
  const value = useMemo<NavigationLockValue>(() => ({ locked, setLocked }), [locked])
  return <NavigationLockContext.Provider value={value}>{children}</NavigationLockContext.Provider>
}

/** Current lock state; `false` when rendered without a provider. */
export function useNavigationLockStatus(): boolean {
  return useContext(NavigationLockContext)?.locked ?? false
}

/**
 * Declares whether the calling page currently holds the navigation lock. The
 * lock is released on unmount and whenever `locked` becomes false. Without a
 * provider this is a no-op, so a page can be rendered in isolation by tests.
 */
export function useSetNavigationLock(locked: boolean): void {
  const setLocked = useContext(NavigationLockContext)?.setLocked
  useEffect(() => {
    if (!setLocked) {
      return
    }
    setLocked(locked)
    return () => setLocked(false)
  }, [setLocked, locked])
}
