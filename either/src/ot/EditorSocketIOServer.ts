import { Socket } from "socket.io";
import { TextOperation } from "./TextOperation";

export class EditorSocketIOServer {
  constructor(
    public channelId: string,
    public document: string,
    public operations: TextOperation[]
  ) {}

  public addClient(socket: Socket) {
    socket.join(this.channelId)
    socket.emit("init", {
      document: this.document,
      revision: this.operations.length
    })
    socket.on("operation", () => this.onOperation(socket))
    socket.on("disconnect", () => this.onDisconnect(socket))
  }

  public onOperation(socket: Socket) { }
  public onDisconnect(socket: Socket) {
    console.log("A user disconnected: ", socket.id);

    socket.leave(this.channelId)
  }
}
