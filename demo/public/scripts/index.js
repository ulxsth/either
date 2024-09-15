class AceAdapter {
  constructor(socket, editor) {
    this.socket = socket;
    this.editor = editor;
    this.revision = 0;
    this.isSystemChange = false;
    this.deltas = [];

    // イベントの発信
    editor.session.on('change', (delta) => {
      if (this.isSystemChange) {
        this.isSystemChange = false;
        return;
      }
      console.log(delta, this.revision);
      this.deltas.push(delta);

      socket.emit("change", {
        document: editor.session.getValue(),
        delta,
        revision: ++this.revision
      });
    });

    // イベントの受信
    socket.on("init", (data) => {
      console.log(data);

      const { document, revision: receiveRevision } = data;

      this.isSystemChange = true;
      editor.setValue(document);
      this.isSystemChange = false;

      this.revision = receiveRevision;
      editor.session.setValue(data.document);
      this.revision = data.revision;
    })

    socket.on("change", (data) => {
      console.log(data);
      const { delta, revision: receiveRevision } = data;
      if (this.revision === receiveRevision) {
        const [delta1, delta2] = this.transform(delta, this.deltas.pop());
        if (delta1) {
          this.applyDeltas([delta1]);
        }
        if (delta2) {
          this.applyDeltas([delta2]);
        }
      } else {
        this.applyDeltas([delta]);
      }
    });
  }


  applyDeltas = (deltas) => {
    this.isSystemChange = true;
    deltas.forEach((delta) => {
      if (!delta) {
        return;
      }
      this.editor.session.doc.applyDeltas([delta]);
      deltas.push(delta);
      this.revision++;
    });
    this.isSystemChange = false;
  };

  /**
   * ふたつの差分を受け取り、競合しないように変換して返す。
   * 返されるdeltaは、実行順に並べたもの。
   * @param {*} delta1
   * @param {*} delta2
   * @returns [delta1, delta2?] 実行順。delta2はnullの場合がある。
   */
  transform(delta1, delta2) {
    if (!delta1) {
      return [delta2];
    } else if (!delta2) {
      return [delta1];
    }

    // insert / insert
    // ふたつのdeltaの開始位置が違う行に対して存在している場合、より下の行を編集するdeltaを優先する。
    // ふたつのdeltaの開始位置が違う列に対して存在している場合、より右の行を編集するdeltaを優先する。
    // ふたつの開始位置が完全に同じ場合、後者のdeltaの開始位置を前者の終了位置に合わせる。
    if (delta1.action === "insert" && delta2.action === "insert") {
      if (delta1.start.row < delta2.start.row) {
        let w = delta1;
        delta1 = delta2;
        delta2 = w;
      } else if (delta1.start.row === delta2.start.row) {
        if (delta1.start.column < delta2.start.column) {
          let w = delta1;
          delta1 = delta2;
          delta2 = w;
        } else if (delta1.start.column === delta2.start.column) {
          delta2.start = delta1.end;

          const d = this.calcMoveDelta(delta1.start, delta1.end);
          delta2.end = this.calcMovedPosition(delta2.end, d);
        }
      }
    }

    // remove / remove
    // 削除は範囲に対して行うため、ふたつの範囲のとりえる状態によって処理を分ける。
    if (delta1.action === "remove" && delta2.action === "remove") {
      // 0. 範囲が同一の場合、2つめのDeltaを無効化する。
      if (delta1.start.row === delta2.start.row && delta1.start.column === delta2.start.column) {
        return [delta1];
      }

      // 1. 行範囲が交差しない場合
      //   ふたつのdeltaの行範囲が交差しないか一行だけ重複する場合、より後のdeltaを優先する。
      if (delta1.end.row < delta2.start.row
        || delta1.end.row === delta2.start.row
        && delta1.end.column < delta2.start.column
      ) {
        let w = delta1;
        delta1 = delta2;
        delta2 = w;

        // 2. 行範囲が交差し、かつ列範囲が交差する場合
        //   削除は範囲に対して行うため、ふたつの範囲のとりえる状態によって処理を分ける。
      } else if (this.hasDuplicate(delta1, delta2)) {

        //   - 包含：より大きい範囲が小さい範囲を包含する場合、小さい範囲を削除する。2つめのDeltaを無効化する。
        if (this.isDeltaIncludeDelta(delta1, delta2)) {
          return [delta1];
        } else if (this.isDeltaIncludeDelta(delta2, delta1)) {
          return [delta2];

          //   - 交差：範囲が重なる場合、ふたつの範囲をマージした範囲を作成する。2つめのDeltaは無効化する。
        } else {
          // TODO: mergeDeltas
          const newDelta = this.mergeDeltas(delta1, delta2);
          return [newDelta];
        }
      }
    }

    // insert / remove
    // 挿入は開始位置、削除は範囲として扱うため、ふたつのdeltaのとりえる状態によって処理を分ける。
    if (delta1.action === "insert" && delta2.action === "remove") {
      // 0. 挿入位置が削除範囲の前にある場合、適用の順番を入れ替える。
      if (delta1.start.row < delta2.start.row
        || delta1.start.row === delta2.start.row
        && delta1.start.column < delta2.start.column
      ) {
        let w = delta1;
        delta1 = delta2;
        delta2 = w;

        // 1. 削除範囲の中に挿入位置がある場合、削除位置の開始地点に挿入位置をずらす。
      } else if (this.isDeltaIncludePosition(delta2, delta1.start)) {
        const d = this.calcMoveDelta(delta2.start, delta1.start);
        delta1.start = delta2.start;
        delta1.end = this.calcMovedPosition(delta1.end, d);
      }

      // 2. 挿入位置が削除範囲の後ろにある場合、そのまま返す。
    }

    if (delta1.action === "remove" && delta2.action === "insert") {
      // 0. 削除範囲の前に挿入位置がある場合、適用の順番を入れ替える。
      if (delta2.start.row < delta1.start.row
        || delta2.start.row === delta1.start.row
        && delta2.start.column < delta1.start.column
      ) {
        let w = delta1;
        delta1 = delta2;
        delta2 = w;

        // 1. 挿入位置が削除範囲の中にある場合、挿入位置を削除範囲の開始地点にずらす。
      } else if (this.isDeltaIncludePosition(delta1, delta2.start)) {
        const d = this.calcMoveDelta(delta1.start, delta2.start);
        delta2.start = delta1.start;
        delta2.end = this.calcMovedPosition(delta2.end, d);
      }

      // 2. 挿入位置が削除範囲の後ろにある場合、そのまま返す。
    }

    return [delta1, delta2];
  }


  /**
   * 開始位置から終了位置までの、カーソル位置の差分を計算する。
   * @param {*} start 開始位置
   * @param {*} end 終了位置
   * @returns {row: number, column: number}
   */
  calcMoveDelta(start, end) {
    return {
      row: end.row - start.row,
      column: end.column - start.column
    };
  }

  /**
   * カーソルを移動させたあとの位置を計算する。
   * @param {*} pos カーソルの位置
   * @param {*} delta 移動量
   * @returns {row: number, column: number}
   */
  calcMovedPosition(pos, delta) {
    return {
      row: pos.row + delta.row,
      column: pos.column + delta.column
    };
  }

  /**
   * 範囲に重複する部分があるかを判定する
   * @param {*} delta1
   * @param {*} delta2
   * @returns boolean
   */
  hasDuplicate(delta1, delta2) {
    return (
      delta1.start.row <= delta2.end.row &&
      delta1.start.column <= delta2.end.column &&
      delta1.end.row >= delta2.start.row &&
      delta1.end.column >= delta2.start.column ||
      delta2.start.row <= delta1.end.row &&
      delta2.start.column <= delta1.end.column &&
      delta2.end.row >= delta1.start.row &&
      delta2.end.column >= delta1.start.column
    );
  }

  /**
   * 範囲が位置を包含しているかを判定する。
   * @param {*} delta 範囲を表すdelta
   * @param {*} pos 位置
   */
  isDeltaIncludePosition(delta, pos) {
    return (
      delta.start.row <= pos.row &&
      delta.start.column <= pos.column &&
      delta.end.row >= pos.row &&
      delta.end.column >= pos.column
    );
  }

  /**
   * delta1の範囲がdelta2の範囲に含まれるかを判定する。
   * @param {*} delta1
   * @param {*} delta2
   * @returns
   */
  isDeltaIncludeDelta(delta1, delta2) {
    return (
      delta1.start.row <= delta2.start.row &&
      delta1.start.column <= delta2.start.column &&
      delta1.end.row >= delta2.end.row &&
      delta1.end.column >= delta2.end.column
    );
  }

  /**
   * より上、より左の位置を返す。
   * @param {*} pos1
   * @param {*} pos2
   * @returns
   */
  minPosition(pos1, pos2) {
    if (pos1.row < pos2.row) {
      return pos1;
    } else if (pos1.row === pos2.row) {
      if (pos1.column < pos2.column) {
        return pos1;
      }
    }
    return pos2;
  }

  /**
   * より下、より右の位置を返す。
   * @param {*} pos1
   * @param {*} pos2
   * @returns
   */
  maxPosition(pos1, pos2) {
    if (pos1.row > pos2.row) {
      return pos1;
    } else if (pos1.row === pos2.row) {
      if (pos1.column > pos2.column) {
        return pos1;
      }
    }
    return pos2;
  }

  /**
   * ふたつのdeltaをマージしたdeltaを返す。
   * @param {*} delta1
   * @param {*} delta2
   * @returns
   */
  mergeDeltas(delta1, delta2) {
    // TODO:
    return delta1;
  }
}

const editor = ace.edit("editor");
editor.setTheme("ace/theme/chrome");
editor.session.setMode("ace/mode/markdown");

const socket = io();
const adapter = new AceAdapter(socket, editor);
