import { MongoClient, MongoClientOptions, Db, Collection, CollectionCreateOptions } from 'mongodb';
import debug from 'debug';
import _ from 'lodash';
import path from 'path';
import process from 'process';
// import { DbSchema } from './_schema';

export type INDEX_SCHEMA_T = {
  [Name: string]: {
    fields: {};
    options: {
      unique: boolean;
      sparse: boolean;
      dropDups: boolean;
    };
  };
};

export class DbSchema<TDoc> {
  documentSchema = {} as TDoc;
  indexSchema: INDEX_SCHEMA_T;
  collOptions: CollectionCreateOptions;
  constructor(
    collOptions: CollectionCreateOptions,
    indexSchema: INDEX_SCHEMA_T
  ) {
    this.indexSchema = indexSchema;
    this.collOptions = collOptions;
  }
}

// import { DB_COLLECTIONS_SCHEMA_T } from './_schema';

const _d = debug('app:' + path.basename(__filename, '.js'));

export interface IDbSchemas {
  [k: string]: {
    documentSchema: {};
    indexSchema: {};
    collOptions: {};
  };
}

export type IExportCollections<T extends IDbSchemas> = {
  [K in keyof T]: Collection<T[K]['documentSchema']>
};

// 如果数据库结构需要，则需要提供变更脚本来执行

export class Mongo<T extends IDbSchemas> {
  private _url: string;
  private _options: MongoClientOptions;
  private _modName: string;
  private _client: MongoClient | null = null;
  private _db: Db | null = null;
  private _collections = {} as IExportCollections<T>;
  private _dbCollectionsDefine: T;
  constructor(
    url: string,
    options: MongoClientOptions,
    modName: string,
    dbCollectionsDefine: T
  ) {
    this._dbCollectionsDefine = dbCollectionsDefine;
    this._url = url;
    this._options = options;
    this._modName = modName;
  }
  public collections() {
    return this._collections;
  }
  public async connect() {
    _d('connect to mongodb');
    this._client = await MongoClient.connect(this._url, this._options);
    this._db = await this._client.db(this._modName);
    this._monitorDbEvent();
    await this._ensureSchemaCollections();

    //创建索引
    _.forEach(this._collections, (coll, name) => {
      this._ensureCollectionIndexes(
        coll,
        this._dbCollectionsDefine[name].indexSchema
      );
    });

    _d('open mongodb successed');
  }

  private async _ensureSchemaCollections() {
    if (!this._db) return;
    // 获取当前存在的colls
    const curColls = _.keyBy(await this._db.collections(), 'collectionName');
    // 不在定义中的colls将被重命名为_unused_xxx
    for (const colName of Object.keys(curColls)) {
      if (this._dbCollectionsDefine[colName]) {
        _d('open existed collection:', colName);
        // 有效的coll定义，打开collection
        this._collections[colName] = curColls[colName];
      } else {
        // 重命名和检测无效的collection
        if (!colName.startsWith('_')) {
          const name = '_unused_' + colName;
          await this._db.renameCollection(colName, name);
          _d('rename unused collection:', name);
        } else {
          _d('unused collection:', colName);
        }
      }
    }
    // 创建新的已定义colls
    for (const newColl of _.difference(
      Object.keys(this._dbCollectionsDefine),
      Object.keys(curColls)
    )) {
      this._collections[newColl] = await this._db.createCollection(
        newColl,
        this._dbCollectionsDefine[newColl].collOptions
      );
      _d('create new collection:', newColl);
    }
  }

  private async _ensureCollectionIndexes(coll: Collection, indexSchemas: INDEX_SCHEMA_T) {
    const indexes = _.keyBy(await coll.indexes(), 'name');
    _d(
      'ensure collection indexes:',
      coll.collectionName,
      Object.keys(indexSchemas)
    );
    // 删除非缺省_id_的无效索引
    for (const key of Object.keys(indexes)) {
      if (key.startsWith('_id')) continue;
      if (!_.isPlainObject(indexSchemas[key])) {
        await coll.dropIndex(key);
        delete indexes[key];
        _d('drop invalid index:', coll.collectionName, key);
      }
    }
    // 创建新定义的index
    for (const key of Object.keys(indexSchemas)) {
      if (_.isEmpty(indexes[key])) {
        _d('create new index:', coll.collectionName, key, indexSchemas[key]);
        await coll.createIndex(indexSchemas[key].fields, {
          name: key,
          ...indexSchemas[key].options
        });
      }
    }
  }

  private _monitorDbEvent() {
    if (!this._db) return;
    // 监听事件
    this._db.on('close', () => {
      _d('mongodb close:');
    });
    this._db.on('error', err => {
      _d('mongodb error:', err);
    });
    this._db.on('timeout', () => {
      _d('mongodb timeout:');
    });
    this._db.on('reconnect', () => {
      _d('mongodb reconnect:');
    });
  }
}

// export default new Mongo();
