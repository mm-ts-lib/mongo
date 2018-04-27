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
        name: 'abcdefg',
        uid: 888
    });
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90ZXN0L2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsd0NBQStDO0FBRS9DLGdFQUF3QztBQUV4Qzs7Ozs7R0FLRztBQUNVLFFBQUEsS0FBSyxHQUFHLElBQUksYUFBSyxDQUM1QiwyQkFBMkIsRUFDM0IsRUFBRSxjQUFjLEVBQUUsU0FBUyxFQUFFLEVBQzdCLE1BQU0sRUFDTixxQkFBVyxDQUNaLENBQUM7QUFFRixNQUFNLEVBQUUsR0FBRyxhQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7QUFFL0IsQ0FBQyxLQUFLLElBQUksRUFBRTtJQUNWLFlBQVk7SUFDWixNQUFNLGFBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUV0QixNQUFNLE1BQU0sR0FBRyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2hELE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBRW5DLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7UUFDdEIsSUFBSSxFQUFFLFNBQVM7UUFDZixHQUFHLEVBQUUsR0FBRztLQUNULENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNb25nbywgRGJTY2hlbWEgfSBmcm9tICcuLi9zcmMvbW9uZ28nO1xuaW1wb3J0IHsgQ29sbGVjdGlvbiB9IGZyb20gJ21vbmdvZGInO1xuaW1wb3J0IGNvbGxlY3Rpb25zIGZyb20gJy4vY29sbGVjdGlvbnMnO1xuXG4vKipcbiAqIOmcgOimgeWbm+S4quWPguaVsFxuICogQHBhcmFtIHVybCAtICdtb25nb2RiOi8vbG9jYWxob3N0OjI3MDE3J1xuICogQHBhcmFtIG9wdGlvbnMgLSB7cmVjb25uZWN0VHJpZXM6IDk5OTk5OTk5OX1cbiAqIEBwYXJhbSBtb2ROYW1lIC0gJ3Rlc3QnXG4gKi9cbmV4cG9ydCBjb25zdCBtb25nbyA9IG5ldyBNb25nbyhcbiAgJ21vbmdvZGI6Ly9sb2NhbGhvc3Q6MjcwMTcnLFxuICB7IHJlY29ubmVjdFRyaWVzOiA5OTk5OTk5OTkgfSxcbiAgJ3Rlc3QnLFxuICBjb2xsZWN0aW9uc1xuKTtcblxuY29uc3QgZGIgPSBtb25nby5jb2xsZWN0aW9ucygpO1xuXG4oYXN5bmMgKCkgPT4ge1xuICAvLyDnrYnlvoXmlbDmja7lupPmiJDlip/ov57mjqVcbiAgYXdhaXQgbW9uZ28uY29ubmVjdCgpO1xuXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnRlc3QuZmluZCh7fSkudG9BcnJheSgpO1xuICBjb25zb2xlLmxvZygnLS1yZXN1bHQtLSEnLCByZXN1bHQpO1xuXG4gIGF3YWl0IGRiLnRlc3QuaW5zZXJ0T25lKHtcbiAgICBuYW1lOiAnYWJjZGVmZycsXG4gICAgdWlkOiA4ODhcbiAgfSk7XG59KSgpO1xuIl19