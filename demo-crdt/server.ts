import express from 'express'
import { createServer } from 'http'

const app = express()
app.use(express.static('public'))
const server = createServer(app)

app.get("/", (req, res) => {
  return express.static('public/index.html')
})

const port = 3000
server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
}).on('error', (err) => {
  throw new Error(err.message)
})
