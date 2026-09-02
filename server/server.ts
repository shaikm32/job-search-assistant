import { createHttpServer } from './http/create-http-server.js'

const host = '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '3001', 10)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

const server = createHttpServer()

server.listen(port, host, () => {
  console.info(`Local backend listening at http://${host}:${port}`)
})
