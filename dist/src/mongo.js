"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongodb_1 = require("mongodb");
const debug_1 = __importDefault(require("debug"));
const lodash_1 = __importDefault(require("lodash"));
const path_1 = __importDefault(require("path"));
class DbSchema {
    constructor(collOptions, indexSchema) {
        this.documentSchema = {};
        this.indexSchema = indexSchema;
        this.collOptions = collOptions;
    }
}
exports.DbSchema = DbSchema;
// import { DB_COLLECTIONS_SCHEMA_T } from './_schema';
const _d = debug_1.default('app:' + path_1.default.basename(__filename, '.js'));
// 如果数据库结构需要，则需要提供变更脚本来执行
class Mongo {
    constructor(url, options, modName, dbCollectionsDefine) {
        this._client = null;
        this._db = null;
        this._collections = {};
        this._dbCollectionsDefine = dbCollectionsDefine;
        this._url = url;
        this._options = options;
        this._modName = modName;
    }
    collections() {
        return this._collections;
    }
    async connect() {
        _d('connect to mongodb');
        this._client = await mongodb_1.MongoClient.connect(this._url, this._options);
        this._db = await this._client.db(this._modName);
        this._monitorDbEvent();
        await this._ensureSchemaCollections();
        //创建索引
        lodash_1.default.forEach(this._collections, async (coll, name) => {
            await this._ensureCollectionIndexes(coll, this._dbCollectionsDefine[name].indexSchema);
        });
        _d('open mongodb successed');
    }
    async _ensureSchemaCollections() {
        if (!this._db)
            return;
        // 获取当前存在的colls
        const curColls = lodash_1.default.keyBy(await this._db.collections(), 'collectionName');
        const modCollDefines = lodash_1.default.pickBy(this._dbCollectionsDefine, v => !lodash_1.default.has(v.collOptions, "_dbName"));
        const externCollDefines = lodash_1.default.pickBy(this._dbCollectionsDefine, v => lodash_1.default.has(v.collOptions, "_dbName"));
        // 不在定义中的colls将被重命名为_unused_xxx
        for (const colName of Object.keys(curColls)) {
            if (modCollDefines[colName]) {
                _d('open existed collection:', colName);
                // 有效的coll定义，打开collection
                this._collections[colName] = curColls[colName];
            }
            else {
                // 重命名和检测无效的collection
                if (!colName.startsWith('_')) {
                    const name = '_unused_' + colName;
                    await this._db.renameCollection(colName, name);
                    _d('rename unused collection:', name);
                }
                else {
                    _d('unused collection:', colName);
                }
            }
        }
        // 创建新的已定义模块colls
        for (const newColl of lodash_1.default.difference(Object.keys(modCollDefines), Object.keys(curColls))) {
            this._collections[newColl] = await this._db.createCollection(newColl, this._dbCollectionsDefine[newColl].collOptions);
            _d('create new collection:', newColl);
        }
        // 创建其他数据库中的colls
        lodash_1.default.forEach(externCollDefines, async (v, k) => {
            if (!v)
                return;
            const dbName = lodash_1.default.get(v, 'collOptions._dbName');
            if ((!this._client) || (!dbName))
                return;
            // // 打开和创建外部库
            // _d('----create extern db  collection:', dbName, k);
            const externDb = this._client.db(dbName);
            const extColls = lodash_1.default.keyBy(await externDb.collections(), 'collectionName');
            if (!extColls[k]) {
                // 创建collection
                this._collections[k] = await externDb.createCollection(k, lodash_1.default.omit(v.collOptions, '_dbName'));
            }
            else {
                this._collections[k] = extColls[k];
            }
            _d('create extern collection ok:', dbName, k);
        });
    }
    async _ensureCollectionIndexes(coll, indexSchemas) {
        const indexes = lodash_1.default.keyBy(await coll.indexes(), 'name');
        _d('ensure collection indexes:', coll.collectionName, Object.keys(indexSchemas));
        // 删除非缺省_id_的无效索引
        for (const key of Object.keys(indexes)) {
            if (key.startsWith('_id'))
                continue;
            if (!lodash_1.default.isPlainObject(indexSchemas[key])) {
                await coll.dropIndex(key);
                delete indexes[key];
                _d('drop invalid index:', coll.collectionName, key);
            }
        }
        // _d('ensure collection indexes OK:1', coll.collectionName, Object.keys(indexSchemas));
        // 创建新定义的index
        for (const key of Object.keys(indexSchemas)) {
            if (lodash_1.default.isEmpty(indexes[key])) {
                _d('create new index:', coll.collectionName, key, indexSchemas[key]);
                await coll.createIndex(indexSchemas[key].fields, {
                    name: key,
                    ...indexSchemas[key].options
                });
            }
        }
        // _d('ensure collection indexes OK:2', coll.collectionName, Object.keys(indexSchemas));
    }
    _monitorDbEvent() {
        if (!this._db)
            return;
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
exports.Mongo = Mongo;
// export default new Mongo();
//# sourceMappingURL=mongo.js.map