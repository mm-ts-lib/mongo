import { Mongo, DbSchema } from '../src/mongo';
import { Collection } from 'mongodb';
import collections from './collections';

/**
 * 需要四个参数
 * @param url - 'mongodb://localhost:27017'
 * @param options - {reconnectTries: 999999999}
 * @param modName - 'test'
 */
export const mongo = new Mongo(
  'mongodb://localhost:27017',
  { reconnectTries: 999999999 },
  'test',
  collections
);

const db = mongo.collections();

(async () => {
  // 等待数据库成功连接
  await mongo.connect();

  const result = await db.test.find({}).toArray();
  console.log('--result--!', result);

  await db.test.insertOne({
    name: 'abcdefg',
    uid: 888
  });
})();
