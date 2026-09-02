interface HealthResponse {
  status: 'ok'
}

export async function getHealthStatus(): Promise<HealthResponse> {
  const response = await fetch('/api/health')

  if (!response.ok) {
    throw new Error('The local backend did not respond successfully.')
  }

  return (await response.json()) as HealthResponse
}
