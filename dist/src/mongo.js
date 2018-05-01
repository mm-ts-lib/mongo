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
        const modCollDefines = lodash_1.default.pickBy(this._dbCollectionsDefine, v => !lodash_1.default.has(v.collOptions, "_extDb"));
        const externCollDefines = lodash_1.default.pickBy(this._dbCollectionsDefine, v => lodash_1.default.has(v.collOptions, "_extDb"));
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
        // 创建其他数据库中的colls，不使用K作为外部数据库名称，使用_extDb的col名称
        lodash_1.default.forEach(externCollDefines, async (v, k) => {
            if (!v)
                return;
            const extDbInfo = lodash_1.default.get(v, 'collOptions._extDb');
            if ((!this._client) || (!extDbInfo))
                return;
            // // 打开和创建外部库
            // _d('----create extern db  collection:', dbName, k);
            const externDb = this._client.db(extDbInfo.db);
            const extColls = lodash_1.default.keyBy(await externDb.collections(), 'collectionName');
            if (!extColls[extDbInfo.col]) {
                // 创建collection
                this._collections[k] = await externDb.createCollection(extDbInfo.col, lodash_1.default.omit(v.collOptions, '_extDb'));
            }
            else {
                this._collections[k] = extColls[k];
            }
            _d('create extern collection ok:', extDbInfo);
        });
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
                    ...indexSchemas[key].options
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxxQ0FBaUg7QUFDakgsa0RBQTBCO0FBQzFCLG9EQUF1QjtBQUN2QixnREFBd0I7QUFHeEIsTUFBTSxFQUFFLEdBQUcsZUFBSyxDQUFDLE1BQU0sR0FBRyxjQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBaUI1RDs7R0FFRztBQUNIO0lBSUU7Ozs7T0FJRztJQUNILFlBQ0UsV0FFQyxFQUNELFdBQTJCO1FBWjdCLG1CQUFjLEdBQUcsRUFBVSxDQUFDLENBQUMsUUFBUTtRQWNuQyxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUMvQixJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztJQUNqQyxDQUFDO0NBQ0Y7QUFsQkQsNEJBa0JDO0FBcUJELHlCQUF5QjtBQUV6QjtJQVNFOzs7Ozs7T0FNRztJQUNILFlBQ0UsR0FBVyxFQUNYLE9BQTJCLEVBQzNCLE9BQWUsRUFDZixtQkFBc0I7UUFoQmhCLFlBQU8sR0FBdUIsSUFBSSxDQUFDO1FBQ25DLFFBQUcsR0FBYyxJQUFJLENBQUM7UUFDdEIsaUJBQVksR0FBRyxFQUEyQixDQUFDO1FBZ0JqRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsbUJBQW1CLENBQUM7UUFDaEQsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7UUFDaEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFDeEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7SUFDMUIsQ0FBQztJQUNEOztPQUVHO0lBQ0ksV0FBVztRQUNoQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDM0IsQ0FBQztJQUNEOztPQUVHO0lBQ0ksS0FBSyxDQUFDLE9BQU87UUFDbEIsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFD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ckUsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUU7b0JBQy9DLElBQUksRUFBRSxHQUFHO29CQUNULEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU87aUJBQzdCLENBQUMsQ0FBQzthQUNKO1NBQ0Y7SUFFSCxDQUFDO0lBRU8sZUFBZTtRQUNyQixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUc7WUFBRSxPQUFPO1FBQ3RCLE9BQU87UUFDUCxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO1lBQ3hCLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQ3pCLEVBQUUsQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7WUFDMUIsRUFBRSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDekIsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1lBQzVCLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQzNCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBNUtELHNCQTRLQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE1vbmdvQ2xpZW50LCBJbmRleE9wdGlvbnMsIE1vbmdvQ2xpZW50T3B0aW9ucywgRGIsIENvbGxlY3Rpb24sIENvbGxlY3Rpb25DcmVhdGVPcHRpb25zIH0gZnJvbSAnbW9uZ29kYic7XG5pbXBvcnQgZGVidWcgZnJvbSAnZGVidWcnO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHByb2Nlc3MgZnJvbSAncHJvY2Vzcyc7XG5cbmNvbnN0IF9kID0gZGVidWcoJ2FwcDonICsgcGF0aC5iYXNlbmFtZShfX2ZpbGVuYW1lLCAnLmpzJykpO1xuXG4vKipcbiAqIOaVsOaNruW6k+e0ouW8leexu+Wei1xuICovXG5leHBvcnQgdHlwZSBJTkRFWF9TQ0hFTUFfVCA9IHtcbiAgW05hbWU6IHN0cmluZ106IHtcbiAgICBmaWVsZHM6IHt9O1xuICAgIG9wdGlvbnM6IEluZGV4T3B0aW9ucztcbiAgfTtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dERiIHtcbiAgZGI6IHN0cmluZyAvKiDoh6rlrprkuYnmlbDmja7lupPlkI3np7AqL1xuICBjb2w6IHN0cmluZyAvKiDoh6rlrprkuYnmlbDmja7lupPpm4blkIjlkI3np7AqL1xuXG59XG4vKipcbiAqIOaehOmAoOS4gOS4quaVsOaNruW6k+WumuS5ieaWueahiFxuICovXG5leHBvcnQgY2xhc3MgRGJTY2hlbWE8VERvYz4ge1xuICBkb2N1bWVudFNjaGVtYSA9IHt9IGFzIFREb2M7IC8vIOaVsOaNruW6k+aWueahiFxuICBpbmRleFNjaGVtYTogSU5ERVhfU0NIRU1BX1Q7Ly/ntKLlvJXmlrnmoYhcbiAgY29sbE9wdGlvbnM6IENvbGxlY3Rpb25DcmVhdGVPcHRpb25zOy8v5pWw5o2u5bqT6YCJ6aG5XG4gIC8qKlxuICAgKiDmnoTpgKDmlbDmja7lupPmlrnmoYhcbiAgICogQHBhcmFtIGNvbGxPcHRpb25zICDpm4blkIjlrprkuYnpgInpoblcbiAgICogQHBhcmFtIGluZGV4U2NoZW1hIOe0ouW8leaWueahiOWumuS5iVxuICAgKi9cbiAgY29uc3RydWN0b3IoXG4gICAgY29sbE9wdGlvbnM6IENvbGxlY3Rpb25DcmVhdGVPcHRpb25zICYge1xuICAgICAgX2V4dERiPzogSUV4dERiXG4gICAgfSxcbiAgICBpbmRleFNjaGVtYTogSU5ERVhfU0NIRU1BX1RcbiAgKSB7XG4gICAgdGhpcy5pbmRleFNjaGVtYSA9IGluZGV4U2NoZW1hO1xuICAgIHRoaXMuY29sbE9wdGlvbnMgPSBjb2xsT3B0aW9ucztcbiAgfVxufVxuXG5cbi8qKlxuICog5pWw5o2u5bqT5a6a5LmJ5o6l5Y+jXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSURiU2NoZW1hcyB7XG4gIFtrOiBzdHJpbmddOiB7XG4gICAgZG9jdW1lbnRTY2hlbWE6IHt9O1xuICAgIGluZGV4U2NoZW1hOiB7fTtcbiAgICBjb2xsT3B0aW9uczoge307XG4gIH07XG59XG5cbi8qKlxuICog5a+85Ye65pys5Zyw5pWw5o2u5bqT6K6w5b2V6ZuGXG4gKi9cbmV4cG9ydCB0eXBlIElFeHBvcnRDb2xsZWN0aW9uczxUIGV4dGVuZHMgSURiU2NoZW1hcz4gPSB7XG4gIFtLIGluIGtleW9mIFRdOiBDb2xsZWN0aW9uPFRbS11bJ2RvY3VtZW50U2NoZW1hJ10+XG59O1xuXG4vLyDlpoLmnpzmlbDmja7lupPnu5PmnoTpnIDopoHvvIzliJnpnIDopoHmj5Dkvpvlj5jmm7TohJrmnKzmnaXmiafooYxcblxuZXhwb3J0IGNsYXNzIE1vbmdvPFQgZXh0ZW5kcyBJRGJTY2hlbWFzPiB7XG4gIHByaXZhdGUgX3VybDogc3RyaW5nO1xuICBwcml2YXRlIF9vcHRpb25zOiBNb25nb0NsaWVudE9wdGlvbnM7XG4gIHByaXZhdGUgX21vZE5hbWU6IHN0cmluZztcbiAgcHJpdmF0ZSBfY2xpZW50OiBNb25nb0NsaWVudCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIF9kYjogRGIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBfY29sbGVjdGlvbnMgPSB7fSBhcyBJRXhwb3J0Q29sbGVjdGlvbnM8VD47XG4gIHByaXZhdGUgX2RiQ29sbGVjdGlvbnNEZWZpbmU6IFQ7XG5cbiAgLyoqXG4gICAqIOaehOmAoE1vbmdvZGLmlbDmja7lupPnrqHnkIbnsbtcbiAgICogQHBhcmFtIHVybCAg5pWw5o2u5bqT6L+e5o6l5a2X56ym5LiyXG4gICAqIEBwYXJhbSBvcHRpb25zIOi/nuaOpemAiemhuVxuICAgKiBAcGFyYW0gbW9kTmFtZSDnu4Tku7blkI3np7DvvIzpu5jorqTliJvlu7rnmoTmlbDmja7lupPlkI3np7BcbiAgICogQHBhcmFtIGRiQ29sbGVjdGlvbnNEZWZpbmUg5pWw5o2u5bqT5pa55qGI5a6a5LmJXG4gICAqL1xuICBjb25zdHJ1Y3RvcihcbiAgICB1cmw6IHN0cmluZyxcbiAgICBvcHRpb25zOiBNb25nb0NsaWVudE9wdGlvbnMsXG4gICAgbW9kTmFtZTogc3RyaW5nLFxuICAgIGRiQ29sbGVjdGlvbnNEZWZpbmU6IFRcbiAgKSB7XG4gICAgdGhpcy5fZGJDb2xsZWN0aW9uc0RlZmluZSA9IGRiQ29sbGVjdGlvbnNEZWZpbmU7XG4gICAgdGhpcy5fdXJsID0gdXJsO1xuICAgIHRoaXMuX29wdGlvbnMgPSBvcHRpb25zO1xuICAgIHRoaXMuX21vZE5hbWUgPSBtb2ROYW1lO1xuICB9XG4gIC8qKlxuICAgKiDojrflj5blvZPliY3lrprkuYnnmoTmiYDmnInmlbDmja7lupPorrDlvZXpm4ZcbiAgICovXG4gIHB1YmxpYyBjb2xsZWN0aW9ucygpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbnM7XG4gIH1cbiAgLyoqXG4gICAqIOi/nuaOpeWIsOaVsOaNruW6kyxhc3luYyDlvILmraXlh73mlbBcbiAgICovXG4gIHB1YmxpYyBhc3luYyBjb25uZWN0KCkge1xuICAgIF9kKCdjb25uZWN0IHRvIG1vbmdvZGInKTtcbiAgICB0aGlzLl9jbGllbnQgPSBhd2FpdCBNb25nb0NsaWVudC5jb25uZWN0KHRoaXMuX3VybCwgdGhpcy5fb3B0aW9ucyk7XG4gICAgdGhpcy5fZGIgPSBhd2FpdCB0aGlzLl9jbGllbnQuZGIodGhpcy5fbW9kTmFtZSk7XG4gICAgdGhpcy5fbW9uaXRvckRiRXZlbnQoKTtcbiAgICBhd2FpdCB0aGlzLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9ucygpO1xuXG4gICAgLy/liJvlu7rntKLlvJVcbiAgICBfLmZvckVhY2godGhpcy5fY29sbGVjdGlvbnMsIGFzeW5jIChjb2xsLCBuYW1lKSA9PiB7XG4gICAgICBhd2FpdCB0aGlzLl9lbnN1cmVDb2xsZWN0aW9uSW5kZXhlcyhcbiAgICAgICAgY29sbCxcbiAgICAgICAgdGhpcy5fZGJDb2xsZWN0aW9uc0RlZmluZVtuYW1lXS5pbmRleFNjaGVtYVxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIF9kKCdvcGVuIG1vbmdvZGIgc3VjY2Vzc2VkJyk7XG4gIH1cblxuICAvKipcbiAgICog56Gu6K6k5b2T5YmN5a6a5LmJ55qE5omA5pyJ5pWw5o2u5bqT6ZuG5ZCI5a2Y5ZyoXG4gICAqIOS4jeWtmOWcqOeahOaVsOaNruW6k+Wwhuiiq+WIm+W7ulxuICAgKiDmnKznu4Tku7bliJvlu7rnmoTmlbDmja7lupPlsIboh6rliqjliJvlu7rntKLlvJXvvIzlubbliKDpmaTmnKrlrprkuYnntKLlvJXjgIJcbiAgICog5aaC5p6c57Si5byV5a6a5LmJ5Li656m677yM5YiZ5LiN5Yig6Zmk57Si5byV77yM6Ziy5q2i5byV55So5aSW6YOo5pWw5o2u5bqT55qE57Si5byV5Yay56qB5oiW6ICF5omL5Yqo5Yib5bu655qE57Si5byV5Yay56qBXG4gICAqIOacrOe7hOS7tuWGheacquiiq+WumuS5ieeahOaVsOaNruW6k+Wwhuiiq+iHquWKqOmHjeaWsOWRveWQjeS4ul91bnVzZWRfeHh4XG4gICAqIOWklumDqOaVsOaNruW6k+eahOaVsOaNruW6k+WSjOiusOW9lembhuWQjeensOWcqF9leHREYuS4reWumuS5iVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbnMoKSB7XG4gICAgaWYgKCF0aGlzLl9kYikgcmV0dXJuO1xuICAgIC8vIOiOt+WPluW9k+WJjeWtmOWcqOeahGNvbGxzXG4gICAgY29uc3QgY3VyQ29sbHMgPSBfLmtleUJ5KGF3YWl0IHRoaXMuX2RiLmNvbGxlY3Rpb25zKCksICdjb2xsZWN0aW9uTmFtZScpO1xuXG4gICAgY29uc3QgbW9kQ29sbERlZmluZXMgPSBfLnBpY2tCeSh0aGlzLl9kYkNvbGxlY3Rpb25zRGVmaW5lLCB2ID0+ICFfLmhhcyh2LmNvbGxPcHRpb25zLCBcIl9leHREYlwiKSlcbiAgICBjb25zdCBleHRlcm5Db2xsRGVmaW5lcyA9IF8ucGlja0J5KHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmUsIHYgPT4gXy5oYXModi5jb2xsT3B0aW9ucywgXCJfZXh0RGJcIikpXG5cbiAgICAvLyDkuI3lnKjlrprkuYnkuK3nmoRjb2xsc+Wwhuiiq+mHjeWRveWQjeS4ul91bnVzZWRfeHh4XG4gICAgZm9yIChjb25zdCBjb2xOYW1lIG9mIE9iamVjdC5rZXlzKGN1ckNvbGxzKSkge1xuICAgICAgaWYgKG1vZENvbGxEZWZpbmVzW2NvbE5hbWVdKSB7XG4gICAgICAgIF9kKCdvcGVuIGV4aXN0ZWQgY29sbGVjdGlvbjonLCBjb2xOYW1lKTtcbiAgICAgICAgLy8g5pyJ5pWI55qEY29sbOWumuS5ie+8jOaJk+W8gGNvbGxlY3Rpb25cbiAgICAgICAgdGhpcy5fY29sbGVjdGlvbnNbY29sTmFtZV0gPSBjdXJDb2xsc1tjb2xOYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIOmHjeWRveWQjeWSjOajgOa1i+aXoOaViOeahGNvbGxlY3Rpb25cbiAgICAgICAgaWYgKCFjb2xOYW1lLnN0YXJ0c1dpdGgoJ18nKSkge1xuICAgICAgICAgIGNvbnN0IG5hbWUgPSAnX3VudXNlZF8nICsgY29sTmFtZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLl9kYi5yZW5hbWVDb2xsZWN0aW9uKGNvbE5hbWUsIG5hbWUpO1xuICAgICAgICAgIF9kKCdyZW5hbWUgdW51c2VkIGNvbGxlY3Rpb246JywgbmFtZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgX2QoJ3VudXNlZCBjb2xsZWN0aW9uOicsIGNvbE5hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIOWIm+W7uuaWsOeahOW3suWumuS5ieaooeWdl2NvbGxzXG4gICAgZm9yIChjb25zdCBuZXdDb2xsIG9mIF8uZGlmZmVyZW5jZShcbiAgICAgIE9iamVjdC5rZXlzKG1vZENvbGxEZWZpbmVzKSxcbiAgICAgIE9iamVjdC5rZXlzKGN1ckNvbGxzKVxuICAgICkpIHtcbiAgICAgIHRoaXMuX2NvbGxlY3Rpb25zW25ld0NvbGxdID0gYXdhaXQgdGhpcy5fZGIuY3JlYXRlQ29sbGVjdGlvbihcbiAgICAgICAgbmV3Q29sbCxcbiAgICAgICAgdGhpcy5fZGJDb2xsZWN0aW9uc0RlZmluZVtuZXdDb2xsXS5jb2xsT3B0aW9uc1xuICAgICAgKTtcbiAgICAgIF9kKCdjcmVhdGUgbmV3IGNvbGxlY3Rpb246JywgbmV3Q29sbCk7XG4gICAgfVxuXG4gICAgLy8g5Yib5bu65YW25LuW5pWw5o2u5bqT5Lit55qEY29sbHPvvIzkuI3kvb/nlKhL5L2c5Li65aSW6YOo5pWw5o2u5bqT5ZCN56ew77yM5L2/55SoX2V4dERi55qEY29s5ZCN56ewXG4gICAgXy5mb3JFYWNoKGV4dGVybkNvbGxEZWZpbmVzLCBhc3luYyAodiwgaykgPT4ge1xuICAgICAgaWYgKCF2KSByZXR1cm47XG5cbiAgICAgIGNvbnN0IGV4dERiSW5mbzogSUV4dERiID0gXy5nZXQodiwgJ2NvbGxPcHRpb25zLl9leHREYicpO1xuICAgICAgaWYgKCghdGhpcy5fY2xpZW50KSB8fCAoIWV4dERiSW5mbykpIHJldHVybjtcbiAgICAgIC8vIC8vIOaJk+W8gOWSjOWIm+W7uuWklumDqOW6k1xuICAgICAgLy8gX2QoJy0tLS1jcmVhdGUgZXh0ZXJuIGRiICBjb2xsZWN0aW9uOicsIGRiTmFtZSwgayk7XG4gICAgICBjb25zdCBleHRlcm5EYiA9IHRoaXMuX2NsaWVudC5kYihleHREYkluZm8uZGIpO1xuICAgICAgY29uc3QgZXh0Q29sbHMgPSBfLmtleUJ5KGF3YWl0IGV4dGVybkRiLmNvbGxlY3Rpb25zKCksICdjb2xsZWN0aW9uTmFtZScpO1xuICAgICAgaWYgKCFleHRDb2xsc1tleHREYkluZm8uY29sXSkge1xuICAgICAgICAvLyDliJvlu7pjb2xsZWN0aW9uXG4gICAgICAgIHRoaXMuX2NvbGxlY3Rpb25zW2tdID0gYXdhaXQgZXh0ZXJuRGIuY3JlYXRlQ29sbGVjdGlvbihleHREYkluZm8uY29sLCBfLm9taXQodi5jb2xsT3B0aW9ucywgJ19leHREYicpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2NvbGxlY3Rpb25zW2tdID0gZXh0Q29sbHNba107XG4gICAgICB9XG4gICAgICBfZCgnY3JlYXRlIGV4dGVybiBjb2xsZWN0aW9uIG9rOicsIGV4dERiSW5mbyk7XG4gICAgfSk7XG5cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgX2Vuc3VyZUNvbGxlY3Rpb25JbmRleGVzKGNvbGw6IENvbGxlY3Rpb24sIGluZGV4U2NoZW1hczogSU5ERVhfU0NIRU1BX1QpIHtcbiAgICAvLyDmlrDlop7lip/og73vvIzlpoLmnpzphY3nva7ntKLlvJXkuLrnqbrvvIzliJnkuI3lpITnkIbntKLlvJXkv6Hmga9cbiAgICAvLyDkuLrkuobpgb/lhY3lpJrkuKrpobnnm67miZPlvIDkuIDkuKrmlbDmja7lupPnmoTlhrLnqoHpl67pophcbiAgICBpZiAoXy5pc0VtcHR5KGluZGV4U2NoZW1hcykpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleHNBcnJheSA9IGF3YWl0IGNvbGwuaW5kZXhlcygpO1xuXG4gICAgY29uc3QgaW5kZXhlcyA9IF8ua2V5QnkoaW5kZXhzQXJyYXksICduYW1lJyk7XG4gICAgX2QoJ2Vuc3VyZSBjb2xsZWN0aW9uIGluZGV4ZXM6JywgY29sbC5jb2xsZWN0aW9uTmFtZSwgT2JqZWN0LmtleXMoaW5kZXhTY2hlbWFzKSk7XG5cbiAgICAvLyDliKDpmaTpnZ7nvLrnnIFfaWRf55qE5peg5pWI57Si5byVXG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoaW5kZXhlcykpIHtcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgnX2lkJykpIGNvbnRpbnVlO1xuICAgICAgaWYgKCFfLmlzUGxhaW5PYmplY3QoaW5kZXhTY2hlbWFzW2tleV0pKSB7XG4gICAgICAgIGF3YWl0IGNvbGwuZHJvcEluZGV4KGtleSk7XG4gICAgICAgIGRlbGV0ZSBpbmRleGVzW2tleV07XG4gICAgICAgIF9kKCdkcm9wIGludmFsaWQgaW5kZXg6JywgY29sbC5jb2xsZWN0aW9uTmFtZSwga2V5KTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gX2QoJ2Vuc3VyZSBjb2xsZWN0aW9uIGluZGV4ZXMgT0s6MScsIGNvbGwuY29sbGVjdGlvbk5hbWUsIE9iamVjdC5rZXlzKGluZGV4U2NoZW1hcykpO1xuXG4gICAgLy8g5Yib5bu65paw5a6a5LmJ55qEaW5kZXhcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhpbmRleFNjaGVtYXMpKSB7XG4gICAgICBpZiAoXy5pc0VtcHR5KGluZGV4ZXNba2V5XSkpIHtcbiAgICAgICAgX2QoJ2NyZWF0ZSBuZXcgaW5kZXg6JywgY29sbC5jb2xsZWN0aW9uTmFtZSwga2V5LCBpbmRleFNjaGVtYXNba2V5XSk7XG4gICAgICAgIGF3YWl0IGNvbGwuY3JlYXRlSW5kZXgoaW5kZXhTY2hlbWFzW2tleV0uZmllbGRzLCB7XG4gICAgICAgICAgbmFtZToga2V5LFxuICAgICAgICAgIC4uLmluZGV4U2NoZW1hc1trZXldLm9wdGlvbnNcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gIH1cblxuICBwcml2YXRlIF9tb25pdG9yRGJFdmVudCgpIHtcbiAgICBpZiAoIXRoaXMuX2RiKSByZXR1cm47XG4gICAgLy8g55uR5ZCs5LqL5Lu2XG4gICAgdGhpcy5fZGIub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgX2QoJ21vbmdvZGIgY2xvc2U6Jyk7XG4gICAgfSk7XG4gICAgdGhpcy5fZGIub24oJ2Vycm9yJywgZXJyID0+IHtcbiAgICAgIF9kKCdtb25nb2RiIGVycm9yOicsIGVycik7XG4gICAgfSk7XG4gICAgdGhpcy5fZGIub24oJ3RpbWVvdXQnLCAoKSA9PiB7XG4gICAgICBfZCgnbW9uZ29kYiB0aW1lb3V0OicpO1xuICAgIH0pO1xuICAgIHRoaXMuX2RiLm9uKCdyZWNvbm5lY3QnLCAoKSA9PiB7XG4gICAgICBfZCgnbW9uZ29kYiByZWNvbm5lY3Q6Jyk7XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==