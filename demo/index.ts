import express from 'express'
import { Server } from 'socket.io'
import { createServer } from 'http'
import { EditorSocketIOServer } from '@nemurusleepy/either'

const app = express()
app.use(express.static('public'))

const server = createServer(app)
const io = new Server(server)
const editorSocketIOServer = new EditorSocketIOServer(io)

app.get("/", (req, res) => {
  return express.static('public/index.html')
})

const port = 3000
server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
}).on('error', (err) => {
  throw new Error(err.message)
})
