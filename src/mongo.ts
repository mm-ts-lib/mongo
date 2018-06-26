import {
  MongoClient,
  IndexOptions,
  MongoClientOptions,
  Db,
  Collection,
  CollectionCreateOptions,
} from 'mongodb';
import debug from 'debug';
import _ from 'lodash';
import path from 'path';
import process from 'process';

const _d = debug('app:' + path.basename(__filename, '.js'));

/**
 * 数据库索引类型
 */
export type INDEX_SCHEMA_T = {
  [Name: string]: {
    fields: {};
    options: IndexOptions;
  };
};

export interface IExtDb {
  db: string /* 自定义数据库名称*/;
  col: string /* 自定义数据库集合名称*/;
}
/**
 * 构造一个数据库定义方案
 */
export class DbSchema<TDoc> {
  documentSchema = {} as TDoc; // 数据库方案
  indexSchema: INDEX_SCHEMA_T; //索引方案
  collOptions: CollectionCreateOptions; //数据库选项
  /**
   * 构造数据库方案
   * @param collOptions  集合定义选项
   * @param indexSchema 索引方案定义
   */
  constructor(
    collOptions: CollectionCreateOptions & {
      _extDb?: IExtDb;
    },
    indexSchema: INDEX_SCHEMA_T,
  ) {
    this.indexSchema = indexSchema;
    this.collOptions = collOptions;
  }
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

  /**
   * 构造Mongodb数据库管理类
   * @param url  数据库连接字符串
   * @param options 连接选项
   * @param modName 组件名称，默认创建的数据库名称
   * @param dbCollectionsDefine 数据库方案定义
   */
  constructor(
    url: string,
    options: MongoClientOptions,
    modName: string,
    dbCollectionsDefine: T,
  ) {
    this._dbCollectionsDefine = dbCollectionsDefine;
    this._url = url;
    this._options = options;
    this._modName = modName;
  }
  public getMongoClient() {
    if (this._client === null) throw new Error('Mongodb client Invalid!!');
    return this._client;
  }
  /**
   * 获取当前定义的所有数据库记录集
   */
  public collections() {
    return this._collections;
  }
  /**
   * 连接到数据库,async 异步函数
   */
  public async connect() {
    _d('connect to mongodb');
    this._client = await MongoClient.connect(
      this._url,
      this._options,
    );
    this._db = await this._client.db(this._modName);
    this._monitorDbEvent();
    await this._ensureSchemaCollections();

    //创建索引
    _.forEach(this._collections, async (coll, name) => {
      await this._ensureCollectionIndexes(
        coll,
        this._dbCollectionsDefine[name].indexSchema,
      );
    });

    _d('open mongodb successed');
  }

  /**
   * 确认当前定义的所有数据库集合存在
   * 不存在的数据库将被创建
   * 本组件创建的数据库将自动创建索引，并删除未定义索引。
   * 如果索引定义为空，则不删除索引，防止引用外部数据库的索引冲突或者手动创建的索引冲突
   * 本组件内未被定义的数据库将被自动重新命名为_unused_xxx
   * 外部数据库的数据库和记录集名称在_extDb中定义
   */
  private async _ensureSchemaCollections() {
    if (!this._db) return;
    // 获取当前存在的colls
    const curColls = _.keyBy(await this._db.collections(), 'collectionName');

    const modCollDefines = _.pickBy(
      this._dbCollectionsDefine,
      v => !_.has(v.collOptions, '_extDb'),
    );
    const externCollDefines = _.pickBy(this._dbCollectionsDefine, v =>
      _.has(v.collOptions, '_extDb'),
    );

    // 不在定义中的colls将被重命名为_unused_xxx
    for (const colName of Object.keys(curColls)) {
      if (modCollDefines[colName]) {
        _d('open existed collection:', colName);
        // 有效的coll定义，打开collection
        this._collections[colName] = curColls[colName];
      } else {
        // 重命名和检测无效的collection
        if (!colName.startsWith('_') && !colName.startsWith('system.')) {
          const name = '_unused_' + colName;
          await this._db.renameCollection(colName, name);
          _d('rename unused collection:', name);
        } else {
          _d('unused collection:', colName);
        }
      }
    }
    // 创建新的已定义模块colls
    for (const newColl of _.difference(
      Object.keys(modCollDefines),
      Object.keys(curColls),
    )) {
      this._collections[newColl] = await this._db.createCollection(
        newColl,
        this._dbCollectionsDefine[newColl].collOptions,
      );
      _d('create new collection:', newColl);
    }

    // 创建其他数据库中的colls，不使用K作为外部数据库名称，使用_extDb的col名称
    for (const k of Object.keys(externCollDefines)) {
      const v = externCollDefines[k];
      if (!v) continue;

      const extDbInfo: IExtDb = _.get(v, 'collOptions._extDb');
      if (!this._client || !extDbInfo) return;
      // // 打开和创建外部库
      // _d('----create extern db  collection:', dbName, k);
      const externDb = this._client.db(extDbInfo.db);
      const extColls = _.keyBy(await externDb.collections(), 'collectionName');
      if (!extColls[extDbInfo.col]) {
        // 创建collection
        _d('create extern collection ok:', extDbInfo);
        this._collections[k] = await externDb.createCollection(
          extDbInfo.col,
          _.omit(v.collOptions, '_extDb'),
        );
      } else {
        _d('open extern collection ok:', extDbInfo);
        this._collections[k] = extColls[extDbInfo.col];
      }
    }
  }

  private async _ensureCollectionIndexes(
    coll: Collection,
    indexSchemas: INDEX_SCHEMA_T,
  ) {
    // 新增功能，如果配置索引为空，则不处理索引信息
    // 为了避免多个项目打开一个数据库的冲突问题
    if (_.isEmpty(indexSchemas)) {
      return;
    }

    const indexsArray = await coll.indexes();

    const indexes = _.keyBy(indexsArray, 'name');
    _d(
      'ensure collection indexes:',
      coll.collectionName,
      Object.keys(indexSchemas),
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
    // _d('ensure collection indexes OK:1', coll.collectionName, Object.keys(indexSchemas));

    // 创建新定义的index
    for (const key of Object.keys(indexSchemas)) {
      if (_.isEmpty(indexes[key])) {
        _d('create new index:', coll.collectionName, key, indexSchemas[key]);
        await coll.createIndex(indexSchemas[key].fields, {
          name: key,
          ...indexSchemas[key].options,
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
