import { AceAdapter } from 'https://unpkg.com/@nemurusleepy/either-client@1.0.4/src/index.js';

const editor = ace.edit("editor");
editor.setTheme("ace/theme/chrome");
editor.session.setMode("ace/mode/markdown");

const socket = io();
const adapter = new AceAdapter(socket, editor);
