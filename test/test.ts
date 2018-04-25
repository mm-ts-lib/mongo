import { DbSchema } from '../src/mongo';

/**
 * 导出索引信息
 */
export default new DbSchema<{
  name: string;
  uid: number;
}>(
  {},
  {
    name: {
      fields: {
        name: 1
      },
      options: {
        unique: true,
        sparse: false,
        dropDups: true
      }
    }
  }
);
