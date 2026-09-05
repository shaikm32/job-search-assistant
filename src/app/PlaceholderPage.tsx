import { Link } from 'react-router'

interface PlaceholderPageProps {
  title: string
  message: string
}

export function PlaceholderPage({ title, message }: PlaceholderPageProps) {
  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{message}</p>
      <p>
        <Link className="link" to="/applications">
          Go to Applications
        </Link>
      </p>
    </div>
  )
}
