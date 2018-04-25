import { IndexOptions, MongoClientOptions, Collection, CollectionCreateOptions } from 'mongodb';
export declare type INDEX_SCHEMA_T = {
    [Name: string]: {
        fields: {};
        options: IndexOptions;
    };
};
export declare class DbSchema<TDoc> {
    documentSchema: TDoc;
    indexSchema: INDEX_SCHEMA_T;
    collOptions: CollectionCreateOptions;
    constructor(collOptions: CollectionCreateOptions & {
        _dbName?: string;
    }, indexSchema: INDEX_SCHEMA_T);
}
export interface IDbSchemas {
    [k: string]: {
        documentSchema: {};
        indexSchema: {};
        collOptions: {};
    };
}
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
    constructor(url: string, options: MongoClientOptions, modName: string, dbCollectionsDefine: T);
    collections(): IExportCollections<T>;
    connect(): Promise<void>;
    private _ensureSchemaCollections();
    private _ensureCollectionIndexes(coll, indexSchemas);
    private _monitorDbEvent();
}
