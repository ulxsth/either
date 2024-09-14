import io from "socket.io-client";
import Ace from "ace-builds";
import { AceAdapter } from "@nemurusleepy/either";

const editor = Ace.edit("editor");
const adopter = new AceAdapter(editor);
const socket = io();

// イベントの受信
socket.on("change", (delta) => {
  const op = adopter.getOperationFromDelta(delta);
  adopter.applyOperation(op);
});
