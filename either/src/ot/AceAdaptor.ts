import { TextOperation } from "./TextOperation";

class AceAdapter {
  constructor(public editor: AceAjax.Editor) {
    editor.on("change", this.onChange);
  }

  private onChange = (delta: AceAjax.Delta) => {
    console.log("Delta: ", delta);

    // delta から Operation を生成

  }

  private getValue = (): string => {
    return this.editor.getValue();
  }

  private getStart = (delta: AceAjax.Delta): number => {
    return this.editor.session.doc.positionToIndex(delta.start);
  }

  /**
   * Delta から Operation を生成する。
   * @param delta
   * @returns Operation
   * @throws Error 存在しないアクションにエラーを投げる
   */
  public getOperationFromDelta = (delta: AceAjax.Delta): TextOperation => {
    const ops: TextOperation = new TextOperation();

    let start = this.getStart(delta);
    if (delta.action === "insert") {
      ops.retain(start);
      ops.insert(delta.lines.join("\n"));
      ops.retain(this.getValue().length - start);
    } else if (delta.action === "remove") {
      ops.retain(start);
      ops.delete(delta.lines.join("\n").length);
      ops.retain(this.getValue().length - start);
    } else {
      throw new Error("Unknown action: " + delta.action);
    }

    return ops;
  }

  /**
   * 操作をエディタに適用する。
   * @param operation
   * @returns void
   * @throws Error 操作の適用に失敗した場合
   */
  public applyOperation = (operation: TextOperation): void => {
    const value = this.getValue();
    const newValue = operation.apply(value);

    this.editor.setValue(newValue);
  }
}
