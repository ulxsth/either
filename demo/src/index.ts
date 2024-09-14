import express from 'express'
import { Server } from 'socket.io'
import { createServer } from 'http'
import { EditorSocketIOServer } from '@nemurusleepy/either'

const app = express()
app.use(express.static('public'))

const server = createServer(app)
const io = new Server(server)

const editorSocketIOServer = new EditorSocketIOServer("channel1", "", [])

app.get("/", (req, res) => {
  return express.static('public/index.html')
})


io.on("connection", (socket) => {
  console.log("A user connected: ", socket.id)
  editorSocketIOServer.addClient(socket)
})

const port = 3000
server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
}).on('error', (err) => {
  throw new Error(err.message)
})
