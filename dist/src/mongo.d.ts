import { MongoClient, IndexOptions, MongoClientOptions, Collection, CollectionCreateOptions } from 'mongodb';
/**
 * 数据库索引类型
 */
export declare type INDEX_SCHEMA_T = {
    [Name: string]: {
        fields: {};
        options: IndexOptions;
    };
};
export interface IExtDb {
    db: string;
    col: string;
}
/**
 * 构造一个数据库定义方案
 */
export declare class DbSchema<TDoc> {
    documentSchema: TDoc;
    indexSchema: INDEX_SCHEMA_T;
    collOptions: CollectionCreateOptions;
    /**
     * 构造数据库方案
     * @param collOptions  集合定义选项
     * @param indexSchema 索引方案定义
     */
    constructor(collOptions: CollectionCreateOptions & {
        _extDb?: IExtDb;
    }, indexSchema: INDEX_SCHEMA_T);
}
/**
 * 数据库定义接口
 */
export interface IDbSchemas {
    [k: string]: {
        documentSchema: {};
        indexSchema: {};
        collOptions: {};
    };
}
/**
 * 导出本地数据库记录集
 */
export declare type IExportCollections<T extends IDbSchemas> = {
    [K in keyof T]: Collection<T[K]['documentSchema']>;
};
export declare class Mongo<T extends IDbSchemas> {
    private _url;
    private _options;
    private _modName;
    private _client;
    private _db;
    private _collections;
    private _dbCollectionsDefine;
    /**
     * 构造Mongodb数据库管理类
     * @param url  数据库连接字符串
     * @param options 连接选项
     * @param modName 组件名称，默认创建的数据库名称
     * @param dbCollectionsDefine 数据库方案定义
     */
    constructor(url: string, options: MongoClientOptions, modName: string, dbCollectionsDefine: T);
    getMongoClient(): MongoClient | null;
    /**
     * 获取当前定义的所有数据库记录集
     */
    collections(): IExportCollections<T>;
    /**
     * 连接到数据库,async 异步函数
     */
    connect(): Promise<void>;
    /**
     * 确认当前定义的所有数据库集合存在
     * 不存在的数据库将被创建
     * 本组件创建的数据库将自动创建索引，并删除未定义索引。
     * 如果索引定义为空，则不删除索引，防止引用外部数据库的索引冲突或者手动创建的索引冲突
     * 本组件内未被定义的数据库将被自动重新命名为_unused_xxx
     * 外部数据库的数据库和记录集名称在_extDb中定义
     */
    private _ensureSchemaCollections();
    private _ensureCollectionIndexes(coll, indexSchemas);
    private _monitorDbEvent();
}
