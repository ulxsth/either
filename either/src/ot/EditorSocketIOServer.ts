import { Server, Socket } from "socket.io";

export class EditorSocketIOServer {
  private document = "";
  private deltas: AceAjax.Delta[] = [];
  private revision = 0;

  constructor(public io: Server) {
    io.on("connection", (socket: Socket) => {
      console.log("A user connected: ", socket.id);
      socket.emit("init", { document: this.document, revision: this.revision })

      socket.on("change", (data) => {
        const { document: newDoc, delta, revision } = data
        this.document = newDoc
        this.deltas.push(delta)
        console.log("change: ", delta.lines.join("\n"), revision)

        socket.broadcast.emit("change", data)
        socket.emit("ack")
      })
    })
  }
}
