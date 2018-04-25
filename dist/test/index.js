"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongo_1 = require("../src/mongo");
const collections_1 = __importDefault(require("./collections"));
/**
 * 需要四个参数
 * @param url - 'mongodb://localhost:27017'
 * @param options - {reconnectTries: 999999999}
 * @param modName - 'test'
 */
exports.mongo = new mongo_1.Mongo('mongodb://localhost:27017', { reconnectTries: 999999999 }, 'test', collections_1.default);
const db = exports.mongo.collections();
(async () => {
    // 等待数据库成功连接
    await exports.mongo.connect();
    const result = await db.test.find({}).toArray();
    console.log('--result--!', result);
    await db.test.insertOne({
        name: 'abcdefg'
    });
})();
//# sourceMappingURL=index.js.map