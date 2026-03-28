import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import ConnectButton from './ConnectButton'

export default function Layout() {
  const { pathname } = useLocation()
  const { isConnected } = useAccount()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="sticky top-0 z-40 border-b border-gray-800/50 bg-gray-950/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/" className="text-xl font-bold text-purple-400 hover:text-purple-300 transition">
            Monad Blitz
          </Link>
          <nav className="flex items-center gap-4">
            <NavLink to="/" current={pathname}>Lobiler</NavLink>
            {isConnected && <NavLink to="/my" current={pathname}>Lobilerim</NavLink>}
            <NavLink to="/create/quiz" current={pathname}>Quiz</NavLink>
            <NavLink to="/create/vote" current={pathname}>Oylama</NavLink>
            <ConnectButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

function NavLink({ to, current, children }: { to: string; current: string; children: React.ReactNode }) {
  const active = current === to || (to !== '/' && current.startsWith(to))
  return (
    <Link
      to={to}
      className={`text-sm font-medium transition-all duration-200 ${
        active
          ? 'text-purple-400'
          : 'text-gray-500 hover:text-gray-200'
      }`}
    >
      {children}
    </Link>
  )
}
