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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxxQ0FBaUg7QUFDakgsa0RBQTBCO0FBQzFCLG9EQUF1QjtBQUN2QixnREFBd0I7QUFXeEI7SUFJRSxZQUNFLFdBQXVFLEVBQ3ZFLFdBQTJCO1FBTDdCLG1CQUFjLEdBQUcsRUFBVSxDQUFDO1FBTzFCLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO1FBQy9CLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO0lBQ2pDLENBQUM7Q0FDRjtBQVhELDRCQVdDO0FBSUQsdURBQXVEO0FBRXZELE1BQU0sRUFBRSxHQUFHLGVBQUssQ0FBQyxNQUFNLEdBQUcsY0FBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztBQWM1RCx5QkFBeUI7QUFFekI7SUFRRSxZQUNFLEdBQVcsRUFDWCxPQUEyQixFQUMzQixPQUFlLEVBQ2YsbUJBQXNCO1FBUmhCLFlBQU8sR0FBdUIsSUFBSSxDQUFDO1FBQ25DLFFBQUcsR0FBYyxJQUFJLENBQUM7UUFDdEIsaUJBQVksR0FBRyxFQUEyQixDQUFDO1FBUWpELElBQUksQ0FBQyxvQkFBb0IsR0FBRyxtQkFBbUIsQ0FBQztRQUNoRCxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztRQUNoQixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztRQUN4QixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztJQUMxQixDQUFDO0lBQ00sV0FBVztRQUNoQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDM0IsQ0FBQztJQUNNLEtBQUssQ0FBQyxPQUFPO1FBQ2xCLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxxQkFBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFB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WUFBRSxPQUFPO1FBQ3RCLE9BQU87UUFDUCxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO1lBQ3hCLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQ3pCLEVBQUUsQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7WUFDMUIsRUFBRSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDekIsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1lBQzVCLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQzNCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBbEpELHNCQWtKQztBQUVELDhCQUE4QiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE1vbmdvQ2xpZW50LCBJbmRleE9wdGlvbnMsIE1vbmdvQ2xpZW50T3B0aW9ucywgRGIsIENvbGxlY3Rpb24sIENvbGxlY3Rpb25DcmVhdGVPcHRpb25zIH0gZnJvbSAnbW9uZ29kYic7XG5pbXBvcnQgZGVidWcgZnJvbSAnZGVidWcnO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHByb2Nlc3MgZnJvbSAncHJvY2Vzcyc7XG4vLyBpbXBvcnQgeyBEYlNjaGVtYSB9IGZyb20gJy4vX3NjaGVtYSc7XG5cbmV4cG9ydCB0eXBlIElOREVYX1NDSEVNQV9UID0ge1xuICBbTmFtZTogc3RyaW5nXToge1xuICAgIGZpZWxkczoge307XG4gICAgb3B0aW9uczogSW5kZXhPcHRpb25zO1xuICB9O1xufTtcblxuZXhwb3J0IGNsYXNzIERiU2NoZW1hPFREb2M+IHtcbiAgZG9jdW1lbnRTY2hlbWEgPSB7fSBhcyBURG9jO1xuICBpbmRleFNjaGVtYTogSU5ERVhfU0NIRU1BX1Q7XG4gIGNvbGxPcHRpb25zOiBDb2xsZWN0aW9uQ3JlYXRlT3B0aW9ucztcbiAgY29uc3RydWN0b3IoXG4gICAgY29sbE9wdGlvbnM6IENvbGxlY3Rpb25DcmVhdGVPcHRpb25zICYgeyBfZGJOYW1lPzogc3RyaW5nIC8qIOiHquWumuS5ieaVsOaNruW6kyovIH0sXG4gICAgaW5kZXhTY2hlbWE6IElOREVYX1NDSEVNQV9UXG4gICkge1xuICAgIHRoaXMuaW5kZXhTY2hlbWEgPSBpbmRleFNjaGVtYTtcbiAgICB0aGlzLmNvbGxPcHRpb25zID0gY29sbE9wdGlvbnM7XG4gIH1cbn1cblxuXG5cbi8vIGltcG9ydCB7IERCX0NPTExFQ1RJT05TX1NDSEVNQV9UIH0gZnJvbSAnLi9fc2NoZW1hJztcblxuY29uc3QgX2QgPSBkZWJ1ZygnYXBwOicgKyBwYXRoLmJhc2VuYW1lKF9fZmlsZW5hbWUsICcuanMnKSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURiU2NoZW1hcyB7XG4gIFtrOiBzdHJpbmddOiB7XG4gICAgZG9jdW1lbnRTY2hlbWE6IHt9O1xuICAgIGluZGV4U2NoZW1hOiB7fTtcbiAgICBjb2xsT3B0aW9uczoge307XG4gIH07XG59XG5cbmV4cG9ydCB0eXBlIElFeHBvcnRDb2xsZWN0aW9uczxUIGV4dGVuZHMgSURiU2NoZW1hcz4gPSB7XG4gIFtLIGluIGtleW9mIFRdOiBDb2xsZWN0aW9uPFRbS11bJ2RvY3VtZW50U2NoZW1hJ10+XG59O1xuXG4vLyDlpoLmnpzmlbDmja7lupPnu5PmnoTpnIDopoHvvIzliJnpnIDopoHmj5Dkvpvlj5jmm7TohJrmnKzmnaXmiafooYxcblxuZXhwb3J0IGNsYXNzIE1vbmdvPFQgZXh0ZW5kcyBJRGJTY2hlbWFzPiB7XG4gIHByaXZhdGUgX3VybDogc3RyaW5nO1xuICBwcml2YXRlIF9vcHRpb25zOiBNb25nb0NsaWVudE9wdGlvbnM7XG4gIHByaXZhdGUgX21vZE5hbWU6IHN0cmluZztcbiAgcHJpdmF0ZSBfY2xpZW50OiBNb25nb0NsaWVudCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIF9kYjogRGIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBfY29sbGVjdGlvbnMgPSB7fSBhcyBJRXhwb3J0Q29sbGVjdGlvbnM8VD47XG4gIHByaXZhdGUgX2RiQ29sbGVjdGlvbnNEZWZpbmU6IFQ7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHVybDogc3RyaW5nLFxuICAgIG9wdGlvbnM6IE1vbmdvQ2xpZW50T3B0aW9ucyxcbiAgICBtb2ROYW1lOiBzdHJpbmcsXG4gICAgZGJDb2xsZWN0aW9uc0RlZmluZTogVFxuICApIHtcbiAgICB0aGlzLl9kYkNvbGxlY3Rpb25zRGVmaW5lID0gZGJDb2xsZWN0aW9uc0RlZmluZTtcbiAgICB0aGlzLl91cmwgPSB1cmw7XG4gICAgdGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgdGhpcy5fbW9kTmFtZSA9IG1vZE5hbWU7XG4gIH1cbiAgcHVibGljIGNvbGxlY3Rpb25zKCkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9ucztcbiAgfVxuICBwdWJsaWMgYXN5bmMgY29ubmVjdCgpIHtcbiAgICBfZCgnY29ubmVjdCB0byBtb25nb2RiJyk7XG4gICAgdGhpcy5fY2xpZW50ID0gYXdhaXQgTW9uZ29DbGllbnQuY29ubmVjdCh0aGlzLl91cmwsIHRoaXMuX29wdGlvbnMpO1xuICAgIHRoaXMuX2RiID0gYXdhaXQgdGhpcy5fY2xpZW50LmRiKHRoaXMuX21vZE5hbWUpO1xuICAgIHRoaXMuX21vbml0b3JEYkV2ZW50KCk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbnMoKTtcblxuICAgIC8v5Yib5bu657Si5byVXG4gICAgXy5mb3JFYWNoKHRoaXMuX2NvbGxlY3Rpb25zLCBhc3luYyAoY29sbCwgbmFtZSkgPT4ge1xuICAgICAgYXdhaXQgdGhpcy5fZW5zdXJlQ29sbGVjdGlvbkluZGV4ZXMoXG4gICAgICAgIGNvbGwsXG4gICAgICAgIHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmVbbmFtZV0uaW5kZXhTY2hlbWFcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBfZCgnb3BlbiBtb25nb2RiIHN1Y2Nlc3NlZCcpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbnMoKSB7XG4gICAgaWYgKCF0aGlzLl9kYikgcmV0dXJuO1xuICAgIC8vIOiOt+WPluW9k+WJjeWtmOWcqOeahGNvbGxzXG4gICAgY29uc3QgY3VyQ29sbHMgPSBfLmtleUJ5KGF3YWl0IHRoaXMuX2RiLmNvbGxlY3Rpb25zKCksICdjb2xsZWN0aW9uTmFtZScpO1xuXG4gICAgY29uc3QgbW9kQ29sbERlZmluZXMgPSBfLnBpY2tCeSh0aGlzLl9kYkNvbGxlY3Rpb25zRGVmaW5lLCB2ID0+ICFfLmhhcyh2LmNvbGxPcHRpb25zLCBcIl9kYk5hbWVcIikpXG4gICAgY29uc3QgZXh0ZXJuQ29sbERlZmluZXMgPSBfLnBpY2tCeSh0aGlzLl9kYkNvbGxlY3Rpb25zRGVmaW5lLCB2ID0+IF8uaGFzKHYuY29sbE9wdGlvbnMsIFwiX2RiTmFtZVwiKSlcblxuXG4gICAgLy8g5LiN5Zyo5a6a5LmJ5Lit55qEY29sbHPlsIbooqvph43lkb3lkI3kuLpfdW51c2VkX3h4eFxuICAgIGZvciAoY29uc3QgY29sTmFtZSBvZiBPYmplY3Qua2V5cyhjdXJDb2xscykpIHtcbiAgICAgIGlmIChtb2RDb2xsRGVmaW5lc1tjb2xOYW1lXSkge1xuICAgICAgICBfZCgnb3BlbiBleGlzdGVkIGNvbGxlY3Rpb246JywgY29sTmFtZSk7XG4gICAgICAgIC8vIOacieaViOeahGNvbGzlrprkuYnvvIzmiZPlvIBjb2xsZWN0aW9uXG4gICAgICAgIHRoaXMuX2NvbGxlY3Rpb25zW2NvbE5hbWVdID0gY3VyQ29sbHNbY29sTmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyDph43lkb3lkI3lkozmo4DmtYvml6DmlYjnmoRjb2xsZWN0aW9uXG4gICAgICAgIGlmICghY29sTmFtZS5zdGFydHNXaXRoKCdfJykpIHtcbiAgICAgICAgICBjb25zdCBuYW1lID0gJ191bnVzZWRfJyArIGNvbE5hbWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5fZGIucmVuYW1lQ29sbGVjdGlvbihjb2xOYW1lLCBuYW1lKTtcbiAgICAgICAgICBfZCgncmVuYW1lIHVudXNlZCBjb2xsZWN0aW9uOicsIG5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIF9kKCd1bnVzZWQgY29sbGVjdGlvbjonLCBjb2xOYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyDliJvlu7rmlrDnmoTlt7LlrprkuYnmqKHlnZdjb2xsc1xuICAgIGZvciAoY29uc3QgbmV3Q29sbCBvZiBfLmRpZmZlcmVuY2UoXG4gICAgICBPYmplY3Qua2V5cyhtb2RDb2xsRGVmaW5lcyksXG4gICAgICBPYmplY3Qua2V5cyhjdXJDb2xscylcbiAgICApKSB7XG4gICAgICB0aGlzLl9jb2xsZWN0aW9uc1tuZXdDb2xsXSA9IGF3YWl0IHRoaXMuX2RiLmNyZWF0ZUNvbGxlY3Rpb24oXG4gICAgICAgIG5ld0NvbGwsXG4gICAgICAgIHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmVbbmV3Q29sbF0uY29sbE9wdGlvbnNcbiAgICAgICk7XG4gICAgICBfZCgnY3JlYXRlIG5ldyBjb2xsZWN0aW9uOicsIG5ld0NvbGwpO1xuICAgIH1cblxuICAgIC8vIOWIm+W7uuWFtuS7luaVsOaNruW6k+S4reeahGNvbGxzXG4gICAgXy5mb3JFYWNoKGV4dGVybkNvbGxEZWZpbmVzLCBhc3luYyAodiwgaykgPT4ge1xuICAgICAgaWYgKCF2KSByZXR1cm47XG5cbiAgICAgIGNvbnN0IGRiTmFtZSA9IF8uZ2V0KHYsICdjb2xsT3B0aW9ucy5fZGJOYW1lJyk7XG4gICAgICBpZiAoKCF0aGlzLl9jbGllbnQpIHx8ICghZGJOYW1lKSkgcmV0dXJuO1xuICAgICAgLy8gLy8g5omT5byA5ZKM5Yib5bu65aSW6YOo5bqTXG4gICAgICAvLyBfZCgnLS0tLWNyZWF0ZSBleHRlcm4gZGIgIGNvbGxlY3Rpb246JywgZGJOYW1lLCBrKTtcbiAgICAgIGNvbnN0IGV4dGVybkRiID0gdGhpcy5fY2xpZW50LmRiKGRiTmFtZSk7XG4gICAgICBjb25zdCBleHRDb2xscyA9IF8ua2V5QnkoYXdhaXQgZXh0ZXJuRGIuY29sbGVjdGlvbnMoKSwgJ2NvbGxlY3Rpb25OYW1lJyk7XG4gICAgICBpZiAoIWV4dENvbGxzW2tdKSB7XG4gICAgICAgIC8vIOWIm+W7umNvbGxlY3Rpb25cbiAgICAgICAgdGhpcy5fY29sbGVjdGlvbnNba10gPSBhd2FpdCBleHRlcm5EYi5jcmVhdGVDb2xsZWN0aW9uKGssIF8ub21pdCh2LmNvbGxPcHRpb25zLCAnX2RiTmFtZScpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2NvbGxlY3Rpb25zW2tdID0gZXh0Q29sbHNba107XG4gICAgICB9XG4gICAgICBfZCgnY3JlYXRlIGV4dGVybiBjb2xsZWN0aW9uIG9rOicsIGRiTmFtZSwgayk7XG5cbiAgICB9KTtcblxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBfZW5zdXJlQ29sbGVjdGlvbkluZGV4ZXMoY29sbDogQ29sbGVjdGlvbiwgaW5kZXhTY2hlbWFzOiBJTkRFWF9TQ0hFTUFfVCkge1xuICAgIGNvbnN0IGluZGV4ZXMgPSBfLmtleUJ5KGF3YWl0IGNvbGwuaW5kZXhlcygpLCAnbmFtZScpO1xuICAgIF9kKCdlbnN1cmUgY29sbGVjdGlvbiBpbmRleGVzOicsIGNvbGwuY29sbGVjdGlvbk5hbWUsIE9iamVjdC5rZXlzKGluZGV4U2NoZW1hcykpO1xuXG4gICAgLy8g5Yig6Zmk6Z2e57y655yBX2lkX+eahOaXoOaViOe0ouW8lVxuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGluZGV4ZXMpKSB7XG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ19pZCcpKSBjb250aW51ZTtcbiAgICAgIGlmICghXy5pc1BsYWluT2JqZWN0KGluZGV4U2NoZW1hc1trZXldKSkge1xuICAgICAgICBhd2FpdCBjb2xsLmRyb3BJbmRleChrZXkpO1xuICAgICAgICBkZWxldGUgaW5kZXhlc1trZXldO1xuICAgICAgICBfZCgnZHJvcCBpbnZhbGlkIGluZGV4OicsIGNvbGwuY29sbGVjdGlvbk5hbWUsIGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIF9kKCdlbnN1cmUgY29sbGVjdGlvbiBpbmRleGVzIE9LOjEnLCBjb2xsLmNvbGxlY3Rpb25OYW1lLCBPYmplY3Qua2V5cyhpbmRleFNjaGVtYXMpKTtcblxuICAgIC8vIOWIm+W7uuaWsOWumuS5ieeahGluZGV4XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoaW5kZXhTY2hlbWFzKSkge1xuICAgICAgaWYgKF8uaXNFbXB0eShpbmRleGVzW2tleV0pKSB7XG4gICAgICAgIF9kKCdjcmVhdGUgbmV3IGluZGV4OicsIGNvbGwuY29sbGVjdGlvbk5hbWUsIGtleSwgaW5kZXhTY2hlbWFzW2tleV0pO1xuICAgICAgICBhd2FpdCBjb2xsLmNyZWF0ZUluZGV4KGluZGV4U2NoZW1hc1trZXldLmZpZWxkcywge1xuICAgICAgICAgIG5hbWU6IGtleSxcbiAgICAgICAgICAuLi5pbmRleFNjaGVtYXNba2V5XS5vcHRpb25zXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIF9kKCdlbnN1cmUgY29sbGVjdGlvbiBpbmRleGVzIE9LOjInLCBjb2xsLmNvbGxlY3Rpb25OYW1lLCBPYmplY3Qua2V5cyhpbmRleFNjaGVtYXMpKTtcblxuICB9XG5cbiAgcHJpdmF0ZSBfbW9uaXRvckRiRXZlbnQoKSB7XG4gICAgaWYgKCF0aGlzLl9kYikgcmV0dXJuO1xuICAgIC8vIOebkeWQrOS6i+S7tlxuICAgIHRoaXMuX2RiLm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIF9kKCdtb25nb2RiIGNsb3NlOicpO1xuICAgIH0pO1xuICAgIHRoaXMuX2RiLm9uKCdlcnJvcicsIGVyciA9PiB7XG4gICAgICBfZCgnbW9uZ29kYiBlcnJvcjonLCBlcnIpO1xuICAgIH0pO1xuICAgIHRoaXMuX2RiLm9uKCd0aW1lb3V0JywgKCkgPT4ge1xuICAgICAgX2QoJ21vbmdvZGIgdGltZW91dDonKTtcbiAgICB9KTtcbiAgICB0aGlzLl9kYi5vbigncmVjb25uZWN0JywgKCkgPT4ge1xuICAgICAgX2QoJ21vbmdvZGIgcmVjb25uZWN0OicpO1xuICAgIH0pO1xuICB9XG59XG5cbi8vIGV4cG9ydCBkZWZhdWx0IG5ldyBNb25nbygpO1xuIl19