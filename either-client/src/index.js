export class AceAdapter {
  constructor(socket, editor) {
    this.socket = socket;
    this.editor = editor;
    this.revision = 0;
    this.isSystemChange = false;
    this.deltas = [];

    setInterval(() => {
      console.log(`Current revision: ${this.revision}`);
    }, 5000);

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
        revision: this.revision
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
      const latestDelta = this.deltas.pop()
      if (latestDelta && this.revision === receiveRevision) {
        console.log(`conflict detected: ${latestDelta.action} / ${delta.action}`);
        const [delta1, delta2] = this.transform(delta, latestDelta);
        if (delta1) {
          this.applyDeltasAndAddRevision([delta1]);
        }
        if (delta2) {
          this.applyDeltasAndAddRevision([delta2]);
        }
      } else {
        this.applyDeltasAndAddRevision([delta]);
      }
    });

    socket.on("ack", (_) => {
      console.log("ack: ", this.revision);
      this.revision++;
    })
  }


  applyDeltasAndAddRevision = (deltas) => {
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
   * 他者が変更した差分を受け取り、最新の変更に対して競合しないように変換して返す。
   * @param {*} targetDelta 対象の差分
   * @returns delta 競合しないように変換された差分
   */
  transform(targetDelta) {
    const latestDelta = this.deltas.pop();

    // insert / insert
    if (latestDelta.action === "insert" && targetDelta.action === "insert") {
      // latest より後の行の場合、latest が追加する行の分開始位置の行をずらす
      if (latestDelta.start.row < targetDelta.start.row) {
        const rowDelta = latestDelta.lines.length - 1;
        targetDelta.start.row += rowDelta;
        targetDelta.end.row += rowDelta;
        return targetDelta;

      // latest と同じ行の場合、編集する列を比較する必要がある
      } else if (latestDelta.start.row === targetDelta.start.row) {
        // latest より後の列の場合
        // 行：latest が追加する行の分ずらす
        // 列：改行しない場合は追加する列の分、する場合はそこから改行前の文字数分左に移動する必要がある
        if (latestDelta.start.column < targetDelta.start.column) {
          const rowDelta = latestDelta.lines.length - 1;
          targetDelta.start.row += rowDelta;
          targetDelta.end.row += rowDelta;
          targetDelta.start.column += latestDelta.lines[0].length;
          targetDelta.end.column += latestDelta.lines[0].length;
          if (latestDelta.lines.length > 1) {
            const columnDelta = targetDelta.start.column - latestDelta.start.column;
            targetDelta.start.column -= columnDelta;
            targetDelta.end.column -= columnDelta;
          }

        // 編集する行が同じ / latest より前の列の場合、変換の必要はない
        } else {
          return targetDelta;
        }

      // latest より前の行の場合、変換の必要はない
      } else {
        return targetDelta;
      }
    }
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
