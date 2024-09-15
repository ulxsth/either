import express from 'express'
import { Server } from 'socket.io'
import { createServer } from 'http'

const app = express()
app.use(express.static('public'))

const server = createServer(app)
const io = new Server(server)

app.get("/", (req, res) => {
  return express.static('public/index.html')
})

let document = "";
let ops = [];
let revision = 0;

io.on("connection", (socket) => {
  console.log("A user connected: ", socket.id);
  socket.emit("init", { document, revision })

  socket.on("change", (data) => {
    console.log(data);
    const { document: newDoc, delta, revision } = data
    document = newDoc
    console.log("change: ", delta, revision)
    socket.broadcast.emit("change", data)
  })
})

const port = 3000
server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
}).on('error', (err) => {
  throw new Error(err.message)
})
