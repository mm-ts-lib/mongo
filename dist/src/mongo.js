"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongodb_1 = require("mongodb");
const debug_1 = __importDefault(require("debug"));
const lodash_1 = __importDefault(require("lodash"));
const path_1 = __importDefault(require("path"));
const _d = debug_1.default('app:' + path_1.default.basename(__filename, '.js'));
/**
 * 构造一个数据库定义方案
 */
class DbSchema {
    /**
     * 构造数据库方案
     * @param collOptions  集合定义选项
     * @param indexSchema 索引方案定义
     */
    constructor(collOptions, indexSchema) {
        this.documentSchema = {}; // 数据库方案
        this.indexSchema = indexSchema;
        this.collOptions = collOptions;
    }
}
exports.DbSchema = DbSchema;
// 如果数据库结构需要，则需要提供变更脚本来执行
class Mongo {
    /**
     * 构造Mongodb数据库管理类
     * @param url  数据库连接字符串
     * @param options 连接选项
     * @param modName 组件名称，默认创建的数据库名称
     * @param dbCollectionsDefine 数据库方案定义
     */
    constructor(url, options, modName, dbCollectionsDefine) {
        this._client = null;
        this._db = null;
        this._collections = {};
        this._dbCollectionsDefine = dbCollectionsDefine;
        this._url = url;
        this._options = options;
        this._modName = modName;
    }
    getMongoClient() {
        if (this._client === null)
            throw new Error('Mongodb client Invalid!!');
        return this._client;
    }
    /**
     * 获取当前定义的所有数据库记录集
     */
    collections() {
        return this._collections;
    }
    /**
     * 连接到数据库,async 异步函数
     */
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
    /**
     * 确认当前定义的所有数据库集合存在
     * 不存在的数据库将被创建
     * 本组件创建的数据库将自动创建索引，并删除未定义索引。
     * 如果索引定义为空，则不删除索引，防止引用外部数据库的索引冲突或者手动创建的索引冲突
     * 本组件内未被定义的数据库将被自动重新命名为_unused_xxx
     * 外部数据库的数据库和记录集名称在_extDb中定义
     */
    async _ensureSchemaCollections() {
        if (!this._db)
            return;
        // 获取当前存在的colls
        const curColls = lodash_1.default.keyBy(await this._db.collections(), 'collectionName');
        const modCollDefines = lodash_1.default.pickBy(this._dbCollectionsDefine, v => !lodash_1.default.has(v.collOptions, '_extDb'));
        const externCollDefines = lodash_1.default.pickBy(this._dbCollectionsDefine, v => lodash_1.default.has(v.collOptions, '_extDb'));
        // 不在定义中的colls将被重命名为_unused_xxx
        for (const colName of Object.keys(curColls)) {
            if (modCollDefines[colName]) {
                _d('open existed collection:', colName);
                // 有效的coll定义，打开collection
                this._collections[colName] = curColls[colName];
            }
            else {
                // 重命名和检测无效的collection
                if (!colName.startsWith('_') && !colName.startsWith('system.')) {
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
        // 创建其他数据库中的colls，不使用K作为外部数据库名称，使用_extDb的col名称
        for (const k of Object.keys(externCollDefines)) {
            const v = externCollDefines[k];
            if (!v)
                continue;
            const extDbInfo = lodash_1.default.get(v, 'collOptions._extDb');
            if (!this._client || !extDbInfo)
                return;
            // // 打开和创建外部库
            // _d('----create extern db  collection:', dbName, k);
            const externDb = this._client.db(extDbInfo.db);
            const extColls = lodash_1.default.keyBy(await externDb.collections(), 'collectionName');
            if (!extColls[extDbInfo.col]) {
                // 创建collection
                _d('create extern collection ok:', extDbInfo);
                this._collections[k] = await externDb.createCollection(extDbInfo.col, lodash_1.default.omit(v.collOptions, '_extDb'));
            }
            else {
                _d('open extern collection ok:', extDbInfo);
                this._collections[k] = extColls[extDbInfo.col];
            }
        }
    }
    async _ensureCollectionIndexes(coll, indexSchemas) {
        // 新增功能，如果配置索引为空，则不处理索引信息
        // 为了避免多个项目打开一个数据库的冲突问题
        if (lodash_1.default.isEmpty(indexSchemas)) {
            return;
        }
        const indexsArray = await coll.indexes();
        const indexes = lodash_1.default.keyBy(indexsArray, 'name');
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
                    ...indexSchemas[key].options,
                });
            }
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxxQ0FPaUI7QUFDakIsa0RBQTBCO0FBQzFCLG9EQUF1QjtBQUN2QixnREFBd0I7QUFHeEIsTUFBTSxFQUFFLEdBQUcsZUFBSyxDQUFDLE1BQU0sR0FBRyxjQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBZ0I1RDs7R0FFRztBQUNIO0lBSUU7Ozs7T0FJRztJQUNILFlBQ0UsV0FFQyxFQUNELFdBQTJCO1FBWjdCLG1CQUFjLEdBQUcsRUFBVSxDQUFDLENBQUMsUUFBUTtRQWNuQyxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUMvQixJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztJQUNqQyxDQUFDO0NBQ0Y7QUFsQkQsNEJBa0JDO0FBb0JELHlCQUF5QjtBQUV6QjtJQVNFOzs7Ozs7T0FNRztJQUNILFlBQ0UsR0FBVyxFQUNYLE9BQTJCLEVBQzNCLE9BQWUsRUFDZixtQkFBc0I7UUFoQmhCLFlBQU8sR0FBdUIsSUFBSSxDQUFDO1FBQ25DLFFBQUcsR0FBYyxJQUFJLENBQUM7UUFDdEIsaUJBQVksR0FBRyxFQUEyQixDQUFDO1FBZ0JqRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsbUJBQW1CLENBQUM7UUFDaEQsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7UUFDaEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFDeEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7SUFDMUIsQ0FBQztJQUNNLGNBQWM7UUFDbkIsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLElBQUk7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDdkUsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3RCLENBQUM7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QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFsTUQsc0JBa01DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgTW9uZ29DbGllbnQsXG4gIEluZGV4T3B0aW9ucyxcbiAgTW9uZ29DbGllbnRPcHRpb25zLFxuICBEYixcbiAgQ29sbGVjdGlvbixcbiAgQ29sbGVjdGlvbkNyZWF0ZU9wdGlvbnMsXG59IGZyb20gJ21vbmdvZGInO1xuaW1wb3J0IGRlYnVnIGZyb20gJ2RlYnVnJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBwcm9jZXNzIGZyb20gJ3Byb2Nlc3MnO1xuXG5jb25zdCBfZCA9IGRlYnVnKCdhcHA6JyArIHBhdGguYmFzZW5hbWUoX19maWxlbmFtZSwgJy5qcycpKTtcblxuLyoqXG4gKiDmlbDmja7lupPntKLlvJXnsbvlnotcbiAqL1xuZXhwb3J0IHR5cGUgSU5ERVhfU0NIRU1BX1QgPSB7XG4gIFtOYW1lOiBzdHJpbmddOiB7XG4gICAgZmllbGRzOiB7fTtcbiAgICBvcHRpb25zOiBJbmRleE9wdGlvbnM7XG4gIH07XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHREYiB7XG4gIGRiOiBzdHJpbmcgLyog6Ieq5a6a5LmJ5pWw5o2u5bqT5ZCN56ewKi87XG4gIGNvbDogc3RyaW5nIC8qIOiHquWumuS5ieaVsOaNruW6k+mbhuWQiOWQjeensCovO1xufVxuLyoqXG4gKiDmnoTpgKDkuIDkuKrmlbDmja7lupPlrprkuYnmlrnmoYhcbiAqL1xuZXhwb3J0IGNsYXNzIERiU2NoZW1hPFREb2M+IHtcbiAgZG9jdW1lbnRTY2hlbWEgPSB7fSBhcyBURG9jOyAvLyDmlbDmja7lupPmlrnmoYhcbiAgaW5kZXhTY2hlbWE6IElOREVYX1NDSEVNQV9UOyAvL+e0ouW8leaWueahiFxuICBjb2xsT3B0aW9uczogQ29sbGVjdGlvbkNyZWF0ZU9wdGlvbnM7IC8v5pWw5o2u5bqT6YCJ6aG5XG4gIC8qKlxuICAgKiDmnoTpgKDmlbDmja7lupPmlrnmoYhcbiAgICogQHBhcmFtIGNvbGxPcHRpb25zICDpm4blkIjlrprkuYnpgInpoblcbiAgICogQHBhcmFtIGluZGV4U2NoZW1hIOe0ouW8leaWueahiOWumuS5iVxuICAgKi9cbiAgY29uc3RydWN0b3IoXG4gICAgY29sbE9wdGlvbnM6IENvbGxlY3Rpb25DcmVhdGVPcHRpb25zICYge1xuICAgICAgX2V4dERiPzogSUV4dERiO1xuICAgIH0sXG4gICAgaW5kZXhTY2hlbWE6IElOREVYX1NDSEVNQV9ULFxuICApIHtcbiAgICB0aGlzLmluZGV4U2NoZW1hID0gaW5kZXhTY2hlbWE7XG4gICAgdGhpcy5jb2xsT3B0aW9ucyA9IGNvbGxPcHRpb25zO1xuICB9XG59XG5cbi8qKlxuICog5pWw5o2u5bqT5a6a5LmJ5o6l5Y+jXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSURiU2NoZW1hcyB7XG4gIFtrOiBzdHJpbmddOiB7XG4gICAgZG9jdW1lbnRTY2hlbWE6IHt9O1xuICAgIGluZGV4U2NoZW1hOiB7fTtcbiAgICBjb2xsT3B0aW9uczoge307XG4gIH07XG59XG5cbi8qKlxuICog5a+85Ye65pys5Zyw5pWw5o2u5bqT6K6w5b2V6ZuGXG4gKi9cbmV4cG9ydCB0eXBlIElFeHBvcnRDb2xsZWN0aW9uczxUIGV4dGVuZHMgSURiU2NoZW1hcz4gPSB7XG4gIFtLIGluIGtleW9mIFRdOiBDb2xsZWN0aW9uPFRbS11bJ2RvY3VtZW50U2NoZW1hJ10+XG59O1xuXG4vLyDlpoLmnpzmlbDmja7lupPnu5PmnoTpnIDopoHvvIzliJnpnIDopoHmj5Dkvpvlj5jmm7TohJrmnKzmnaXmiafooYxcblxuZXhwb3J0IGNsYXNzIE1vbmdvPFQgZXh0ZW5kcyBJRGJTY2hlbWFzPiB7XG4gIHByaXZhdGUgX3VybDogc3RyaW5nO1xuICBwcml2YXRlIF9vcHRpb25zOiBNb25nb0NsaWVudE9wdGlvbnM7XG4gIHByaXZhdGUgX21vZE5hbWU6IHN0cmluZztcbiAgcHJpdmF0ZSBfY2xpZW50OiBNb25nb0NsaWVudCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIF9kYjogRGIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBfY29sbGVjdGlvbnMgPSB7fSBhcyBJRXhwb3J0Q29sbGVjdGlvbnM8VD47XG4gIHByaXZhdGUgX2RiQ29sbGVjdGlvbnNEZWZpbmU6IFQ7XG5cbiAgLyoqXG4gICAqIOaehOmAoE1vbmdvZGLmlbDmja7lupPnrqHnkIbnsbtcbiAgICogQHBhcmFtIHVybCAg5pWw5o2u5bqT6L+e5o6l5a2X56ym5LiyXG4gICAqIEBwYXJhbSBvcHRpb25zIOi/nuaOpemAiemhuVxuICAgKiBAcGFyYW0gbW9kTmFtZSDnu4Tku7blkI3np7DvvIzpu5jorqTliJvlu7rnmoTmlbDmja7lupPlkI3np7BcbiAgICogQHBhcmFtIGRiQ29sbGVjdGlvbnNEZWZpbmUg5pWw5o2u5bqT5pa55qGI5a6a5LmJXG4gICAqL1xuICBjb25zdHJ1Y3RvcihcbiAgICB1cmw6IHN0cmluZyxcbiAgICBvcHRpb25zOiBNb25nb0NsaWVudE9wdGlvbnMsXG4gICAgbW9kTmFtZTogc3RyaW5nLFxuICAgIGRiQ29sbGVjdGlvbnNEZWZpbmU6IFQsXG4gICkge1xuICAgIHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmUgPSBkYkNvbGxlY3Rpb25zRGVmaW5lO1xuICAgIHRoaXMuX3VybCA9IHVybDtcbiAgICB0aGlzLl9vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLl9tb2ROYW1lID0gbW9kTmFtZTtcbiAgfVxuICBwdWJsaWMgZ2V0TW9uZ29DbGllbnQoKSB7XG4gICAgaWYgKHRoaXMuX2NsaWVudCA9PT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKCdNb25nb2RiIGNsaWVudCBJbnZhbGlkISEnKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50O1xuICB9XG4gIC8qKlxuICAgKiDojrflj5blvZPliY3lrprkuYnnmoTmiYDmnInmlbDmja7lupPorrDlvZXpm4ZcbiAgICovXG4gIHB1YmxpYyBjb2xsZWN0aW9ucygpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbnM7XG4gIH1cbiAgLyoqXG4gICAqIOi/nuaOpeWIsOaVsOaNruW6kyxhc3luYyDlvILmraXlh73mlbBcbiAgICovXG4gIHB1YmxpYyBhc3luYyBjb25uZWN0KCkge1xuICAgIF9kKCdjb25uZWN0IHRvIG1vbmdvZGInKTtcbiAgICB0aGlzLl9jbGllbnQgPSBhd2FpdCBNb25nb0NsaWVudC5jb25uZWN0KFxuICAgICAgdGhpcy5fdXJsLFxuICAgICAgdGhpcy5fb3B0aW9ucyxcbiAgICApO1xuICAgIHRoaXMuX2RiID0gYXdhaXQgdGhpcy5fY2xpZW50LmRiKHRoaXMuX21vZE5hbWUpO1xuICAgIHRoaXMuX21vbml0b3JEYkV2ZW50KCk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbnMoKTtcblxuICAgIC8v5Yib5bu657Si5byVXG4gICAgXy5mb3JFYWNoKHRoaXMuX2NvbGxlY3Rpb25zLCBhc3luYyAoY29sbCwgbmFtZSkgPT4ge1xuICAgICAgYXdhaXQgdGhpcy5fZW5zdXJlQ29sbGVjdGlvbkluZGV4ZXMoXG4gICAgICAgIGNvbGwsXG4gICAgICAgIHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmVbbmFtZV0uaW5kZXhTY2hlbWEsXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgX2QoJ29wZW4gbW9uZ29kYiBzdWNjZXNzZWQnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiDnoa7orqTlvZPliY3lrprkuYnnmoTmiYDmnInmlbDmja7lupPpm4blkIjlrZjlnKhcbiAgICog5LiN5a2Y5Zyo55qE5pWw5o2u5bqT5bCG6KKr5Yib5bu6XG4gICAqIOacrOe7hOS7tuWIm+W7uueahOaVsOaNruW6k+WwhuiHquWKqOWIm+W7uue0ouW8le+8jOW5tuWIoOmZpOacquWumuS5iee0ouW8leOAglxuICAgKiDlpoLmnpzntKLlvJXlrprkuYnkuLrnqbrvvIzliJnkuI3liKDpmaTntKLlvJXvvIzpmLLmraLlvJXnlKjlpJbpg6jmlbDmja7lupPnmoTntKLlvJXlhrLnqoHmiJbogIXmiYvliqjliJvlu7rnmoTntKLlvJXlhrLnqoFcbiAgICog5pys57uE5Lu25YaF5pyq6KKr5a6a5LmJ55qE5pWw5o2u5bqT5bCG6KKr6Ieq5Yqo6YeN5paw5ZG95ZCN5Li6X3VudXNlZF94eHhcbiAgICog5aSW6YOo5pWw5o2u5bqT55qE5pWw5o2u5bqT5ZKM6K6w5b2V6ZuG5ZCN56ew5ZyoX2V4dERi5Lit5a6a5LmJXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9ucygpIHtcbiAgICBpZiAoIXRoaXMuX2RiKSByZXR1cm47XG4gICAgLy8g6I635Y+W5b2T5YmN5a2Y5Zyo55qEY29sbHNcbiAgICBjb25zdCBjdXJDb2xscyA9IF8ua2V5QnkoYXdhaXQgdGhpcy5fZGIuY29sbGVjdGlvbnMoKSwgJ2NvbGxlY3Rpb25OYW1lJyk7XG5cbiAgICBjb25zdCBtb2RDb2xsRGVmaW5lcyA9IF8ucGlja0J5KFxuICAgICAgdGhpcy5fZGJDb2xsZWN0aW9uc0RlZmluZSxcbiAgICAgIHYgPT4gIV8uaGFzKHYuY29sbE9wdGlvbnMsICdfZXh0RGInKSxcbiAgICApO1xuICAgIGNvbnN0IGV4dGVybkNvbGxEZWZpbmVzID0gXy5waWNrQnkodGhpcy5fZGJDb2xsZWN0aW9uc0RlZmluZSwgdiA9PlxuICAgICAgXy5oYXModi5jb2xsT3B0aW9ucywgJ19leHREYicpLFxuICAgICk7XG5cbiAgICAvLyDkuI3lnKjlrprkuYnkuK3nmoRjb2xsc+Wwhuiiq+mHjeWRveWQjeS4ul91bnVzZWRfeHh4XG4gICAgZm9yIChjb25zdCBjb2xOYW1lIG9mIE9iamVjdC5rZXlzKGN1ckNvbGxzKSkge1xuICAgICAgaWYgKG1vZENvbGxEZWZpbmVzW2NvbE5hbWVdKSB7XG4gICAgICAgIF9kKCdvcGVuIGV4aXN0ZWQgY29sbGVjdGlvbjonLCBjb2xOYW1lKTtcbiAgICAgICAgLy8g5pyJ5pWI55qEY29sbOWumuS5ie+8jOaJk+W8gGNvbGxlY3Rpb25cbiAgICAgICAgdGhpcy5fY29sbGVjdGlvbnNbY29sTmFtZV0gPSBjdXJDb2xsc1tjb2xOYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIOmHjeWRveWQjeWSjOajgOa1i+aXoOaViOeahGNvbGxlY3Rpb25cbiAgICAgICAgaWYgKCFjb2xOYW1lLnN0YXJ0c1dpdGgoJ18nKSAmJiAhY29sTmFtZS5zdGFydHNXaXRoKCdzeXN0ZW0uJykpIHtcbiAgICAgICAgICBjb25zdCBuYW1lID0gJ191bnVzZWRfJyArIGNvbE5hbWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5fZGIucmVuYW1lQ29sbGVjdGlvbihjb2xOYW1lLCBuYW1lKTtcbiAgICAgICAgICBfZCgncmVuYW1lIHVudXNlZCBjb2xsZWN0aW9uOicsIG5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIF9kKCd1bnVzZWQgY29sbGVjdGlvbjonLCBjb2xOYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyDliJvlu7rmlrDnmoTlt7LlrprkuYnmqKHlnZdjb2xsc1xuICAgIGZvciAoY29uc3QgbmV3Q29sbCBvZiBfLmRpZmZlcmVuY2UoXG4gICAgICBPYmplY3Qua2V5cyhtb2RDb2xsRGVmaW5lcyksXG4gICAgICBPYmplY3Qua2V5cyhjdXJDb2xscyksXG4gICAgKSkge1xuICAgICAgdGhpcy5fY29sbGVjdGlvbnNbbmV3Q29sbF0gPSBhd2FpdCB0aGlzLl9kYi5jcmVhdGVDb2xsZWN0aW9uKFxuICAgICAgICBuZXdDb2xsLFxuICAgICAgICB0aGlzLl9kYkNvbGxlY3Rpb25zRGVmaW5lW25ld0NvbGxdLmNvbGxPcHRpb25zLFxuICAgICAgKTtcbiAgICAgIF9kKCdjcmVhdGUgbmV3IGNvbGxlY3Rpb246JywgbmV3Q29sbCk7XG4gICAgfVxuXG4gICAgLy8g5Yib5bu65YW25LuW5pWw5o2u5bqT5Lit55qEY29sbHPvvIzkuI3kvb/nlKhL5L2c5Li65aSW6YOo5pWw5o2u5bqT5ZCN56ew77yM5L2/55SoX2V4dERi55qEY29s5ZCN56ewXG4gICAgZm9yIChjb25zdCBrIG9mIE9iamVjdC5rZXlzKGV4dGVybkNvbGxEZWZpbmVzKSkge1xuICAgICAgY29uc3QgdiA9IGV4dGVybkNvbGxEZWZpbmVzW2tdO1xuICAgICAgaWYgKCF2KSBjb250aW51ZTtcblxuICAgICAgY29uc3QgZXh0RGJJbmZvOiBJRXh0RGIgPSBfLmdldCh2LCAnY29sbE9wdGlvbnMuX2V4dERiJyk7XG4gICAgICBpZiAoIXRoaXMuX2NsaWVudCB8fCAhZXh0RGJJbmZvKSByZXR1cm47XG4gICAgICAvLyAvLyDmiZPlvIDlkozliJvlu7rlpJbpg6jlupNcbiAgICAgIC8vIF9kKCctLS0tY3JlYXRlIGV4dGVybiBkYiAgY29sbGVjdGlvbjonLCBkYk5hbWUsIGspO1xuICAgICAgY29uc3QgZXh0ZXJuRGIgPSB0aGlzLl9jbGllbnQuZGIoZXh0RGJJbmZvLmRiKTtcbiAgICAgIGNvbnN0IGV4dENvbGxzID0gXy5rZXlCeShhd2FpdCBleHRlcm5EYi5jb2xsZWN0aW9ucygpLCAnY29sbGVjdGlvbk5hbWUnKTtcbiAgICAgIGlmICghZXh0Q29sbHNbZXh0RGJJbmZvLmNvbF0pIHtcbiAgICAgICAgLy8g5Yib5bu6Y29sbGVjdGlvblxuICAgICAgICBfZCgnY3JlYXRlIGV4dGVybiBjb2xsZWN0aW9uIG9rOicsIGV4dERiSW5mbyk7XG4gICAgICAgIHRoaXMuX2NvbGxlY3Rpb25zW2tdID0gYXdhaXQgZXh0ZXJuRGIuY3JlYXRlQ29sbGVjdGlvbihcbiAgICAgICAgICBleHREYkluZm8uY29sLFxuICAgICAgICAgIF8ub21pdCh2LmNvbGxPcHRpb25zLCAnX2V4dERiJyksXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfZCgnb3BlbiBleHRlcm4gY29sbGVjdGlvbiBvazonLCBleHREYkluZm8pO1xuICAgICAgICB0aGlzLl9jb2xsZWN0aW9uc1trXSA9IGV4dENvbGxzW2V4dERiSW5mby5jb2xdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgX2Vuc3VyZUNvbGxlY3Rpb25JbmRleGVzKFxuICAgIGNvbGw6IENvbGxlY3Rpb24sXG4gICAgaW5kZXhTY2hlbWFzOiBJTkRFWF9TQ0hFTUFfVCxcbiAgKSB7XG4gICAgLy8g5paw5aKe5Yqf6IO977yM5aaC5p6c6YWN572u57Si5byV5Li656m677yM5YiZ5LiN5aSE55CG57Si5byV5L+h5oGvXG4gICAgLy8g5Li65LqG6YG/5YWN5aSa5Liq6aG555uu5omT5byA5LiA5Liq5pWw5o2u5bqT55qE5Yay56qB6Zeu6aKYXG4gICAgaWYgKF8uaXNFbXB0eShpbmRleFNjaGVtYXMpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW5kZXhzQXJyYXkgPSBhd2FpdCBjb2xsLmluZGV4ZXMoKTtcblxuICAgIGNvbnN0IGluZGV4ZXMgPSBfLmtleUJ5KGluZGV4c0FycmF5LCAnbmFtZScpO1xuICAgIF9kKFxuICAgICAgJ2Vuc3VyZSBjb2xsZWN0aW9uIGluZGV4ZXM6JyxcbiAgICAgIGNvbGwuY29sbGVjdGlvbk5hbWUsXG4gICAgICBPYmplY3Qua2V5cyhpbmRleFNjaGVtYXMpLFxuICAgICk7XG5cbiAgICAvLyDliKDpmaTpnZ7nvLrnnIFfaWRf55qE5peg5pWI57Si5byVXG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoaW5kZXhlcykpIHtcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgnX2lkJykpIGNvbnRpbnVlO1xuICAgICAgaWYgKCFfLmlzUGxhaW5PYmplY3QoaW5kZXhTY2hlbWFzW2tleV0pKSB7XG4gICAgICAgIGF3YWl0IGNvbGwuZHJvcEluZGV4KGtleSk7XG4gICAgICAgIGRlbGV0ZSBpbmRleGVzW2tleV07XG4gICAgICAgIF9kKCdkcm9wIGludmFsaWQgaW5kZXg6JywgY29sbC5jb2xsZWN0aW9uTmFtZSwga2V5KTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gX2QoJ2Vuc3VyZSBjb2xsZWN0aW9uIGluZGV4ZXMgT0s6MScsIGNvbGwuY29sbGVjdGlvbk5hbWUsIE9iamVjdC5rZXlzKGluZGV4U2NoZW1hcykpO1xuXG4gICAgLy8g5Yib5bu65paw5a6a5LmJ55qEaW5kZXhcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhpbmRleFNjaGVtYXMpKSB7XG4gICAgICBpZiAoXy5pc0VtcHR5KGluZGV4ZXNba2V5XSkpIHtcbiAgICAgICAgX2QoJ2NyZWF0ZSBuZXcgaW5kZXg6JywgY29sbC5jb2xsZWN0aW9uTmFtZSwga2V5LCBpbmRleFNjaGVtYXNba2V5XSk7XG4gICAgICAgIGF3YWl0IGNvbGwuY3JlYXRlSW5kZXgoaW5kZXhTY2hlbWFzW2tleV0uZmllbGRzLCB7XG4gICAgICAgICAgbmFtZToga2V5LFxuICAgICAgICAgIC4uLmluZGV4U2NoZW1hc1trZXldLm9wdGlvbnMsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgX21vbml0b3JEYkV2ZW50KCkge1xuICAgIGlmICghdGhpcy5fZGIpIHJldHVybjtcbiAgICAvLyDnm5HlkKzkuovku7ZcbiAgICB0aGlzLl9kYi5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBfZCgnbW9uZ29kYiBjbG9zZTonKTtcbiAgICB9KTtcbiAgICB0aGlzLl9kYi5vbignZXJyb3InLCBlcnIgPT4ge1xuICAgICAgX2QoJ21vbmdvZGIgZXJyb3I6JywgZXJyKTtcbiAgICB9KTtcbiAgICB0aGlzLl9kYi5vbigndGltZW91dCcsICgpID0+IHtcbiAgICAgIF9kKCdtb25nb2RiIHRpbWVvdXQ6Jyk7XG4gICAgfSk7XG4gICAgdGhpcy5fZGIub24oJ3JlY29ubmVjdCcsICgpID0+IHtcbiAgICAgIF9kKCdtb25nb2RiIHJlY29ubmVjdDonKTtcbiAgICB9KTtcbiAgfVxufVxuIl19