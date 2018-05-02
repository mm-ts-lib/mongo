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
        for (const k of Object.keys(externCollDefines)) {
            const v = externCollDefines[k];
            if (!v)
                continue;
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
        }
        ;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxxQ0FBaUg7QUFDakgsa0RBQTBCO0FBQzFCLG9EQUF1QjtBQUN2QixnREFBd0I7QUFHeEIsTUFBTSxFQUFFLEdBQUcsZUFBSyxDQUFDLE1BQU0sR0FBRyxjQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBaUI1RDs7R0FFRztBQUNIO0lBSUU7Ozs7T0FJRztJQUNILFlBQ0UsV0FFQyxFQUNELFdBQTJCO1FBWjdCLG1CQUFjLEdBQUcsRUFBVSxDQUFDLENBQUMsUUFBUTtRQWNuQyxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUMvQixJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztJQUNqQyxDQUFDO0NBQ0Y7QUFsQkQsNEJBa0JDO0FBcUJELHlCQUF5QjtBQUV6QjtJQVNFOzs7Ozs7T0FNRztJQUNILFlBQ0UsR0FBVyxFQUNYLE9BQTJCLEVBQzNCLE9BQWUsRUFDZixtQkFBc0I7UUFoQmhCLFlBQU8sR0FBdUIsSUFBSSxDQUFDO1FBQ25DLFFBQUcsR0FBYyxJQUFJLENBQUM7UUFDdEIsaUJBQVksR0FBRyxFQUEyQixDQUFDO1FBZ0JqRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsbUJBQW1CLENBQUM7UUFDaEQsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7UUFDaEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFDeEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7SUFDMUIsQ0FBQztJQUNNLGNBQWM7UUFDbkIsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLElBQUk7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDdkUsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3RCLENBQUM7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b0NsaWVudCwgSW5kZXhPcHRpb25zLCBNb25nb0NsaWVudE9wdGlvbnMsIERiLCBDb2xsZWN0aW9uLCBDb2xsZWN0aW9uQ3JlYXRlT3B0aW9ucyB9IGZyb20gJ21vbmdvZGInO1xuaW1wb3J0IGRlYnVnIGZyb20gJ2RlYnVnJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBwcm9jZXNzIGZyb20gJ3Byb2Nlc3MnO1xuXG5jb25zdCBfZCA9IGRlYnVnKCdhcHA6JyArIHBhdGguYmFzZW5hbWUoX19maWxlbmFtZSwgJy5qcycpKTtcblxuLyoqXG4gKiDmlbDmja7lupPntKLlvJXnsbvlnotcbiAqL1xuZXhwb3J0IHR5cGUgSU5ERVhfU0NIRU1BX1QgPSB7XG4gIFtOYW1lOiBzdHJpbmddOiB7XG4gICAgZmllbGRzOiB7fTtcbiAgICBvcHRpb25zOiBJbmRleE9wdGlvbnM7XG4gIH07XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHREYiB7XG4gIGRiOiBzdHJpbmcgLyog6Ieq5a6a5LmJ5pWw5o2u5bqT5ZCN56ewKi9cbiAgY29sOiBzdHJpbmcgLyog6Ieq5a6a5LmJ5pWw5o2u5bqT6ZuG5ZCI5ZCN56ewKi9cblxufVxuLyoqXG4gKiDmnoTpgKDkuIDkuKrmlbDmja7lupPlrprkuYnmlrnmoYhcbiAqL1xuZXhwb3J0IGNsYXNzIERiU2NoZW1hPFREb2M+IHtcbiAgZG9jdW1lbnRTY2hlbWEgPSB7fSBhcyBURG9jOyAvLyDmlbDmja7lupPmlrnmoYhcbiAgaW5kZXhTY2hlbWE6IElOREVYX1NDSEVNQV9UOy8v57Si5byV5pa55qGIXG4gIGNvbGxPcHRpb25zOiBDb2xsZWN0aW9uQ3JlYXRlT3B0aW9uczsvL+aVsOaNruW6k+mAiemhuVxuICAvKipcbiAgICog5p6E6YCg5pWw5o2u5bqT5pa55qGIXG4gICAqIEBwYXJhbSBjb2xsT3B0aW9ucyAg6ZuG5ZCI5a6a5LmJ6YCJ6aG5XG4gICAqIEBwYXJhbSBpbmRleFNjaGVtYSDntKLlvJXmlrnmoYjlrprkuYlcbiAgICovXG4gIGNvbnN0cnVjdG9yKFxuICAgIGNvbGxPcHRpb25zOiBDb2xsZWN0aW9uQ3JlYXRlT3B0aW9ucyAmIHtcbiAgICAgIF9leHREYj86IElFeHREYlxuICAgIH0sXG4gICAgaW5kZXhTY2hlbWE6IElOREVYX1NDSEVNQV9UXG4gICkge1xuICAgIHRoaXMuaW5kZXhTY2hlbWEgPSBpbmRleFNjaGVtYTtcbiAgICB0aGlzLmNvbGxPcHRpb25zID0gY29sbE9wdGlvbnM7XG4gIH1cbn1cblxuXG4vKipcbiAqIOaVsOaNruW6k+WumuS5ieaOpeWPo1xuICovXG5leHBvcnQgaW50ZXJmYWNlIElEYlNjaGVtYXMge1xuICBbazogc3RyaW5nXToge1xuICAgIGRvY3VtZW50U2NoZW1hOiB7fTtcbiAgICBpbmRleFNjaGVtYToge307XG4gICAgY29sbE9wdGlvbnM6IHt9O1xuICB9O1xufVxuXG4vKipcbiAqIOWvvOWHuuacrOWcsOaVsOaNruW6k+iusOW9lembhlxuICovXG5leHBvcnQgdHlwZSBJRXhwb3J0Q29sbGVjdGlvbnM8VCBleHRlbmRzIElEYlNjaGVtYXM+ID0ge1xuICBbSyBpbiBrZXlvZiBUXTogQ29sbGVjdGlvbjxUW0tdWydkb2N1bWVudFNjaGVtYSddPlxufTtcblxuLy8g5aaC5p6c5pWw5o2u5bqT57uT5p6E6ZyA6KaB77yM5YiZ6ZyA6KaB5o+Q5L6b5Y+Y5pu06ISa5pys5p2l5omn6KGMXG5cbmV4cG9ydCBjbGFzcyBNb25nbzxUIGV4dGVuZHMgSURiU2NoZW1hcz4ge1xuICBwcml2YXRlIF91cmw6IHN0cmluZztcbiAgcHJpdmF0ZSBfb3B0aW9uczogTW9uZ29DbGllbnRPcHRpb25zO1xuICBwcml2YXRlIF9tb2ROYW1lOiBzdHJpbmc7XG4gIHByaXZhdGUgX2NsaWVudDogTW9uZ29DbGllbnQgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBfZGI6IERiIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgX2NvbGxlY3Rpb25zID0ge30gYXMgSUV4cG9ydENvbGxlY3Rpb25zPFQ+O1xuICBwcml2YXRlIF9kYkNvbGxlY3Rpb25zRGVmaW5lOiBUO1xuXG4gIC8qKlxuICAgKiDmnoTpgKBNb25nb2Ri5pWw5o2u5bqT566h55CG57G7XG4gICAqIEBwYXJhbSB1cmwgIOaVsOaNruW6k+i/nuaOpeWtl+espuS4slxuICAgKiBAcGFyYW0gb3B0aW9ucyDov57mjqXpgInpoblcbiAgICogQHBhcmFtIG1vZE5hbWUg57uE5Lu25ZCN56ew77yM6buY6K6k5Yib5bu655qE5pWw5o2u5bqT5ZCN56ewXG4gICAqIEBwYXJhbSBkYkNvbGxlY3Rpb25zRGVmaW5lIOaVsOaNruW6k+aWueahiOWumuS5iVxuICAgKi9cbiAgY29uc3RydWN0b3IoXG4gICAgdXJsOiBzdHJpbmcsXG4gICAgb3B0aW9uczogTW9uZ29DbGllbnRPcHRpb25zLFxuICAgIG1vZE5hbWU6IHN0cmluZyxcbiAgICBkYkNvbGxlY3Rpb25zRGVmaW5lOiBUXG4gICkge1xuICAgIHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmUgPSBkYkNvbGxlY3Rpb25zRGVmaW5lO1xuICAgIHRoaXMuX3VybCA9IHVybDtcbiAgICB0aGlzLl9vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLl9tb2ROYW1lID0gbW9kTmFtZTtcbiAgfVxuICBwdWJsaWMgZ2V0TW9uZ29DbGllbnQoKSB7XG4gICAgaWYgKHRoaXMuX2NsaWVudCA9PT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKCdNb25nb2RiIGNsaWVudCBJbnZhbGlkISEnKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50O1xuICB9XG4gIC8qKlxuICAgKiDojrflj5blvZPliY3lrprkuYnnmoTmiYDmnInmlbDmja7lupPorrDlvZXpm4ZcbiAgICovXG4gIHB1YmxpYyBjb2xsZWN0aW9ucygpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbnM7XG4gIH1cbiAgLyoqXG4gICAqIOi/nuaOpeWIsOaVsOaNruW6kyxhc3luYyDlvILmraXlh73mlbBcbiAgICovXG4gIHB1YmxpYyBhc3luYyBjb25uZWN0KCkge1xuICAgIF9kKCdjb25uZWN0IHRvIG1vbmdvZGInKTtcbiAgICB0aGlzLl9jbGllbnQgPSBhd2FpdCBNb25nb0NsaWVudC5jb25uZWN0KHRoaXMuX3VybCwgdGhpcy5fb3B0aW9ucyk7XG4gICAgdGhpcy5fZGIgPSBhd2FpdCB0aGlzLl9jbGllbnQuZGIodGhpcy5fbW9kTmFtZSk7XG4gICAgdGhpcy5fbW9uaXRvckRiRXZlbnQoKTtcbiAgICBhd2FpdCB0aGlzLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9ucygpO1xuXG4gICAgLy/liJvlu7rntKLlvJVcbiAgICBfLmZvckVhY2godGhpcy5fY29sbGVjdGlvbnMsIGFzeW5jIChjb2xsLCBuYW1lKSA9PiB7XG4gICAgICBhd2FpdCB0aGlzLl9lbnN1cmVDb2xsZWN0aW9uSW5kZXhlcyhcbiAgICAgICAgY29sbCxcbiAgICAgICAgdGhpcy5fZGJDb2xsZWN0aW9uc0RlZmluZVtuYW1lXS5pbmRleFNjaGVtYVxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIF9kKCdvcGVuIG1vbmdvZGIgc3VjY2Vzc2VkJyk7XG4gIH1cblxuICAvKipcbiAgICog56Gu6K6k5b2T5YmN5a6a5LmJ55qE5omA5pyJ5pWw5o2u5bqT6ZuG5ZCI5a2Y5ZyoXG4gICAqIOS4jeWtmOWcqOeahOaVsOaNruW6k+Wwhuiiq+WIm+W7ulxuICAgKiDmnKznu4Tku7bliJvlu7rnmoTmlbDmja7lupPlsIboh6rliqjliJvlu7rntKLlvJXvvIzlubbliKDpmaTmnKrlrprkuYnntKLlvJXjgIJcbiAgICog5aaC5p6c57Si5byV5a6a5LmJ5Li656m677yM5YiZ5LiN5Yig6Zmk57Si5byV77yM6Ziy5q2i5byV55So5aSW6YOo5pWw5o2u5bqT55qE57Si5byV5Yay56qB5oiW6ICF5omL5Yqo5Yib5bu655qE57Si5byV5Yay56qBXG4gICAqIOacrOe7hOS7tuWGheacquiiq+WumuS5ieeahOaVsOaNruW6k+Wwhuiiq+iHquWKqOmHjeaWsOWRveWQjeS4ul91bnVzZWRfeHh4XG4gICAqIOWklumDqOaVsOaNruW6k+eahOaVsOaNruW6k+WSjOiusOW9lembhuWQjeensOWcqF9leHREYuS4reWumuS5iVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbnMoKSB7XG4gICAgaWYgKCF0aGlzLl9kYikgcmV0dXJuO1xuICAgIC8vIOiOt+WPluW9k+WJjeWtmOWcqOeahGNvbGxzXG4gICAgY29uc3QgY3VyQ29sbHMgPSBfLmtleUJ5KGF3YWl0IHRoaXMuX2RiLmNvbGxlY3Rpb25zKCksICdjb2xsZWN0aW9uTmFtZScpO1xuXG4gICAgY29uc3QgbW9kQ29sbERlZmluZXMgPSBfLnBpY2tCeSh0aGlzLl9kYkNvbGxlY3Rpb25zRGVmaW5lLCB2ID0+ICFfLmhhcyh2LmNvbGxPcHRpb25zLCBcIl9leHREYlwiKSlcbiAgICBjb25zdCBleHRlcm5Db2xsRGVmaW5lcyA9IF8ucGlja0J5KHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmUsIHYgPT4gXy5oYXModi5jb2xsT3B0aW9ucywgXCJfZXh0RGJcIikpXG5cbiAgICAvLyDkuI3lnKjlrprkuYnkuK3nmoRjb2xsc+Wwhuiiq+mHjeWRveWQjeS4ul91bnVzZWRfeHh4XG4gICAgZm9yIChjb25zdCBjb2xOYW1lIG9mIE9iamVjdC5rZXlzKGN1ckNvbGxzKSkge1xuICAgICAgaWYgKG1vZENvbGxEZWZpbmVzW2NvbE5hbWVdKSB7XG4gICAgICAgIF9kKCdvcGVuIGV4aXN0ZWQgY29sbGVjdGlvbjonLCBjb2xOYW1lKTtcbiAgICAgICAgLy8g5pyJ5pWI55qEY29sbOWumuS5ie+8jOaJk+W8gGNvbGxlY3Rpb25cbiAgICAgICAgdGhpcy5fY29sbGVjdGlvbnNbY29sTmFtZV0gPSBjdXJDb2xsc1tjb2xOYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIOmHjeWRveWQjeWSjOajgOa1i+aXoOaViOeahGNvbGxlY3Rpb25cbiAgICAgICAgaWYgKCFjb2xOYW1lLnN0YXJ0c1dpdGgoJ18nKSkge1xuICAgICAgICAgIGNvbnN0IG5hbWUgPSAnX3VudXNlZF8nICsgY29sTmFtZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLl9kYi5yZW5hbWVDb2xsZWN0aW9uKGNvbE5hbWUsIG5hbWUpO1xuICAgICAgICAgIF9kKCdyZW5hbWUgdW51c2VkIGNvbGxlY3Rpb246JywgbmFtZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgX2QoJ3VudXNlZCBjb2xsZWN0aW9uOicsIGNvbE5hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIOWIm+W7uuaWsOeahOW3suWumuS5ieaooeWdl2NvbGxzXG4gICAgZm9yIChjb25zdCBuZXdDb2xsIG9mIF8uZGlmZmVyZW5jZShcbiAgICAgIE9iamVjdC5rZXlzKG1vZENvbGxEZWZpbmVzKSxcbiAgICAgIE9iamVjdC5rZXlzKGN1ckNvbGxzKVxuICAgICkpIHtcbiAgICAgIHRoaXMuX2NvbGxlY3Rpb25zW25ld0NvbGxdID0gYXdhaXQgdGhpcy5fZGIuY3JlYXRlQ29sbGVjdGlvbihcbiAgICAgICAgbmV3Q29sbCxcbiAgICAgICAgdGhpcy5fZGJDb2xsZWN0aW9uc0RlZmluZVtuZXdDb2xsXS5jb2xsT3B0aW9uc1xuICAgICAgKTtcbiAgICAgIF9kKCdjcmVhdGUgbmV3IGNvbGxlY3Rpb246JywgbmV3Q29sbCk7XG4gICAgfVxuXG4gICAgLy8g5Yib5bu65YW25LuW5pWw5o2u5bqT5Lit55qEY29sbHPvvIzkuI3kvb/nlKhL5L2c5Li65aSW6YOo5pWw5o2u5bqT5ZCN56ew77yM5L2/55SoX2V4dERi55qEY29s5ZCN56ewXG4gICAgZm9yIChjb25zdCBrIG9mIE9iamVjdC5rZXlzKGV4dGVybkNvbGxEZWZpbmVzKSkge1xuICAgICAgY29uc3QgdiA9IGV4dGVybkNvbGxEZWZpbmVzW2tdO1xuICAgICAgaWYgKCF2KSBjb250aW51ZTtcblxuICAgICAgY29uc3QgZXh0RGJJbmZvOiBJRXh0RGIgPSBfLmdldCh2LCAnY29sbE9wdGlvbnMuX2V4dERiJyk7XG4gICAgICBpZiAoKCF0aGlzLl9jbGllbnQpIHx8ICghZXh0RGJJbmZvKSkgcmV0dXJuO1xuICAgICAgLy8gLy8g5omT5byA5ZKM5Yib5bu65aSW6YOo5bqTXG4gICAgICAvLyBfZCgnLS0tLWNyZWF0ZSBleHRlcm4gZGIgIGNvbGxlY3Rpb246JywgZGJOYW1lLCBrKTtcbiAgICAgIGNvbnN0IGV4dGVybkRiID0gdGhpcy5fY2xpZW50LmRiKGV4dERiSW5mby5kYik7XG4gICAgICBjb25zdCBleHRDb2xscyA9IF8ua2V5QnkoYXdhaXQgZXh0ZXJuRGIuY29sbGVjdGlvbnMoKSwgJ2NvbGxlY3Rpb25OYW1lJyk7XG4gICAgICBpZiAoIWV4dENvbGxzW2V4dERiSW5mby5jb2xdKSB7XG4gICAgICAgIC8vIOWIm+W7umNvbGxlY3Rpb25cbiAgICAgICAgdGhpcy5fY29sbGVjdGlvbnNba10gPSBhd2FpdCBleHRlcm5EYi5jcmVhdGVDb2xsZWN0aW9uKGV4dERiSW5mby5jb2wsIF8ub21pdCh2LmNvbGxPcHRpb25zLCAnX2V4dERiJykpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fY29sbGVjdGlvbnNba10gPSBleHRDb2xsc1trXTtcbiAgICAgIH1cbiAgICAgIF9kKCdjcmVhdGUgZXh0ZXJuIGNvbGxlY3Rpb24gb2s6JywgZXh0RGJJbmZvKTtcbiAgICB9O1xuXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIF9lbnN1cmVDb2xsZWN0aW9uSW5kZXhlcyhjb2xsOiBDb2xsZWN0aW9uLCBpbmRleFNjaGVtYXM6IElOREVYX1NDSEVNQV9UKSB7XG4gICAgLy8g5paw5aKe5Yqf6IO977yM5aaC5p6c6YWN572u57Si5byV5Li656m677yM5YiZ5LiN5aSE55CG57Si5byV5L+h5oGvXG4gICAgLy8g5Li65LqG6YG/5YWN5aSa5Liq6aG555uu5omT5byA5LiA5Liq5pWw5o2u5bqT55qE5Yay56qB6Zeu6aKYXG4gICAgaWYgKF8uaXNFbXB0eShpbmRleFNjaGVtYXMpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW5kZXhzQXJyYXkgPSBhd2FpdCBjb2xsLmluZGV4ZXMoKTtcblxuICAgIGNvbnN0IGluZGV4ZXMgPSBfLmtleUJ5KGluZGV4c0FycmF5LCAnbmFtZScpO1xuICAgIF9kKCdlbnN1cmUgY29sbGVjdGlvbiBpbmRleGVzOicsIGNvbGwuY29sbGVjdGlvbk5hbWUsIE9iamVjdC5rZXlzKGluZGV4U2NoZW1hcykpO1xuXG4gICAgLy8g5Yig6Zmk6Z2e57y655yBX2lkX+eahOaXoOaViOe0ouW8lVxuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGluZGV4ZXMpKSB7XG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ19pZCcpKSBjb250aW51ZTtcbiAgICAgIGlmICghXy5pc1BsYWluT2JqZWN0KGluZGV4U2NoZW1hc1trZXldKSkge1xuICAgICAgICBhd2FpdCBjb2xsLmRyb3BJbmRleChrZXkpO1xuICAgICAgICBkZWxldGUgaW5kZXhlc1trZXldO1xuICAgICAgICBfZCgnZHJvcCBpbnZhbGlkIGluZGV4OicsIGNvbGwuY29sbGVjdGlvbk5hbWUsIGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIF9kKCdlbnN1cmUgY29sbGVjdGlvbiBpbmRleGVzIE9LOjEnLCBjb2xsLmNvbGxlY3Rpb25OYW1lLCBPYmplY3Qua2V5cyhpbmRleFNjaGVtYXMpKTtcblxuICAgIC8vIOWIm+W7uuaWsOWumuS5ieeahGluZGV4XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoaW5kZXhTY2hlbWFzKSkge1xuICAgICAgaWYgKF8uaXNFbXB0eShpbmRleGVzW2tleV0pKSB7XG4gICAgICAgIF9kKCdjcmVhdGUgbmV3IGluZGV4OicsIGNvbGwuY29sbGVjdGlvbk5hbWUsIGtleSwgaW5kZXhTY2hlbWFzW2tleV0pO1xuICAgICAgICBhd2FpdCBjb2xsLmNyZWF0ZUluZGV4KGluZGV4U2NoZW1hc1trZXldLmZpZWxkcywge1xuICAgICAgICAgIG5hbWU6IGtleSxcbiAgICAgICAgICAuLi5pbmRleFNjaGVtYXNba2V5XS5vcHRpb25zXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICB9XG5cbiAgcHJpdmF0ZSBfbW9uaXRvckRiRXZlbnQoKSB7XG4gICAgaWYgKCF0aGlzLl9kYikgcmV0dXJuO1xuICAgIC8vIOebkeWQrOS6i+S7tlxuICAgIHRoaXMuX2RiLm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIF9kKCdtb25nb2RiIGNsb3NlOicpO1xuICAgIH0pO1xuICAgIHRoaXMuX2RiLm9uKCdlcnJvcicsIGVyciA9PiB7XG4gICAgICBfZCgnbW9uZ29kYiBlcnJvcjonLCBlcnIpO1xuICAgIH0pO1xuICAgIHRoaXMuX2RiLm9uKCd0aW1lb3V0JywgKCkgPT4ge1xuICAgICAgX2QoJ21vbmdvZGIgdGltZW91dDonKTtcbiAgICB9KTtcbiAgICB0aGlzLl9kYi5vbigncmVjb25uZWN0JywgKCkgPT4ge1xuICAgICAgX2QoJ21vbmdvZGIgcmVjb25uZWN0OicpO1xuICAgIH0pO1xuICB9XG59XG4iXX0=