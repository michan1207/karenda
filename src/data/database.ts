import type { SQLiteBindValue } from 'expo-sqlite';

/**
 * expo-sqlite の SQLiteDatabase のうち、このアプリが使う部分だけ。
 * テストでは Node 内蔵の SQLite で同じ形を用意して差し替える。
 */
export type Database = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SQLiteBindValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

/**
 * まとめて書く処理（トランザクション）を、前が終わってから1つずつ行う。
 * expo-sqlite の withTransactionAsync は割り込まれるので、重なると後の BEGIN が失敗し、
 * その ROLLBACK が先の書きかけを消して、残りが1文ずつ確定してしまう。
 * トランザクションの中でもう一度呼ぶと待ち続けるので、入れ子にしない。
 * shortcut: トランザクションの外の1文だけの書き込みは並ばず、走っているトランザクションに混ざる（失敗して巻き戻る時だけ一緒に消える）。外の書き込みが増えたら withExclusiveTransactionAsync に替える
 */
export function oneTransactionAtATime(db: Database): Database {
  let queue: Promise<void> = Promise.resolve();
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, ...params) => db.runAsync(source, ...params),
    getAllAsync<T>(source: string, ...params: SQLiteBindValue[]) {
      return db.getAllAsync<T>(source, ...params);
    },
    getFirstAsync<T>(source: string, ...params: SQLiteBindValue[]) {
      return db.getFirstAsync<T>(source, ...params);
    },
    withTransactionAsync(task) {
      const run = queue.then(() => db.withTransactionAsync(task));
      queue = run.catch(() => {});
      return run;
    },
  };
}
