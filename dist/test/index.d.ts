import { Mongo, DbSchema } from '../src/mongo';
/**
 * 需要四个参数
 * @param url - 'mongodb://localhost:27017'
 * @param options - {reconnectTries: 999999999}
 * @param modName - 'test'
 */
export declare const mongo: Mongo<{
    test: DbSchema<{
        name: string;
        uid: number;
    }>;
}>;
