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
        const newDelta = this.transform(delta);
        this.applyDeltasAndAddRevision([newDelta]);
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
   * 差分を受け取り、最新の変更に対して競合しないように変換して返す。
   * @param {*} d2 対象の差分
   * @returns delta 競合しないように変換された差分
   */
  transform(d2) {
    const d1 = this.deltas.pop();

    // insert / insert
    if (d1.action === "insert" && d2.action === "insert") {
      // d1 より後の行の場合、d1 が追加する行の分開始位置の行をずらす
      if (d1.start.row < d2.start.row) {
        const rowDelta = d1.lines.length - 1;
        d2.start.row += rowDelta;
        d2.end.row += rowDelta;
        return d2;

        // d1 と同じ行の場合、編集する列を比較する必要がある
      } else if (d1.start.row === d2.start.row) {
        // d1 より後の列の場合
        // 行：d1 が追加する行の分ずらす
        // 列：改行しない場合は追加する列の分、する場合はそこから改行前の文字数分左に移動する必要がある
        if (d1.start.column < d2.start.column) {
          const rowDelta = d1.lines.length - 1;
          d2.start.row += rowDelta;
          d2.end.row += rowDelta;
          d2.start.column += d1.lines[0].length;
          d2.end.column += d1.lines[0].length;
          if (d1.lines.length > 1) {
            const columnDelta = d2.start.column - d1.start.column;
            d2.start.column -= columnDelta;
            d2.end.column -= columnDelta;
          }

          // 編集する列が同じ / d1 より前の列の場合、変換の必要はない
        } else {
          return d2;
        }

        // d1 より前の行の場合、変換の必要はない
      } else {
        return d2;
      }
    }

    // insert / remove
    if (d1.action === "insert" && d2.action === "remove") {
      // d2 の範囲が d1 を含む場合
      if (this.isDeltaIncludePosition(d2, d1.start)) {
        // TODO:
        throw new Error("未解決：複数の Delta が必要なパターン");

        // d2 の範囲が d1 を含まない場合
      } else {
        // d1 の開始位置が d2 の開始位置より前 / 同じ場合、d2 の位置を d1 の挿入文字分ずらす
        if (d1.start.row < d2.start.row || d1.start.row === d2.start.row && d1.start.column < d2.start.column) {
          const rowDelta = d1.lines.length - 1;
          d2.start.row += rowDelta;
          d2.end.row += rowDelta;

          // d1 の終了位置が d2 の開始位置と同じ行にある場合、d2 の開始位置を 挿入行分ずらす
          if (d1.end.row === d2.start.row) {
            d2.start.column += d1.lines[d1.lines.length - 1].length;
            d2.end.column += d1.lines[d1.lines.length - 1].length;
          }

          return d2;

          // d1 の開始位置が d2 の終了位置と同じ / 後の場合、変換の必要はない
        } else {
          return d2;
        }
      }
    }

    // remove / insert
    if (d1.action === "remove" && d2.action === "insert") {
      // d1 の範囲が d2 を含む場合、d2 の開始位置を d1 の開始位置に合わせる
      if (this.isDeltaIncludePosition(d2, d1.start)) {
        const d = this.calcMoveDelta(d2.start, d1.start);
        d2.start = d1.start;
        d2.end = this.calcMovedPosition(d2.end, d);
        return d2;

        // d2 の範囲が d1 を含まない場合
      } else {
        // d2 より後 / 同じ行に d1 の開始位置がある場合、d2 の位置を d1 の削除行分ずらす
        if (d1.start.row > d2.end.row || d1.start.row === d2.end.row && d1.start.column > d2.end.column) {
          const rowDelta = d1.lines.length - 1;
          d2.start.row -= rowDelta;
          d2.end.row -= rowDelta;

          // d1 の終了位置が d2 の開始位置と同じ行にある場合は、最終行の挿入文字数分列をずらす
          if (d1.end.row === d2.start.row) {
            d2.start.column += d1.lines[d1.lines.length - 1].length;
            d2.end.column += d1.lines[d1.lines.length - 1].length;
          }

          return d2;

          // d2 より前に d1 の開始位置がある場合、変換の必要はない
        } else {
          return d2;
        }
      }
    }

    if (d1.action === "remove" && d2.action === "remove") {
      // d1 と d2 がまったく同一か、 d1 が d2 を包括する場合、何もしないd2を返す
      if (JSON.stringify(d1) === JSON.stringify(d2) || this.isDeltaIncludeDelta(d1, d2)) {
        d2.action = "insert";
        d2.end = d2.start;
        d2.lines = [""];
        return d2;
      }

      // d1 と d2 が重複している（ただし、最低でもどちらかが独立する集合を持つ）場合
      if (this.hasDuplicate(d1, d2)) {
        // d1 の開始位置が d2 の開始位置より前にある場合、d2 の開始位置を d1 の終了位置へずらす
        if (d1.start.row > d2.start.row || d1.start.row === d2.start.row && d1.start.column > d2.start.column) {
          d2.start = d1.end;
          return d2;

          // d1 の終了位置が d2 の終了位置より後にある場合、d2 の終了位置を d1 の開始位置へずらす
        } else if (d1.end.row < d2.end.row || d1.end.row === d2.end.row && d1.end.column < d2.end.column) {
          d2.end = d1.start;
          return d2;
        }


        // d1 と d2 が重複していない場合
      } else {
        // d1 が d2 より前の場合、d1 の削除行分上にずらす
        if (d1.end.row < d2.start.row || d1.end.row === d2.start.row && d1.end.column <= d2.start.column) {
          const rowDelta = d1.lines.length - 1;
          d2.start.row -= rowDelta;
          d2.end.row -= rowDelta;

          // d1 の終了位置が d2 の開始位置と同じ行にある場合、
          // d2 の開始位置を d1 の削除文字分左へ移動させ、d1 の開始位置の残存文字分右へ移動させる
          if (d1.end.row === d2.start.row) {
            d2.start.column -= d1.lines[d1.lines.length - 1].length;
            d2.start.column += d1.start.column;
          }

          // d1 が d2 より後の場合、変換の必要はない
        } else {
          return d2;
        }
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
      delta1.start.row < delta2.end.row &&
      delta1.start.column < delta2.end.column &&
      delta1.end.row > delta2.start.row &&
      delta1.end.column > delta2.start.column ||
      delta2.start.row < delta1.end.row &&
      delta2.start.column < delta1.end.column &&
      delta2.end.row > delta1.start.row &&
      delta2.end.column > delta1.start.column
    );
  }

  /**
   * 範囲が位置を包含しているかを判定する。
   * @param {*} delta 範囲を表すdelta
   * @param {*} pos 位置
   */
  isDeltaIncludePosition(delta, pos) {
    return (
      delta.start.row < pos.row &&
      delta.start.column < pos.column &&
      delta.end.row > pos.row &&
      delta.end.column > pos.column
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
      delta1.start.row < delta2.start.row &&
      delta1.start.column < delta2.start.column &&
      delta1.end.row > delta2.end.row &&
      delta1.end.column > delta2.end.column
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
