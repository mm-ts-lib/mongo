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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxxQ0FBaUg7QUFDakgsa0RBQTBCO0FBQzFCLG9EQUF1QjtBQUN2QixnREFBd0I7QUFHeEIsTUFBTSxFQUFFLEdBQUcsZUFBSyxDQUFDLE1BQU0sR0FBRyxjQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBaUI1RDs7R0FFRztBQUNIO0lBSUU7Ozs7T0FJRztJQUNILFlBQ0UsV0FFQyxFQUNELFdBQTJCO1FBWjdCLG1CQUFjLEdBQUcsRUFBVSxDQUFDLENBQUMsUUFBUTtRQWNuQyxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUMvQixJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztJQUNqQyxDQUFDO0NBQ0Y7QUFsQkQsNEJBa0JDO0FBcUJELHlCQUF5QjtBQUV6QjtJQVNFOzs7Ozs7T0FNRztJQUNILFlBQ0UsR0FBVyxFQUNYLE9BQTJCLEVBQzNCLE9BQWUsRUFDZixtQkFBc0I7UUFoQmhCLFlBQU8sR0FBdUIsSUFBSSxDQUFDO1FBQ25DLFFBQUcsR0FBYyxJQUFJLENBQUM7UUFDdEIsaUJBQVksR0FBRyxFQUEyQixDQUFDO1FBZ0JqRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsbUJBQW1CLENBQUM7UUFDaEQsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7UUFDaEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFDeEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7SUFDMUIsQ0FBQztJQUNNLGNBQWM7UUFDbkIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3RCLENBQUM7SUFDRDs7T0FFRztJQUNJLFdBQVc7UUFDaEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDO0lBQzNCLENBQUM7SUFDRDs7T0FFRztJQUNJLEtBQUssQ0FBQyxPQUFPO1FBQ2xCLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxxQkFBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUN2QixNQUFNLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBRXRDLE1BQU07UUFDTixnQkFBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUU7WUFDaEQsTUFBTSxJQUFJLENBQUMsd0JBQXdCLENBQ2pDLElBQUksRUFDSixJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLENBQUMsV0FBVyxDQUM1QyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNLLEtBQUssQ0FBQyx3QkFBd0I7UUFDcEMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHO1lBQUUsT0FBTztRQUN0QixlQUFlO1FBQ2YsTUFBTSxRQUFRLEdBQUcsZ0JBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFFekUsTUFBTSxjQUFjLEdBQUcsZ0JBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxnQkFBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUE7UUFDaEcsTUFBTSxpQkFBaUIsR0FBRyxnQkFBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxnQkFBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUE7UUFFbEcsK0JBQStCO1FBQy9CLEtBQUssTUFBTSxPQUFPLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUMzQyxJQUFJLGNBQWMsQ0FBQyxPQUFPLENBQUMsRUFBRTtnQkFDM0IsRUFBRSxDQUFDLDBCQUEwQixFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUN4Qyx5QkFBeUI7Z0JBQ3pCLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2FBQ2hEO2lCQUFNO2dCQUNMLHNCQUFzQjtnQkFDdEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUU7b0JBQzVCLE1BQU0sSUFBSSxHQUFHLFVBQVUsR0FBRyxPQUFPLENBQUM7b0JBQ2xDLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQy9DLEVBQUUsQ0FBQywyQkFBMkIsRUFBRSxJQUFJLENBQUMsQ0FBQztpQkFDdkM7cUJBQU07b0JBQ0wsRUFBRSxDQUFDLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxDQUFDO2lCQUNuQzthQUNGO1NBQ0Y7UUFDRCxpQkFBaUI7UUFDakIsS0FBSyxNQUFNLE9BQU8sSUFBSSxnQkFBQyxDQUFDLFVBQVUsQ0FDaEMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsRUFDM0IsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FDdEIsRUFBRTtZQUNELElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUMxRCxPQUFPLEVBQ1AsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxDQUFDLFdBQVcsQ0FDL0MsQ0FBQztZQUNGLEVBQUUsQ0FBQyx3QkFBd0IsRUFBRSxPQUFPLENBQUMsQ0FBQztTQUN2QztRQUVELDhDQUE4QztRQUM5QyxnQkFBQyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQzFDLElBQUksQ0FBQyxDQUFDO2dCQUFFLE9BQU87WUFFZixNQUFNLFNBQVMsR0FBVyxnQkFBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUN6RCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQztnQkFBRSxPQUFPO1lBQzVDLGNBQWM7WUFDZCxzREFBc0Q7WUFDdEQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQy9DLE1BQU0sUUFBUSxHQUFHLGdCQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sUUFBUSxDQUFDLFdBQVcsRUFBRSxFQUFFLGdCQUFnQixDQUFDLENBQUM7WUFDekUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQzVCLGVBQWU7Z0JBQ2YsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLGdCQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQzthQUN4RztpQkFBTTtnQkFDTCxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNwQztZQUNELEVBQUUsQ0FBQyw4QkFBOEIsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoRCxDQUFDLENBQUMsQ0FBQztJQUVMLENBQUM7SUFFTyxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBZ0IsRUFBRSxZQUE0QjtRQUNuRix5QkFBeUI7UUFDekIsdUJBQXVCO1FBQ3ZCLElBQUksZ0JBQUMsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUU7WUFDM0IsT0FBTztTQUNSO1FBRUQsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFekMsTUFBTSxPQUFPLEdBQUcsZ0JBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzdDLEVBQUUsQ0FBQyw0QkFBNEIsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUVqRixpQkFBaUI7UUFDakIsS0FBSyxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ3RDLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUM7Z0JBQUUsU0FBUztZQUNwQyxJQUFJLENBQUMsZ0JBQUMsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3ZDLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDMUIsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3BCLEVBQUUsQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2FBQ3JEO1NBQ0Y7UUFDRCx3RkFBd0Y7UUFFeEYsY0FBYztRQUNkLEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRTtZQUMzQyxJQUFJLGdCQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFO2dCQUMzQixFQUFFLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUUsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JFLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFO29CQUMvQyxJQUFJLEVBQUUsR0FBRztvQkFDVCxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPO2lCQUM3QixDQUFDLENBQUM7YUFDSjtTQUNGO0lBRUgsQ0FBQztJQUVPLGVBQWU7UUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHO1lBQUUsT0FBTztRQUN0QixPQUFPO1FBQ1AsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUN4QixFQUFFLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN2QixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsRUFBRTtZQUN6QixFQUFFLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFO1lBQzFCLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3pCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtZQUM1QixFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9LRCxzQkErS0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNb25nb0NsaWVudCwgSW5kZXhPcHRpb25zLCBNb25nb0NsaWVudE9wdGlvbnMsIERiLCBDb2xsZWN0aW9uLCBDb2xsZWN0aW9uQ3JlYXRlT3B0aW9ucyB9IGZyb20gJ21vbmdvZGInO1xuaW1wb3J0IGRlYnVnIGZyb20gJ2RlYnVnJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBwcm9jZXNzIGZyb20gJ3Byb2Nlc3MnO1xuXG5jb25zdCBfZCA9IGRlYnVnKCdhcHA6JyArIHBhdGguYmFzZW5hbWUoX19maWxlbmFtZSwgJy5qcycpKTtcblxuLyoqXG4gKiDmlbDmja7lupPntKLlvJXnsbvlnotcbiAqL1xuZXhwb3J0IHR5cGUgSU5ERVhfU0NIRU1BX1QgPSB7XG4gIFtOYW1lOiBzdHJpbmddOiB7XG4gICAgZmllbGRzOiB7fTtcbiAgICBvcHRpb25zOiBJbmRleE9wdGlvbnM7XG4gIH07XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHREYiB7XG4gIGRiOiBzdHJpbmcgLyog6Ieq5a6a5LmJ5pWw5o2u5bqT5ZCN56ewKi9cbiAgY29sOiBzdHJpbmcgLyog6Ieq5a6a5LmJ5pWw5o2u5bqT6ZuG5ZCI5ZCN56ewKi9cblxufVxuLyoqXG4gKiDmnoTpgKDkuIDkuKrmlbDmja7lupPlrprkuYnmlrnmoYhcbiAqL1xuZXhwb3J0IGNsYXNzIERiU2NoZW1hPFREb2M+IHtcbiAgZG9jdW1lbnRTY2hlbWEgPSB7fSBhcyBURG9jOyAvLyDmlbDmja7lupPmlrnmoYhcbiAgaW5kZXhTY2hlbWE6IElOREVYX1NDSEVNQV9UOy8v57Si5byV5pa55qGIXG4gIGNvbGxPcHRpb25zOiBDb2xsZWN0aW9uQ3JlYXRlT3B0aW9uczsvL+aVsOaNruW6k+mAiemhuVxuICAvKipcbiAgICog5p6E6YCg5pWw5o2u5bqT5pa55qGIXG4gICAqIEBwYXJhbSBjb2xsT3B0aW9ucyAg6ZuG5ZCI5a6a5LmJ6YCJ6aG5XG4gICAqIEBwYXJhbSBpbmRleFNjaGVtYSDntKLlvJXmlrnmoYjlrprkuYlcbiAgICovXG4gIGNvbnN0cnVjdG9yKFxuICAgIGNvbGxPcHRpb25zOiBDb2xsZWN0aW9uQ3JlYXRlT3B0aW9ucyAmIHtcbiAgICAgIF9leHREYj86IElFeHREYlxuICAgIH0sXG4gICAgaW5kZXhTY2hlbWE6IElOREVYX1NDSEVNQV9UXG4gICkge1xuICAgIHRoaXMuaW5kZXhTY2hlbWEgPSBpbmRleFNjaGVtYTtcbiAgICB0aGlzLmNvbGxPcHRpb25zID0gY29sbE9wdGlvbnM7XG4gIH1cbn1cblxuXG4vKipcbiAqIOaVsOaNruW6k+WumuS5ieaOpeWPo1xuICovXG5leHBvcnQgaW50ZXJmYWNlIElEYlNjaGVtYXMge1xuICBbazogc3RyaW5nXToge1xuICAgIGRvY3VtZW50U2NoZW1hOiB7fTtcbiAgICBpbmRleFNjaGVtYToge307XG4gICAgY29sbE9wdGlvbnM6IHt9O1xuICB9O1xufVxuXG4vKipcbiAqIOWvvOWHuuacrOWcsOaVsOaNruW6k+iusOW9lembhlxuICovXG5leHBvcnQgdHlwZSBJRXhwb3J0Q29sbGVjdGlvbnM8VCBleHRlbmRzIElEYlNjaGVtYXM+ID0ge1xuICBbSyBpbiBrZXlvZiBUXTogQ29sbGVjdGlvbjxUW0tdWydkb2N1bWVudFNjaGVtYSddPlxufTtcblxuLy8g5aaC5p6c5pWw5o2u5bqT57uT5p6E6ZyA6KaB77yM5YiZ6ZyA6KaB5o+Q5L6b5Y+Y5pu06ISa5pys5p2l5omn6KGMXG5cbmV4cG9ydCBjbGFzcyBNb25nbzxUIGV4dGVuZHMgSURiU2NoZW1hcz4ge1xuICBwcml2YXRlIF91cmw6IHN0cmluZztcbiAgcHJpdmF0ZSBfb3B0aW9uczogTW9uZ29DbGllbnRPcHRpb25zO1xuICBwcml2YXRlIF9tb2ROYW1lOiBzdHJpbmc7XG4gIHByaXZhdGUgX2NsaWVudDogTW9uZ29DbGllbnQgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBfZGI6IERiIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgX2NvbGxlY3Rpb25zID0ge30gYXMgSUV4cG9ydENvbGxlY3Rpb25zPFQ+O1xuICBwcml2YXRlIF9kYkNvbGxlY3Rpb25zRGVmaW5lOiBUO1xuXG4gIC8qKlxuICAgKiDmnoTpgKBNb25nb2Ri5pWw5o2u5bqT566h55CG57G7XG4gICAqIEBwYXJhbSB1cmwgIOaVsOaNruW6k+i/nuaOpeWtl+espuS4slxuICAgKiBAcGFyYW0gb3B0aW9ucyDov57mjqXpgInpoblcbiAgICogQHBhcmFtIG1vZE5hbWUg57uE5Lu25ZCN56ew77yM6buY6K6k5Yib5bu655qE5pWw5o2u5bqT5ZCN56ewXG4gICAqIEBwYXJhbSBkYkNvbGxlY3Rpb25zRGVmaW5lIOaVsOaNruW6k+aWueahiOWumuS5iVxuICAgKi9cbiAgY29uc3RydWN0b3IoXG4gICAgdXJsOiBzdHJpbmcsXG4gICAgb3B0aW9uczogTW9uZ29DbGllbnRPcHRpb25zLFxuICAgIG1vZE5hbWU6IHN0cmluZyxcbiAgICBkYkNvbGxlY3Rpb25zRGVmaW5lOiBUXG4gICkge1xuICAgIHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmUgPSBkYkNvbGxlY3Rpb25zRGVmaW5lO1xuICAgIHRoaXMuX3VybCA9IHVybDtcbiAgICB0aGlzLl9vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLl9tb2ROYW1lID0gbW9kTmFtZTtcbiAgfVxuICBwdWJsaWMgZ2V0TW9uZ29DbGllbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudDtcbiAgfVxuICAvKipcbiAgICog6I635Y+W5b2T5YmN5a6a5LmJ55qE5omA5pyJ5pWw5o2u5bqT6K6w5b2V6ZuGXG4gICAqL1xuICBwdWJsaWMgY29sbGVjdGlvbnMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb25zO1xuICB9XG4gIC8qKlxuICAgKiDov57mjqXliLDmlbDmja7lupMsYXN5bmMg5byC5q2l5Ye95pWwXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgY29ubmVjdCgpIHtcbiAgICBfZCgnY29ubmVjdCB0byBtb25nb2RiJyk7XG4gICAgdGhpcy5fY2xpZW50ID0gYXdhaXQgTW9uZ29DbGllbnQuY29ubmVjdCh0aGlzLl91cmwsIHRoaXMuX29wdGlvbnMpO1xuICAgIHRoaXMuX2RiID0gYXdhaXQgdGhpcy5fY2xpZW50LmRiKHRoaXMuX21vZE5hbWUpO1xuICAgIHRoaXMuX21vbml0b3JEYkV2ZW50KCk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbnMoKTtcblxuICAgIC8v5Yib5bu657Si5byVXG4gICAgXy5mb3JFYWNoKHRoaXMuX2NvbGxlY3Rpb25zLCBhc3luYyAoY29sbCwgbmFtZSkgPT4ge1xuICAgICAgYXdhaXQgdGhpcy5fZW5zdXJlQ29sbGVjdGlvbkluZGV4ZXMoXG4gICAgICAgIGNvbGwsXG4gICAgICAgIHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmVbbmFtZV0uaW5kZXhTY2hlbWFcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBfZCgnb3BlbiBtb25nb2RiIHN1Y2Nlc3NlZCcpO1xuICB9XG5cbiAgLyoqXG4gICAqIOehruiupOW9k+WJjeWumuS5ieeahOaJgOacieaVsOaNruW6k+mbhuWQiOWtmOWcqFxuICAgKiDkuI3lrZjlnKjnmoTmlbDmja7lupPlsIbooqvliJvlu7pcbiAgICog5pys57uE5Lu25Yib5bu655qE5pWw5o2u5bqT5bCG6Ieq5Yqo5Yib5bu657Si5byV77yM5bm25Yig6Zmk5pyq5a6a5LmJ57Si5byV44CCXG4gICAqIOWmguaenOe0ouW8leWumuS5ieS4uuepuu+8jOWImeS4jeWIoOmZpOe0ouW8le+8jOmYsuatouW8leeUqOWklumDqOaVsOaNruW6k+eahOe0ouW8leWGsueqgeaIluiAheaJi+WKqOWIm+W7uueahOe0ouW8leWGsueqgVxuICAgKiDmnKznu4Tku7blhoXmnKrooqvlrprkuYnnmoTmlbDmja7lupPlsIbooqvoh6rliqjph43mlrDlkb3lkI3kuLpfdW51c2VkX3h4eFxuICAgKiDlpJbpg6jmlbDmja7lupPnmoTmlbDmja7lupPlkozorrDlvZXpm4blkI3np7DlnKhfZXh0RGLkuK3lrprkuYlcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25zKCkge1xuICAgIGlmICghdGhpcy5fZGIpIHJldHVybjtcbiAgICAvLyDojrflj5blvZPliY3lrZjlnKjnmoRjb2xsc1xuICAgIGNvbnN0IGN1ckNvbGxzID0gXy5rZXlCeShhd2FpdCB0aGlzLl9kYi5jb2xsZWN0aW9ucygpLCAnY29sbGVjdGlvbk5hbWUnKTtcblxuICAgIGNvbnN0IG1vZENvbGxEZWZpbmVzID0gXy5waWNrQnkodGhpcy5fZGJDb2xsZWN0aW9uc0RlZmluZSwgdiA9PiAhXy5oYXModi5jb2xsT3B0aW9ucywgXCJfZXh0RGJcIikpXG4gICAgY29uc3QgZXh0ZXJuQ29sbERlZmluZXMgPSBfLnBpY2tCeSh0aGlzLl9kYkNvbGxlY3Rpb25zRGVmaW5lLCB2ID0+IF8uaGFzKHYuY29sbE9wdGlvbnMsIFwiX2V4dERiXCIpKVxuXG4gICAgLy8g5LiN5Zyo5a6a5LmJ5Lit55qEY29sbHPlsIbooqvph43lkb3lkI3kuLpfdW51c2VkX3h4eFxuICAgIGZvciAoY29uc3QgY29sTmFtZSBvZiBPYmplY3Qua2V5cyhjdXJDb2xscykpIHtcbiAgICAgIGlmIChtb2RDb2xsRGVmaW5lc1tjb2xOYW1lXSkge1xuICAgICAgICBfZCgnb3BlbiBleGlzdGVkIGNvbGxlY3Rpb246JywgY29sTmFtZSk7XG4gICAgICAgIC8vIOacieaViOeahGNvbGzlrprkuYnvvIzmiZPlvIBjb2xsZWN0aW9uXG4gICAgICAgIHRoaXMuX2NvbGxlY3Rpb25zW2NvbE5hbWVdID0gY3VyQ29sbHNbY29sTmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyDph43lkb3lkI3lkozmo4DmtYvml6DmlYjnmoRjb2xsZWN0aW9uXG4gICAgICAgIGlmICghY29sTmFtZS5zdGFydHNXaXRoKCdfJykpIHtcbiAgICAgICAgICBjb25zdCBuYW1lID0gJ191bnVzZWRfJyArIGNvbE5hbWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5fZGIucmVuYW1lQ29sbGVjdGlvbihjb2xOYW1lLCBuYW1lKTtcbiAgICAgICAgICBfZCgncmVuYW1lIHVudXNlZCBjb2xsZWN0aW9uOicsIG5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIF9kKCd1bnVzZWQgY29sbGVjdGlvbjonLCBjb2xOYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyDliJvlu7rmlrDnmoTlt7LlrprkuYnmqKHlnZdjb2xsc1xuICAgIGZvciAoY29uc3QgbmV3Q29sbCBvZiBfLmRpZmZlcmVuY2UoXG4gICAgICBPYmplY3Qua2V5cyhtb2RDb2xsRGVmaW5lcyksXG4gICAgICBPYmplY3Qua2V5cyhjdXJDb2xscylcbiAgICApKSB7XG4gICAgICB0aGlzLl9jb2xsZWN0aW9uc1tuZXdDb2xsXSA9IGF3YWl0IHRoaXMuX2RiLmNyZWF0ZUNvbGxlY3Rpb24oXG4gICAgICAgIG5ld0NvbGwsXG4gICAgICAgIHRoaXMuX2RiQ29sbGVjdGlvbnNEZWZpbmVbbmV3Q29sbF0uY29sbE9wdGlvbnNcbiAgICAgICk7XG4gICAgICBfZCgnY3JlYXRlIG5ldyBjb2xsZWN0aW9uOicsIG5ld0NvbGwpO1xuICAgIH1cblxuICAgIC8vIOWIm+W7uuWFtuS7luaVsOaNruW6k+S4reeahGNvbGxz77yM5LiN5L2/55SoS+S9nOS4uuWklumDqOaVsOaNruW6k+WQjeensO+8jOS9v+eUqF9leHREYueahGNvbOWQjeensFxuICAgIF8uZm9yRWFjaChleHRlcm5Db2xsRGVmaW5lcywgYXN5bmMgKHYsIGspID0+IHtcbiAgICAgIGlmICghdikgcmV0dXJuO1xuXG4gICAgICBjb25zdCBleHREYkluZm86IElFeHREYiA9IF8uZ2V0KHYsICdjb2xsT3B0aW9ucy5fZXh0RGInKTtcbiAgICAgIGlmICgoIXRoaXMuX2NsaWVudCkgfHwgKCFleHREYkluZm8pKSByZXR1cm47XG4gICAgICAvLyAvLyDmiZPlvIDlkozliJvlu7rlpJbpg6jlupNcbiAgICAgIC8vIF9kKCctLS0tY3JlYXRlIGV4dGVybiBkYiAgY29sbGVjdGlvbjonLCBkYk5hbWUsIGspO1xuICAgICAgY29uc3QgZXh0ZXJuRGIgPSB0aGlzLl9jbGllbnQuZGIoZXh0RGJJbmZvLmRiKTtcbiAgICAgIGNvbnN0IGV4dENvbGxzID0gXy5rZXlCeShhd2FpdCBleHRlcm5EYi5jb2xsZWN0aW9ucygpLCAnY29sbGVjdGlvbk5hbWUnKTtcbiAgICAgIGlmICghZXh0Q29sbHNbZXh0RGJJbmZvLmNvbF0pIHtcbiAgICAgICAgLy8g5Yib5bu6Y29sbGVjdGlvblxuICAgICAgICB0aGlzLl9jb2xsZWN0aW9uc1trXSA9IGF3YWl0IGV4dGVybkRiLmNyZWF0ZUNvbGxlY3Rpb24oZXh0RGJJbmZvLmNvbCwgXy5vbWl0KHYuY29sbE9wdGlvbnMsICdfZXh0RGInKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9jb2xsZWN0aW9uc1trXSA9IGV4dENvbGxzW2tdO1xuICAgICAgfVxuICAgICAgX2QoJ2NyZWF0ZSBleHRlcm4gY29sbGVjdGlvbiBvazonLCBleHREYkluZm8pO1xuICAgIH0pO1xuXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIF9lbnN1cmVDb2xsZWN0aW9uSW5kZXhlcyhjb2xsOiBDb2xsZWN0aW9uLCBpbmRleFNjaGVtYXM6IElOREVYX1NDSEVNQV9UKSB7XG4gICAgLy8g5paw5aKe5Yqf6IO977yM5aaC5p6c6YWN572u57Si5byV5Li656m677yM5YiZ5LiN5aSE55CG57Si5byV5L+h5oGvXG4gICAgLy8g5Li65LqG6YG/5YWN5aSa5Liq6aG555uu5omT5byA5LiA5Liq5pWw5o2u5bqT55qE5Yay56qB6Zeu6aKYXG4gICAgaWYgKF8uaXNFbXB0eShpbmRleFNjaGVtYXMpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW5kZXhzQXJyYXkgPSBhd2FpdCBjb2xsLmluZGV4ZXMoKTtcblxuICAgIGNvbnN0IGluZGV4ZXMgPSBfLmtleUJ5KGluZGV4c0FycmF5LCAnbmFtZScpO1xuICAgIF9kKCdlbnN1cmUgY29sbGVjdGlvbiBpbmRleGVzOicsIGNvbGwuY29sbGVjdGlvbk5hbWUsIE9iamVjdC5rZXlzKGluZGV4U2NoZW1hcykpO1xuXG4gICAgLy8g5Yig6Zmk6Z2e57y655yBX2lkX+eahOaXoOaViOe0ouW8lVxuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGluZGV4ZXMpKSB7XG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ19pZCcpKSBjb250aW51ZTtcbiAgICAgIGlmICghXy5pc1BsYWluT2JqZWN0KGluZGV4U2NoZW1hc1trZXldKSkge1xuICAgICAgICBhd2FpdCBjb2xsLmRyb3BJbmRleChrZXkpO1xuICAgICAgICBkZWxldGUgaW5kZXhlc1trZXldO1xuICAgICAgICBfZCgnZHJvcCBpbnZhbGlkIGluZGV4OicsIGNvbGwuY29sbGVjdGlvbk5hbWUsIGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIF9kKCdlbnN1cmUgY29sbGVjdGlvbiBpbmRleGVzIE9LOjEnLCBjb2xsLmNvbGxlY3Rpb25OYW1lLCBPYmplY3Qua2V5cyhpbmRleFNjaGVtYXMpKTtcblxuICAgIC8vIOWIm+W7uuaWsOWumuS5ieeahGluZGV4XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoaW5kZXhTY2hlbWFzKSkge1xuICAgICAgaWYgKF8uaXNFbXB0eShpbmRleGVzW2tleV0pKSB7XG4gICAgICAgIF9kKCdjcmVhdGUgbmV3IGluZGV4OicsIGNvbGwuY29sbGVjdGlvbk5hbWUsIGtleSwgaW5kZXhTY2hlbWFzW2tleV0pO1xuICAgICAgICBhd2FpdCBjb2xsLmNyZWF0ZUluZGV4KGluZGV4U2NoZW1hc1trZXldLmZpZWxkcywge1xuICAgICAgICAgIG5hbWU6IGtleSxcbiAgICAgICAgICAuLi5pbmRleFNjaGVtYXNba2V5XS5vcHRpb25zXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICB9XG5cbiAgcHJpdmF0ZSBfbW9uaXRvckRiRXZlbnQoKSB7XG4gICAgaWYgKCF0aGlzLl9kYikgcmV0dXJuO1xuICAgIC8vIOebkeWQrOS6i+S7tlxuICAgIHRoaXMuX2RiLm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIF9kKCdtb25nb2RiIGNsb3NlOicpO1xuICAgIH0pO1xuICAgIHRoaXMuX2RiLm9uKCdlcnJvcicsIGVyciA9PiB7XG4gICAgICBfZCgnbW9uZ29kYiBlcnJvcjonLCBlcnIpO1xuICAgIH0pO1xuICAgIHRoaXMuX2RiLm9uKCd0aW1lb3V0JywgKCkgPT4ge1xuICAgICAgX2QoJ21vbmdvZGIgdGltZW91dDonKTtcbiAgICB9KTtcbiAgICB0aGlzLl9kYi5vbigncmVjb25uZWN0JywgKCkgPT4ge1xuICAgICAgX2QoJ21vbmdvZGIgcmVjb25uZWN0OicpO1xuICAgIH0pO1xuICB9XG59XG4iXX0=