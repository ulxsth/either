type Operation = string | number;

export class TextOperation {
  /**
   * 一連のテキスト操作を表す操作の配列。
   * この配列は、挿入、削除、または保持のいずれかの操作を表す。
   * 移動：カーソルを進める。正の整数。
   * 挿入：文字列を挿入する。文字列。
   * 削除：文字列を削除する。負の整数。
  */
  private ops: Operation[];

  /**
   * 操作を適用する範囲の文字列の大きさ
  */
  private baseLength: number;

  /**
   * 操作を適用した後の文字列の大きさ
  */
  private targetLength: number;

  constructor() {
    this.ops = []
    this.baseLength = 0;
    this.targetLength = 0;
  }

  public getOps = (): Operation[] => {
    return this.ops;
  }

  public static isRetain = (op: Operation): op is number => {
    return typeof op === "number" && op > 0;
  }

  public static isInsert = (op: Operation): op is string => {
    return typeof op === "string";
  }

  public static isDelete = (op: Operation): op is number => {
    return typeof op === "number" && op < 0;
  }

  /**
   * TextOperation インスタンスに移動操作を追加する。
   * @param n 進める文字数
   * @returns 操作を追加した後の TextOperation インスタンス
   */
  public retain = (n: number): TextOperation => {
    if (n === 0) return this;
    this.baseLength += n;
    this.targetLength += n;

    // 直前の操作が retain であれば、それと結合する
    const previouseOp = this.ops[this.ops.length - 1];
    if (TextOperation.isRetain(previouseOp)) {
      this.ops[this.ops.length - 1] = previouseOp + n;
    } else {
      this.ops.push(n);
    }

    return this;
  }

  /**
   * TextOperation インスタンスに挿入操作を追加する。
   * @param str 挿入する文字列
   * @returns 操作を追加した後の TextOperation インスタンス
   */
  public insert = (str: string): TextOperation => {
    if (str === "") return this;
    this.targetLength += str.length;

    // 直前の操作が insert であれば、それと結合する
    const previouseOp = this.ops[this.ops.length - 1];
    if (TextOperation.isInsert(previouseOp)) {
      this.ops[this.ops.length - 1] = previouseOp + str;
    } else {
      this.ops.push(str);
    }

    return this;
  }

  /**
   * TextOperation インスタンスに削除操作を追加する。
   * @param n 削除する文字数
   * @returns 操作を追加した後の TextOperation インスタンス
   */
  public delete = (n: number): TextOperation => {
    if (n === 0) return this;
    this.baseLength += n;

    // 直前の操作が delete であれば、それと結合する
    const previouseOp = this.ops[this.ops.length - 1];
    if (TextOperation.isDelete(previouseOp)) {
      this.ops[this.ops.length - 1] = previouseOp + n;
    } else {
      this.ops.push(-n);
    }

    return this;
  }

  /**
   * 一連の操作を行った前後で、文字列にまったく変化がないかを判定する。
   * @returns boolean
   */
  public isNoop = (): boolean => {
    return this.ops.length === 0 || (this.ops.length === 1 && TextOperation.isRetain(this.ops[0]));
  }

  /**
   * 操作を適用する。
   * @param str 操作を適用する文字列
   * @returns 操作を適用した後の文字列
   * @throws 与えられた文字列と、操作の基準となる文字列の長さが異なる場合
   */
  public apply = (str: string): string => {
    if (this.baseLength !== str.length) {
      throw new Error("The operation's base length must be equal to the string's length.");
    }

    const newStrArr: string[] = [];
    let strIndex = 0;
    for (const op of this.ops) {
      if (TextOperation.isRetain(op)) {
        if (strIndex + op > str.length) {
          throw new Error("Operation can't be applied: string is too short.");
        }
        newStrArr.push(str.slice(strIndex, strIndex + op));
        strIndex += op;
      } else if (TextOperation.isInsert(op)) {
        newStrArr.push(op);
      } else {
        strIndex -= op;
      }
    }

    if (strIndex !== str.length) {
      throw new Error("The operation didn't operate on the whole string.");
    }

    return newStrArr.join('');
  }

  /**
   * 同時に発生した2つの操作 A, B を受けとり、
   * apply(apply(S, A), B') = apply(apply(S, B), A')
   * となるような操作 A', B' を返す。
   * @param operation1 操作 A
   * @param operation2 操作 B
   * @returns [A', B']
   */
  public static transform = (operation1: TextOperation, operation2: TextOperation): [TextOperation, TextOperation] => {
    if(operation1.baseLength !== operation2.baseLength) {
      throw new Error("Both operations have to have the same base length.");
    }

    const operation1prime = new TextOperation();
    const operation2prime = new TextOperation();
    let ops1 = operation1.getOps(), ops2 = operation2.getOps();
    let i1 = 0, i2 = 0;
    let op1 = ops1[i1++], op2 = ops2[i2++];

    while (true) {
      if(typeof op1 === "undefined" && typeof op2 === "undefined") {
        break;
      }

      // 挿入を含む場合
      if (this.isInsert(op1)) {
        operation1prime.insert(op1);
        operation2prime.retain(op1.length);
        op1 = ops1[i1++];
        continue;
      }
      if (this.isInsert(op2)) {
        operation1prime.retain(op2.length);
        operation2prime.insert(op2);
        op2 = ops2[i2++];
        continue;
      }

      if (typeof op1 === 'undefined') {
        throw new Error("Cannot compose operations: first operation is too short.");
      }
      if (typeof op2 === 'undefined') {
        throw new Error("Cannot compose operations: first operation is too long.");
      }

      var minl;
      if (this.isRetain(op1) && this.isRetain(op2)) {
        // 移動/移動
        if (op1 > op2) {
          minl = op2;
          op1 = op1 - op2;
          op2 = ops2[i2++];
        } else if (op1 === op2) {
          minl = op2;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minl = op1;
          op2 = op2 - op1;
          op1 = ops1[i1++];
        }
        operation1prime.retain(minl);
        operation2prime.retain(minl);
      } else if (this.isDelete(op1) && this.isDelete(op2)) {
        // 削除/削除
        if (-op1 > -op2) {
          op1 = op1 - op2;
          op2 = ops2[i2++];
        } else if (op1 === op2) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op2 = op2 - op1;
          op1 = ops1[i1++];
        }

      // 削除/移動
      } else if (this.isDelete(op1) && this.isRetain(op2)) {
        if (-op1 > op2) {
          minl = op2;
          op1 = op1 + op2;
          op2 = ops2[i2++];
        } else if (-op1 === op2) {
          minl = op2;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minl = -op1;
          op2 = op2 + op1;
          op1 = ops1[i1++];
        }
        operation1prime['delete'](minl);
      } else if (this.isRetain(op1) && this.isDelete(op2)) {
        if (op1 > -op2) {
          minl = -op2;
          op1 = op1 + op2;
          op2 = ops2[i2++];
        } else if (op1 === -op2) {
          minl = op1;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minl = op1;
          op2 = op2 + op1;
          op1 = ops1[i1++];
        }
        operation2prime['delete'](minl);
      } else {
        throw new Error("The two operations aren't compatible");
      }
    }

    return [operation1prime, operation2prime];
  }
}
